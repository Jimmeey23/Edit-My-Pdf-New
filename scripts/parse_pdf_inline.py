#!/usr/bin/env python3
"""Parse a PDF into an inline-editable format.

For each page we produce:
  1. A background PNG (rendered with all text redacted — only colored blocks,
     borders, and graphics remain) as a data URL.
  2. A list of text spans with their exact position, font, size, and color —
     each span becomes an editable text element overlaid on the background.

This guarantees the document ALWAYS looks identical to the original, because
we're literally showing the original PDF (minus text) with the text placed
back on top at the exact same positions. Editing a span only changes its
text — nothing else moves.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from typing import Any

import fitz  # PyMuPDF


def _hex_color(c: int) -> str:
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    return f"#{r:02x}{g:02x}{b:02x}"


def parse_pdf_inline(path: str) -> dict[str, Any]:
    """Parse a PDF into { pages: [{ backgroundImage, width, height, spans: [...] }] }."""
    doc = fitz.open(path)
    pages: list[dict] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_w = page.rect.width
        page_h = page.rect.height

        # ---- 1. Extract all text spans with exact geometry ----
        spans: list[dict] = []
        blocks = page.get_text("dict")["blocks"]
        span_counter = 0
        for b in blocks:
            if "lines" not in b:
                continue
            for line in b["lines"]:
                # Capture line direction for rotated text (side borders)
                line_dir = line.get("dir", (1.0, 0.0))
                line_wmode = line.get("wmode", 0)
                for sp in line["spans"]:
                    text = sp.get("text", "").strip()
                    if not text:
                        continue
                    bbox = sp.get("bbox", [0, 0, 0, 0])
                    color = sp.get("color", 0)
                    font = sp.get("font", "")
                    size = sp.get("size", 0)
                    # Determine rotation: dir=(1,0) = horizontal, (0,-1) = rotated -90°, (0,1) = rotated +90°
                    rotation = 0
                    if line_dir == (0.0, -1.0):
                        rotation = -90
                    elif line_dir == (0.0, 1.0):
                        rotation = 90
                    spans.append({
                        "id": f"p{page_idx}-s{span_counter}",
                        "text": text,
                        "originalText": text,
                        "x": round(bbox[0], 2),
                        "y": round(bbox[1], 2),
                        "x2": round(bbox[2], 2),
                        "y2": round(bbox[3], 2),
                        "w": round(bbox[2] - bbox[0], 2),
                        "h": round(bbox[3] - bbox[1], 2),
                        "font": font,
                        "size": round(size, 2),
                        "color": _hex_color(color),
                        "page": page_idx,
                        "rotation": rotation,
                    })
                    span_counter += 1

        # ---- 2. Redact all text and render the background image ----
        # We re-open the doc to redact, so the original spans list isn't affected.
        red_doc = fitz.open(path)
        red_page = red_doc[page_idx]
        rblocks = red_page.get_text("dict")["blocks"]
        for b in rblocks:
            if "lines" not in b:
                continue
            for line in b["lines"]:
                for sp in line["spans"]:
                    bbox = sp.get("bbox", [0, 0, 0, 0])
                    # fill=None removes the text but doesn't paint over the
                    # background — so colored blocks remain intact.
                    red_page.add_redact_annot(bbox, fill=None)
        red_page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
        pix = red_page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
        bg_bytes = pix.tobytes("png")
        bg_b64 = base64.b64encode(bg_bytes).decode("ascii")
        bg_data_url = f"data:image/png;base64,{bg_b64}"
        bg_width = pix.width
        bg_height = pix.height
        red_doc.close()

        pages.append({
            "index": page_idx,
            "backgroundImage": bg_data_url,
            "width": bg_width,
            "height": bg_height,
            "pdfWidth": round(page_w, 2),
            "pdfHeight": round(page_h, 2),
            "scale": 2.5,  # background was rendered at 2.5x
            "spans": spans,
        })

    doc.close()
    return {
        "pages": pages,
        "sourceType": "pdf",
        "pageCount": len(pages),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse_pdf_inline.py <pdf_path>"}))
        sys.exit(1)
    data = parse_pdf_inline(sys.argv[1])
    print(json.dumps(data, indent=2, ensure_ascii=False))
