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
    subprocess.run(["pdftoppm", "-r", str(int(72 * SCALE)), "-gray", "-png", pdf, os.path.join(tmp, "p")], check=True)
    return sorted(f for f in os.listdir(tmp) if f.startswith("p") and f.endswith(".png"))

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
                words = [w.text or "" for w in ln.iter("word")]
                t = " ".join(w for w in words if w).strip()
                if t:
                    lines.append((float(ln.get("yMin")), float(ln.get("yMax")), t))
            if lines:
                blocks.append(dict(x=float(b.get("xMin")), y0=float(b.get("yMin")), y1=float(b.get("yMax")),
                                   text=" ".join(l[2] for l in lines),
                                   fy=(lines[0][0] + lines[0][1]) / 2))
        pages.append(blocks)
    return pages

def radio_filled(img, x_pt, y_pt):
    cx, cy = int(x_pt * SCALE), int(y_pt * SCALE)
    r = int(3 * SCALE)
    patch = img[max(cy - r, 0):cy + r + 1, max(cx - r, 0):cx + r + 1]
    # Unselected controls are a grey ring (min ~127); a selected one has a solid dark dot/check.
    return patch.size > 0 and int((patch < 90).sum()) >= 6

def extract(pdf):
    pages = parse(pdf)
    with tempfile.TemporaryDirectory() as tmp:
        files = render_pages(pdf, tmp)
        imgs = [np.array(Image.open(os.path.join(tmp, f)).convert("L")) for f in files]
        qs, cur, mode = [], None, None
        choice_x = None
        for pi, blocks in enumerate(pages):
            for b in blocks:
                t = b["text"].strip()
                if t in ("Listen",) or re.fullmatch(r"[\d.]+/[\d.]+ points? \((?:un)?graded\)", t):
                    continue
                m = re.fullmatch(r"Question (\d+)", t)
                if m:
                    cur = dict(n=int(m.group(1)), stem=[], choices=[], selected=[], result=None, explanation=[], page=pi + 1)
                    qs.append(cur); mode = "stem"; choice_x = None
                    continue
                if cur is None:
                    continue
                if t == "Answer":
                    mode = "expl"; continue
                if mode == "expl":
                    m = re.match(r"(Correct|Incorrect):\s*(.*)", t)
                    if m:
                        cur["result"] = m.group(1).lower()
                        if m.group(2): cur["explanation"].append(m.group(2))
                        continue
                    if t == "Submit" or re.match(r"(Correct|Incorrect|Partially correct) \(", t):
                        m2 = re.match(r"(Correct|Incorrect|Partially correct) \(", t)
                        if m2 and cur["result"] is None: cur["result"] = m2.group(1).lower()
                        continue
                    cur["explanation"].append(t)
                    continue
                # stem vs choice: choices are indented relative to the stem
                if mode == "stem" and choice_x is None and b["x"] > 100:
                    choice_x = b["x"]
                if choice_x is not None and abs(b["x"] - choice_x) < 6:
                    idx = len(cur["choices"])
                    cur["choices"].append(t)
                    if radio_filled(imgs[pi], b["x"] - 20.5, b["fy"]):
                        cur["selected"].append(idx)
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
