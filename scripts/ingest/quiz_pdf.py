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
import json, re, subprocess, sys, tempfile, os, collections
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
        lines = []
        for ln in page.iter("line"):
            words = [w for w in ln.iter("word") if not is_overlay(w) and (w.text or "").strip()]
            if not words:
                continue
            y0, y1 = float(ln.get("yMin")), float(ln.get("yMax"))
            lines.append(dict(x=float(words[0].get("xMin")), y0=y0, y1=y1, fy=(y0 + y1) / 2,
                              text=" ".join(w.text.strip() for w in words)))
        pages.append(lines)
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
POINTS = re.compile(r"^(?:[\d.]+/[\d.]+\s+)?(?:[\d.]+\s+)?points?(?:\s+possible)?(?:\s*\((?:un)?graded\))?$|^possible(?:\s*\((?:un)?graded\))?$|^\((?:un)?graded\)$")

def control_strip(img, x_pt, y0_pt, y1_pt):
    """Pixels in the strip just left of the text, over the vertical extent of one choice."""
    x0, x1 = max(int((x_pt - 32) * SCALE), 0), max(int((x_pt - 5) * SCALE), 1)
    r0, r1 = max(int(y0_pt * SCALE), 0), int(y1_pt * SCALE) + 1
    return img[r0:r1, x0:x1].astype(int)

def strip_has_control(img, x_pt, y0, y1):
    p = control_strip(img, x_pt, y0, y1)
    return p.size > 0 and int((p.mean(axis=2) < 215).sum()) >= 6

def strip_selected(img, x_pt, y0, y1):
    """A selected control has a solid dark dot/check or a saturated blue dot; an unselected one is a thin grey ring."""
    p = control_strip(img, x_pt, y0, y1)
    if p.size == 0:
        return False
    R, G, B = p[..., 0], p[..., 1], p[..., 2]
    dark = (R + G + B) / 3 < 90
    blue = (B > 170) & (R < 90) & (G < 160)
    return int((dark | blue).sum()) >= 6

def cluster_lines(lines, gap):
    """Group one page's lines into runs separated by more than `gap` points between line centres."""
    out, cur = [], []
    for l in sorted(lines, key=lambda l: l["fy"]):
        if cur and l["fy"] - cur[-1]["fy"] > gap:
            out.append(cur); cur = []
        cur.append(l)
    if cur: out.append(cur)
    return out

def split_question(q_lines, imgs):
    """q_lines: [(page_index, line)] between a 'Question N' header and its 'Answer' label.

    Returns (stem, choices, selected, hidden): `hidden` lists choices whose radio is not visible (the page footer
    overlay covers the bottom of some pages), so their selection state is unknown.
    """
    by_page = collections.OrderedDict()
    for pi, l in q_lines:
        by_page.setdefault(pi, []).append(l)
    stem, choices, selected, hidden = [], [], [], []
    for pi, ls in by_page.items():
        # wrapped lines sit ~1.4 line-heights apart, separate choices ~2 or more: split in between
        heights = sorted(l["y1"] - l["y0"] for l in ls)
        gap = 1.7 * heights[len(heights) // 2]
        first_on_page = True
        for cl in cluster_lines(ls, gap):
            x = min(l["x"] for l in cl)
            y0, y1 = cl[0]["y0"], cl[-1]["y1"]
            text = " ".join(l["text"] for l in cl)
            if strip_has_control(imgs[pi], x, y0, y1):
                choices.append(text)
                if strip_selected(imgs[pi], x, y0, y1):
                    selected.append(len(choices) - 1)
            elif choices and not first_on_page:
                choices.append(text)          # a separate group with its radio hidden behind the footer
                hidden.append(len(choices) - 1)
            elif choices:
                choices[-1] += " " + text      # a choice that wraps across a page break
            elif not stem or not (text == stem[-1] or stem[-1].endswith(text)):
                # the printouts repeat the final line of some stems (accessibility text); keep one copy
                if stem and text.startswith(stem[-1]) and len(stem[-1]) > 20:
                    stem[-1] = text            # a truncated first copy followed by the complete line
                else:
                    stem.append(text)
            first_on_page = False
    return stem, choices, selected, hidden

STOPW = set("the a an and or of to in on for with is are was were be by as at it its this that these those from which what who how can will should may must not no".split())

def _tok(t):
    return {w for w in re.findall(r"[a-z][a-z0-9']+", t.lower()) if w not in STOPW and len(w) > 2}

def resolve_hidden(q, hidden):
    """Decide the answer when some radios were hidden, using the courseware's own explanation text."""
    expl = _tok(q["explanation"])
    multi = bool(re.search(r"all that apply", q["stem"], re.I))
    def score(i):
        c = _tok(q["choices"][i])
        return len(c & expl) / max(len(c), 1)
    if not multi:
        if q["selected"]:
            return                                      # the visible dot is the answer
        cands = sorted(hidden, key=score, reverse=True)
        if len(cands) == 1 or (cands and score(cands[0]) > score(cands[1]) + 0.15):
            q["selected"] = [cands[0]]; q["answerBasis"] = "explanation"
        else:
            q["selected"] = []                          # ambiguous: left for review (skipped by the ingest)
    else:
        extra = [i for i in hidden if score(i) >= 0.6]
        q["selected"] = sorted(set(q["selected"]) | set(extra)); q["answerBasis"] = "explanation"

def extract(pdf):
    pages = parse(pdf)
    with tempfile.TemporaryDirectory() as tmp:
        files = render_pages(pdf, tmp)
        imgs = [np.array(Image.open(os.path.join(tmp, f)).convert("RGB")) for f in files]
        qs, cur, mode, region = [], None, None, []

        def close_question():
            if cur is not None and region:
                cur["_region"] = list(region)

        for pi, lines in enumerate(pages):
            for b in lines:
                t = re.sub(r"\s+", " ", FOOTER.sub(" ", b["text"])).strip()
                if not t or t in ("Listen", "Show Answer", "Submit") or POINTS.match(t):
                    continue
                m = re.fullmatch(r"Question (\d+)", t)
                if m:
                    close_question()
                    cur = dict(n=int(m.group(1)), stem=[], choices=[], selected=[], result=None, explanation=[], page=pi + 1)
                    qs.append(cur); mode = "stem"; region = []
                    continue
                if cur is None:
                    continue
                if t == "Answer":
                    mode = "expl"; close_question(); continue
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
                region.append((pi, dict(b, text=t)))
        close_question()
        for q in qs:
            stem, choices, selected, hidden = split_question(q.pop("_region", []), imgs)
            q["stem"], q["choices"], q["selected"] = stem, choices, selected
            q["_hidden"] = hidden
    for q in qs:
        q["stem"] = " ".join(q["stem"]).strip()
        q["explanation"] = " ".join(q["explanation"]).strip()
        hidden = q.pop("_hidden", [])
        if hidden:
            q["hidden"] = hidden
            resolve_hidden(q, hidden)
    return qs

if __name__ == "__main__":
    out = {}
    for pdf in sys.argv[1:]:
        out[os.path.basename(pdf)] = extract(pdf)
    json.dump(out, sys.stdout, indent=1)
