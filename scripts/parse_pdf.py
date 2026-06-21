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

# Special class note patterns — small italic text under a class line.
# The note appears at the END of the class text like "(HARRY STYLES VS JT)".
NOTE_RE = re.compile(r"\s*\(([^)]+)\)\s*$")


def _classify_highlight_color(r: int, g: int, b: int) -> str:
    """Map an RGB pixel to a theme highlight category.

    Based on the actual original PDF, the highlight colors are:
      - Strong RED (#ef4136) → sold-out (white text, no strikethrough)
      - Strong ORANGE (#e87a3c / #ec603d) → sold-out variant
      - LIME green (#cdd750) → trainer-choice (dark text)
    Everything else (peach/yellow/pastel) is too close to the cream background
    or anti-aliasing noise to reliably classify — we ignore those.
    """
    # Strong red (primary sold-out): R > 200, G < 110, B < 90
    if r > 200 and g < 110 and b < 90:
        return "sold-out"
    # Strong orange (sold-out variant): R > 220, G in 90-160, B < 90
    if r > 220 and 90 <= g <= 160 and b < 90:
        return "sold-out"
    # Lime (trainer's choice): R in 180-230, G > 210, B < 140, G > R > B
    if 180 <= r <= 240 and g > 210 and b < 140 and g > r > b:
        return "trainer-choice"
    return "none"


def _scan_row_highlights(path: str) -> list:
    """Scan every page of the PDF for solid colored row-highlight rectangles.

    Returns a list of (page_idx, x_bucket, y_start, y_end, category) tuples
    representing contiguous highlight blocks. Each block is a run of consecutive
    y-rows (within the same x_bucket) that all have the same highlight category.

    Only STRONG colors (red/orange sold-out, lime trainer-choice) are detected.
    Only the INNER content area is sampled (x in [30, 575]) to avoid the
    lime page border.
    """
    # First pass: collect per-(page, x_bucket, y_bucket) categories
    raw: dict = {}
    try:
        d = fitz.open(path)
        for page_idx in range(min(2, len(d))):
            p = d[page_idx]
            pix = p.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            pw, ph = pix.width, pix.height
            x_start = int(30 * 1.5)
            x_end = int((p.rect.width - 30) * 1.5)
            for pdf_y in range(300, 820, 2):
                pix_y = int(pdf_y * 1.5)
                if pix_y >= ph - 30:
                    continue
                col_colors: dict = {}
                for pix_x in range(x_start, x_end, 4):
                    c = pix.pixel(pix_x, pix_y)
                    if not (isinstance(c, (list, tuple)) and len(c) >= 3):
                        continue
                    r, g, b = c[0], c[1], c[2]
                    cat = _classify_highlight_color(r, g, b)
                    if cat != "none":
                        pdf_x = pix_x / 1.5
                        x_bucket = round(pdf_x / 60) * 60
                        col_colors.setdefault((x_bucket, cat), 0)
                        col_colors[(x_bucket, cat)] += 1
                for (x_bucket, cat), count in col_colors.items():
                    if count >= 8:
                        y_bucket = round(pdf_y / 4) * 4
                        raw[(page_idx, x_bucket, y_bucket)] = cat
        d.close()
    except Exception:
        pass

    # Second pass: merge consecutive y-buckets into contiguous blocks
    blocks: list = []
    # Group by (page, x_bucket) and sort by y
    by_col: dict = {}
    for (page, xb, yb), cat in raw.items():
        by_col.setdefault((page, xb), []).append((yb, cat))
    for (page, xb), items in by_col.items():
        items.sort()
        cur_start = None
        cur_end = None
        cur_cat = None
        for yb, cat in items:
            if cur_cat == cat and cur_end is not None and yb - cur_end <= 6:
                # Extend current block
                cur_end = yb
            else:
                # Flush previous
                if cur_cat is not None:
                    blocks.append((page, xb, cur_start, cur_end, cur_cat))
                cur_start = yb
                cur_end = yb
                cur_cat = cat
        if cur_cat is not None:
            blocks.append((page, xb, cur_start, cur_end, cur_cat))
    return blocks


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

    # Pre-scan all pages for pastel row-highlight rectangles so we can later
    # map each class row to its highlight category by y-coordinate.
    row_highlights = _scan_row_highlights(path)

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

    # ---------- 3b. Tagline ----------
    # Small uppercase text near the date, typically with "SPECIAL" or "EDITION" in it,
    # or any small Montserrat text right under the date.
    tagline = ""
    for s in spans:
        if s["size"] <= 6 and 4 <= s["size"] and re.search(r"[A-Z]{2,}", s["text"]) and len(s["text"]) < 80:
            # Look for "SPECIAL" or similar event-style words
            if re.search(r"\b(SPECIAL|EDITION|EXCLUSIVE|THEME|WEEK|NIGHT)\b", s["text"], re.I):
                tagline = s["text"]
                break
    if not tagline:
        # Fallback: any tiny text under the date area (y between 195 and 230)
        date_y = None
        for s in spans:
            if s["text"] == date_range:
                date_y = s["y"]
                break
        if date_y is not None:
            for s in spans:
                if date_y < s["y"] < date_y + 30 and s["size"] <= 7 and len(s["text"]) > 5 and s["text"].isupper():
                    tagline = s["text"]
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

        # Define the column boundary tightly around this day header.
        # The original PDF has 2 columns per page: left column x in [40, 290],
        # right column x in [310, 570]. We use the day header's x to decide
        # which column we're in, then bound x_min/x_max to that column only.
        if ds["x"] < 200:
            # Left column
            x_min = 30
            x_max = 295
        else:
            # Right column
            x_min = 305
            x_max = 575
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
            and s["x"] >= x_min
            and s["x"] <= x_max
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
                    rows.append({"time": current_time, "class": " ".join(current_class_parts), "y": current_y or 0})
                current_time = s["text"].strip()
                current_class_parts = []
                current_y = s["y"]
            else:
                if current_time is not None and (current_y is None or abs(s["y"] - current_y) < 6):
                    current_class_parts.append(s["text"])
        if current_time and current_class_parts:
            rows.append({"time": current_time, "class": " ".join(current_class_parts), "y": current_y or 0})

        classes: list[dict] = []
        for r in rows:
            cls_text = _norm(r["class"])
            # Extract note like "(HARRY STYLES VS JT)" if present
            note = ""
            note_match = NOTE_RE.search(cls_text)
            if note_match:
                note = note_match.group(1).strip()
                cls_text = _norm(NOTE_RE.sub("", cls_text))

            m = re.match(r"^(.+?)\s*[-–—]\s*([A-Za-z][A-Za-z\s.'-]*)$", cls_text)
            if m:
                cls_name = _norm(m.group(1))
                instr = _norm(m.group(2))
            else:
                cls_name = cls_text
                instr = ""

            # Detect highlight: find a highlight block whose y-range CONTAINS
            # this class's y position (with a small margin to avoid edge cases
            # where one class's highlight block touches the next class's row).
            highlight = "none"
            cls_y = r.get("y", 0)
            cls_x = None
            for s in col_spans:
                if abs(s["y"] - cls_y) < 6 and s["text"].strip() and not TIME_RE.match(s["text"]):
                    cls_x = s["x"]
                    break
            if cls_x is not None:
                x_bucket = round(cls_x / 60) * 60
                # A class is highlighted only if its y is well inside a block
                # (at least 4pt from the block's edges) — this prevents a tall
                # highlight block from bleeding into the adjacent class row.
                for (bpage, bxb, bys, bye, bcat) in row_highlights:
                    if bpage != ds["page"]:
                        continue
                    if abs(bxb - x_bucket) > 60:  # not in this column
                        continue
                    if bcat == "none":
                        continue
                    # Require the class y to be in the middle 70% of the block
                    block_h = bye - bys
                    if block_h <= 0:
                        continue
                    margin = max(2, block_h * 0.15)
                    if bys + margin <= cls_y <= bye - margin:
                        highlight = bcat
                        break
            # Fallback: white text → sold-out
            if highlight == "none":
                for s in col_spans:
                    if abs(s["y"] - cls_y) < 6 and s["text"].strip() and s["color"].lower() in ("#ffffff", "#fff"):
                        highlight = "sold-out"
                        break

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
                "highlight": highlight,
                "note": note,
            })

        days.append({
            "id": f"day-{len(days)+1}",
            "name": ds["text"].upper(),
            "classes": classes,
        })

    # ---------- 7. Theme ----------
    # Sample multiple pixels to detect:
    #   - topBandBg (lime band at the very top of the page)
    #   - main background (cream)
    #   - accent (italic date color, from spans)
    #   - soldOutBg (red/orange solid color used for sold-out class rows)
    bg = "#efeede"
    top_band_bg = "#cdd750"
    sold_out_bg = "#ef4136"  # original PDF uses strong red

    try:
        d2 = fitz.open(path)
        p = d2[0]
        pix = p.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
        pw, ph = pix.width, pix.height

        def _hex_at(x: int, y: int) -> str:
            try:
                c = pix.pixel(x, y)
                if isinstance(c, (list, tuple)) and len(c) >= 3:
                    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"
            except Exception:
                pass
            return "#ffffff"

        # Top band color = sample just below the very top edge, in the middle.
        top_band_bg = _hex_at(pw // 2, int(5 * 1.5))

        # Main background = sample the area just below the title text, to the
        # left of the date (PDF y ~ 220, x ~ 150 in original coords → mid-page).
        bg = _hex_at(int(150 * 1.5), int(220 * 1.5))
        if bg.lower().startswith("#d0") or bg.lower().startswith("#c5"):
            bg = _hex_at(int(300 * 1.5), int(700 * 1.5))

        d2.close()
    except Exception:
        pass

    accent = top_band_bg  # the date text color matches the top band
    for s in spans:
        if "IvyPresto" in s["font"] or "Italic" in s["font"]:
            accent = s["color"]
            break

    theme = {
        "background": bg,
        "topBandBg": top_band_bg,
        "primaryText": "#121213",
        "bodyText": "#231f20",
        "mutedText": "#181818",
        "accent": accent,
        "accentText": "#121213",
        "bandColors": {
            "BEGINNER": top_band_bg,
            "INTERMEDIATE": "#efefdf",
            "ADVANCED": "#f3c969",
        },
        "soldOutBg": sold_out_bg,
        "soldOutText": "#ffffff",
        "trainerChoiceBg": top_band_bg,
        "cardBg": bg,
        "cardBorder": "#00000022",
        "fontFamilyHeading": "Agrandir, Inter, system-ui, sans-serif",
        "fontFamilyBody": "Montserrat, Inter, system-ui, sans-serif",
        "fontFamilyDisplay": "IvyPresto Display, Playfair Display, Georgia, serif",
        "fontFamilyTicker": "Sweet Sans Pro, Inter, system-ui, sans-serif",
    }

    # ---------- Sort days by canonical week order ----------
    day_order = {n: i for i, n in enumerate(DAY_NAMES)}
    days.sort(key=lambda d: day_order.get(d["name"], 99))

    return {
        "studioName": studio_name,
        "location": location or "STUDIO",
        "dateRange": date_range or "",
        "tagline": tagline,
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
