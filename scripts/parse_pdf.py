#!/usr/bin/env python3
"""Parse a weekly-studio-schedule PDF into a clean structured JSON.

Approach:
  1. Use PyMuPDF for raw text spans (font, size, color, bbox)
  2. Bucket spans by position into logical groups
  3. De-duplicate noisy class-level rows (the ticker marquee repeats them)
  4. Render page to PNG (for VLM fallback / preview thumbnail)

Output JSON written to stdout. Designed to be invoked from the Next.js
API route via: python3 scripts/parse_pdf.py <pdf_path>
"""
from __future__ import annotations

import json
import re
import sys
from typing import Any

import fitz  # PyMuPDF


# ---------- helpers ----------

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _hex_color(c: int) -> str:
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    return f"#{r:02x}{g:02x}{b:02x}"


TIME_RE = re.compile(r"^\s*(\d{1,2}:\d{2}\s*[AP]M)\s*$", re.IGNORECASE)
DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]


def _looks_like_real_class_level_row(text: str) -> bool:
    """Filter out the marquee/ticker text that repeats the class-level prefix."""
    # Real rows are short (< 120 chars), don't contain bullet separators,
    # and don't repeat the same level name twice.
    if "•" in text:
        return False
    if len(text) > 140:
        return False
    # Count occurrences of "BEGINNER"/"INTERMEDIATE"/"ADVANCED"
    counts = sum(1 for k in ["BEGINNER", "INTERMEDIATE", "ADVANCED"] if k in text.upper())
    if counts > 1:
        return False
    return True


# ---------- main parse ----------

def parse_pdf(path: str) -> dict[str, Any]:
    doc = fitz.open(path)
    page = doc[0]
    page_w, page_h = page.rect.width, page.rect.height

    # Collect spans (merge up to 2 pages)
    spans: list[dict] = []
    for page_idx in range(min(2, len(doc))):
        p = doc[page_idx]
        blocks = p.get_text("dict")["blocks"]
        for b in blocks:
            if "lines" not in b:
                continue
            for line in b["lines"]:
                for sp in line["spans"]:
                    t = _norm(sp.get("text", ""))
                    if not t:
                        continue
                    bbox = sp.get("bbox", [0, 0, 0, 0])
                    spans.append({
                        "text": t,
                        "font": sp.get("font", ""),
                        "size": round(sp.get("size", 0), 2),
                        "color": _hex_color(sp.get("color", 0)),
                        "x": round(bbox[0], 2),
                        "y": round(bbox[1], 2),
                        "x2": round(bbox[2], 2),
                        "y2": round(bbox[3], 2),
                        "page": page_idx,
                    })
    doc.close()

    # ---------- 1. Studio name ----------
    # Look for adjacent "STUDIO" + "SCHEDULE" spans (large bold font)
    studio_name = "STUDIO SCHEDULE"
    big_upper_spans = [s for s in spans if s["size"] >= 20 and s["text"].isupper()]
    for i, s in enumerate(big_upper_spans):
        if s["text"] == "STUDIO":
            # Look for "SCHEDULE" nearby (same column, just below)
            for s2 in big_upper_spans[i + 1:i + 6]:
                if s2["text"] == "SCHEDULE" and abs(s2["x"] - s["x"]) < 30 and 0 < (s2["y"] - s["y"]) < 60:
                    studio_name = "STUDIO SCHEDULE"
                    break
            else:
                continue
            break

    # ---------- 2. Location ----------
    # Pick the largest non-studio, non-date text on page 0
    location = ""
    big = [
        s for s in spans
        if s["size"] >= 12
        and s["text"] not in ("STUDIO", "SCHEDULE")
        and "IvyPresto" not in s["font"]
        and "Italic" not in s["font"]
        and s["text"].upper() not in DAY_NAMES
        and not TIME_RE.match(s["text"])
        and "•" not in s["text"]
        and not re.match(r"^(BEGINNER|INTERMEDIATE|ADVANCED)\s*[:\-]", s["text"], re.I)
    ]
    big.sort(key=lambda s: -s["size"])
    if big:
        # Prefer text that's not part of the studio/date area
        for s in big:
            if s["text"].upper() not in ("STUDIO SCHEDULE",):
                location = s["text"]
                break
    if not location and big:
        location = big[0]["text"]

    # ---------- 3. Date range ----------
    date_range = ""
    for s in spans:
        if re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b", s["text"], re.I) and re.search(r"\d{4}", s["text"]):
            date_range = s["text"]
            break
    if not date_range:
        for s in spans:
            if re.search(r"\d{1,2}(st|nd|rd|th)", s["text"], re.I):
                date_range = s["text"]
                break

    # ---------- 4. Class-level rows (de-duplicated) ----------
    class_levels: list[dict] = []
    seen_class_sets: set[tuple] = set()
    for s in spans:
        if not _looks_like_real_class_level_row(s["text"]):
            continue
        m = re.match(r"^\s*(BEGINNER|INTERMEDIATE|ADVANCED)\s*[:\-]\s*(.+)$", s["text"], re.I)
        if not m:
            continue
        lvl = m.group(1).upper()
        rest = m.group(2)
        items = [x.strip() for x in re.split(r",|\band\b", rest) if x.strip()]
        # Skip noise: items with • in them
        items = [it for it in items if "•" not in it]
        if not items:
            continue
        # Skip if items look like the marquee ("CARDIO BARREARRE")
        if any("ARREARRE" in it.upper() for it in items):
            continue
        # Skip suspicious fragments: a real row has at least 1 item, each item
        # at least 4 chars, and total row length >= 12
        items = [it for it in items if len(it) >= 3]
        if not items or len(items) < 1:
            continue
        if sum(len(it) for it in items) < 10:
            continue
        # Dedupe by (level, frozenset(items))
        key = (lvl, frozenset(items))
        if key in seen_class_sets:
            continue
        seen_class_sets.add(key)
        class_levels.append({"level": lvl, "classes": items})

    # ---------- 5. Ticker bands ----------
    ticker: list[dict] = []
    seen_ticker: set[str] = set()
    for s in spans:
        t = s["text"]
        if "•" in t and ("FOUNDATION" in t.upper() or "INTERMEDIATE" in t.upper() or "BEGINNER" in t.upper() or "ADVANCED" in t.upper()):
            # Get the first "phrase" before the first "•" — that's the canonical band
            phrase = t.split("•")[0].strip()
            key = re.sub(r"\s+", "", phrase.upper())
            if key in seen_ticker or not phrase:
                continue
            seen_ticker.add(key)
            # Clean "BARREARRE" → "BARRE"
            clean = re.sub(r"ARREARRE", "ARRE", phrase)
            ticker.append({
                "text": clean,
                "textColor": s["color"],
                "bgColor": "transparent",
                "fontSize": round(s["size"], 1),
                "italic": False,
            })

    # ---------- 6. Day columns + class rows ----------
    day_spans = [
        s for s in spans
        if s["text"].upper().strip() in DAY_NAMES and s["size"] >= 12
    ]
    day_spans.sort(key=lambda s: (s["page"], s["x"], s["y"]))

    days: list[dict] = []
    seen_day_names: set[str] = set()
    for idx, ds in enumerate(day_spans):
        # Skip duplicate day headers on page 2 (continuation)
        day_key = ds["text"].upper()
        if day_key in seen_day_names:
            continue
        seen_day_names.add(day_key)

        x_min = ds["x"] - 5
        x_max = ds["x2"] + 80
        y_top = ds["y2"] + 2
        next_y = None
        for nd in day_spans[idx + 1:]:
            if nd["page"] == ds["page"] and abs(nd["x"] - ds["x"]) < 40 and nd["y"] > ds["y"]:
                next_y = nd["y"]
                break
        col_spans = [
            s for s in spans
            if s["page"] == ds["page"]
            and s["y"] >= y_top
            and (next_y is None or s["y"] < next_y)
            and s["x"] >= x_min - 20
            and s["x"] <= x_max + 60
            and s["text"].upper() not in DAY_NAMES
        ]
        col_spans.sort(key=lambda s: (s["y"], s["x"]))

        # Group spans into rows by clustering on y (any two spans within 5pt
        # of an existing cluster join that cluster).
        clusters: list[list[dict]] = []
        for s in col_spans:
            placed = False
            for cl in clusters:
                if abs(cl[0]["y"] - s["y"]) <= 5:
                    cl.append(s)
                    placed = True
                    break
            if not placed:
                clusters.append([s])
        clusters.sort(key=lambda cl: cl[0]["y"])
        # Re-flatten in row order, but within a row put TIME spans first
        # so we always know which time a class-line belongs to.
        ordered: list[dict] = []
        for cl in clusters:
            times = [s for s in cl if TIME_RE.match(s["text"])]
            others = [s for s in cl if not TIME_RE.match(s["text"])]
            others.sort(key=lambda s: s["x"])
            ordered.extend(times + others)

        rows: list[dict] = []
        current_time = None
        current_class_parts: list[str] = []
        current_y = None
        for s in ordered:
            if TIME_RE.match(s["text"]):
                if current_time and current_class_parts:
                    rows.append({"time": current_time, "class": " ".join(current_class_parts)})
                current_time = s["text"].strip()
                current_class_parts = []
                current_y = s["y"]
            else:
                if current_time is not None and (current_y is None or abs(s["y"] - current_y) < 6):
                    current_class_parts.append(s["text"])
        if current_time and current_class_parts:
            rows.append({"time": current_time, "class": " ".join(current_class_parts)})

        classes: list[dict] = []
        for r in rows:
            cls_text = _norm(r["class"])
            m = re.match(r"^(.+?)\s*[-–—]\s*([A-Za-z][A-Za-z\s.'-]*)$", cls_text)
            if m:
                cls_name = _norm(m.group(1))
                instr = _norm(m.group(2))
            else:
                cls_name = cls_text
                instr = ""
            lvl = "BEGINNER"
            cu = cls_name.upper()
            if any(k in cu for k in ["CARDIO BARRE PLUS", "HIIT", "AMPED", "STRENGTH LAB", "BACK BODY BLAZE", "FIT"]):
                lvl = "INTERMEDIATE"
            if any(k in cu for k in ["ADVANCED", "AMPED UP"]):
                lvl = "ADVANCED"
            classes.append({
                "id": f"{ds['text']}-{len(classes)+1}",
                "time": r["time"],
                "className": cls_name,
                "instructor": instr,
                "level": lvl,
            })

        days.append({
            "id": f"day-{len(days)+1}",
            "name": ds["text"].upper(),
            "classes": classes,
        })

    # ---------- 7. Theme ----------
    bg = "#ffffff"
    try:
        d2 = fitz.open(path)
        p = d2[0]
        pix = p.get_pixmap(matrix=fitz.Matrix(0.2, 0.2))
        sample = pix.pixel(2, 2)
        if isinstance(sample, (list, tuple)) and len(sample) >= 3:
            bg = f"#{sample[0]:02x}{sample[1]:02x}{sample[2]:02x}"
        d2.close()
    except Exception:
        pass

    accent = "#cdd750"
    for s in spans:
        if "IvyPresto" in s["font"] or "Italic" in s["font"]:
            accent = s["color"]
            break

    theme = {
        "background": bg,
        "primaryText": "#121213",
        "bodyText": "#231f20",
        "mutedText": "#181818",
        "accent": accent,
        "accentText": "#121213",
        "bandColors": {
            "BEGINNER": "#cdd750",
            "INTERMEDIATE": "#efefdf",
            "ADVANCED": "#f3c969",
        },
        "cardBg": bg,
        "cardBorder": "#00000022",
        "fontFamilyHeading": "Agrandir, Inter, system-ui, sans-serif",
        "fontFamilyBody": "Montserrat, Inter, system-ui, sans-serif",
        "fontFamilyDisplay": "IvyPresto Display, Playfair Display, Georgia, serif",
    }

    # ---------- Sort days by canonical week order ----------
    day_order = {n: i for i, n in enumerate(DAY_NAMES)}
    days.sort(key=lambda d: day_order.get(d["name"], 99))

    return {
        "studioName": studio_name,
        "location": location or "STUDIO",
        "dateRange": date_range or "",
        "tagline": "",
        "tickerBands": ticker[:3] if ticker else [],
        "classLevels": class_levels,
        "days": days,
        "theme": theme,
        "meta": {
            "sourceType": "pdf",
            "pageWidth": round(page_w, 2),
            "pageHeight": round(page_h, 2),
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_pdf.py <pdf_path>"}))
        sys.exit(1)
    data = parse_pdf(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))
