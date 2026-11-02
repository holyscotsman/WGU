#!/usr/bin/env python3
"""Extract graded quiz questions from WGU courseware quiz PDFs (Acrobatiq/edX style printouts).

The selected answer is drawn as a vector shape, so it is detected from rendered pixels.
Output is a JSON list of candidate questions for human review, not final content:
  selected: indexes of the filled radios/checkboxes
  result:   "correct" | "incorrect" | None (as printed by the courseware)
  explanation: the courseware's own text
For "correct" results the answer is the selected choice. For "incorrect" results the answer is
unknown from the shape alone and is left null for review against the explanation.
"""
import json, re, subprocess, sys, tempfile, os
import xml.etree.ElementTree as ET
from PIL import Image
import numpy as np

SCALE = 2.0  # render at 144 dpi

def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout

def render_pages(pdf, tmp):
    subprocess.run(["pdftoppm", "-r", str(int(72 * SCALE)), "-png", pdf, os.path.join(tmp, "p")], check=True)
    return sorted(f for f in os.listdir(tmp) if f.startswith("p") and f.endswith(".png"))

FOOT_WORDS = {"ADA", "Accommodation", "Privacy", "Policy", "|", "Terms", "of", "Service", "Honor", "Code", "©", "2020",
              "Western", "Governors", "University", "–", "WGU.", "All", "rights", "reserved."}

def is_overlay(w):
    """Page-footer and button text printed over the question text (larger font, interleaved word by word)."""
    t, h, x = (w.text or ""), float(w.get("yMax")) - float(w.get("yMin")), float(w.get("xMin"))
    if t == "Submit":
        return True
    if h >= 15 and (t in FOOT_WORDS or t == "Show" or (t == "Answer" and x > 60)):
        return True
    return False

def parse(pdf):
    xml = run(["pdftotext", "-bbox-layout", pdf, "-"])
    xml = re.sub(r'<!DOCTYPE[^>]*>', '', xml).replace('xmlns="http://www.w3.org/1999/xhtml"', '')
    root = ET.fromstring(xml)
    pages = []
    for page in root.iter("page"):
        blocks = []
        for b in page.iter("block"):
            lines = []
            for ln in b.iter("line"):
                words = [w.text or "" for w in ln.iter("word") if not is_overlay(w)]
                t = " ".join(w for w in words if w).strip()
                if t:
                    lines.append((float(ln.get("yMin")), float(ln.get("yMax")), t))
            if lines:
                blocks.append(dict(x=float(b.get("xMin")), y0=float(b.get("yMin")), y1=float(b.get("yMax")),
                                   text=" ".join(l[2] for l in lines),
                                   fy=(lines[0][0] + lines[0][1]) / 2))
        pages.append(blocks)
    return pages

def radio_filled(img, text_x_pt, y_pt):
    """True if a filled radio/checkbox sits just left of the choice text.

    Scans the strip left of the text so it works across printout layouts. An unselected control is a thin
    grey ring; a selected one has a solid dark dot (black) or a saturated blue dot.
    """
    x0, x1 = int((text_x_pt - 32) * SCALE), int((text_x_pt - 5) * SCALE)
    cy, r = int(y_pt * SCALE), int(4 * SCALE)
    patch = img[max(cy - r, 0):cy + r + 1, max(x0, 0):max(x1, 1)].astype(int)
    if patch.size == 0:
        return False
    R, G, B = patch[..., 0], patch[..., 1], patch[..., 2]
    dark = (R + G + B) / 3 < 90
    blue = (B > 170) & (R < 90) & (G < 160)
    return int((dark | blue).sum()) >= 6

FOOTER = re.compile(r"ADA Accommodation|Privacy Policy \| Terms of Service \| Honor Code|© \d{4} Western Governors University[^.]*\. All rights reserved\.?")

def has_control(img, text_x_pt, y_pt):
    """True if any radio/checkbox glyph (ring or dot) sits just left of the text line."""
    x0, x1 = int((text_x_pt - 32) * SCALE), int((text_x_pt - 5) * SCALE)
    cy, r = int(y_pt * SCALE), int(4 * SCALE)
    patch = img[max(cy - r, 0):cy + r + 1, max(x0, 0):max(x1, 1)].astype(int)
    return patch.size > 0 and int((patch.mean(axis=2) < 215).sum()) >= 6

def extract(pdf):
    pages = parse(pdf)
    with tempfile.TemporaryDirectory() as tmp:
        files = render_pages(pdf, tmp)
        imgs = [np.array(Image.open(os.path.join(tmp, f)).convert("RGB")) for f in files]
        qs, cur, mode = [], None, None
        for pi, blocks in enumerate(pages):
            for b in blocks:
                t = FOOTER.sub(" ", b["text"]).strip()
                t = re.sub(r"\s+", " ", t)
                if not t or t in ("Listen", "Show Answer", "Submit") or re.fullmatch(r"[\d.]+/[\d.]+ points? \((?:un)?graded\)|[\d.]+ points? possible \((?:un)?graded\)", t):
                    continue
                m = re.fullmatch(r"Question (\d+)", t)
                if m:
                    cur = dict(n=int(m.group(1)), stem=[], choices=[], selected=[], result=None, explanation=[], page=pi + 1)
                    qs.append(cur); mode = "stem"
                    continue
                if cur is None:
                    continue
                if t == "Answer":
                    mode = "expl"; continue
                if mode == "expl":
                    m = re.match(r"(Correct|Incorrect):\s*(.*)", t)
                    if m:
                        cur["result"] = cur["result"] or m.group(1).lower()
                        if m.group(2): cur["explanation"].append(m.group(2))
                        continue
                    m2 = re.match(r"(Correct|Incorrect|Partially correct) \(", t)
                    if m2:
                        if cur["result"] is None: cur["result"] = m2.group(1).lower()
                        continue
                    cur["explanation"].append(t)
                    continue
                # stem phase: a line with a radio/checkbox to its left starts a choice; unmarked lines after the
                # first choice continue it, and unmarked lines before it belong to the stem
                if has_control(imgs[pi], b["x"], b["fy"]):
                    cur["choices"].append(t)
                    if radio_filled(imgs[pi], b["x"], b["fy"]):
                        cur["selected"].append(len(cur["choices"]) - 1)
                elif cur["choices"]:
                    cur["choices"][-1] += " " + t
                elif cur["stem"] and t.startswith(cur["stem"][-1]) and len(cur["stem"][-1]) > 20:
                    cur["stem"][-1] = t  # a truncated first copy followed by the complete line
                elif not cur["stem"] or not (t == cur["stem"][-1] or cur["stem"][-1].endswith(t)):
                    # the printouts repeat the final line of some stems (accessibility text); keep one copy
                    cur["stem"].append(t)
    for q in qs:
        q["stem"] = " ".join(q["stem"]).strip()
        q["explanation"] = " ".join(q["explanation"]).strip()
    return qs

if __name__ == "__main__":
    out = {}
    for pdf in sys.argv[1:]:
        out[os.path.basename(pdf)] = extract(pdf)
    json.dump(out, sys.stdout, indent=1)
