#!/usr/bin/env python3
"""Convert a WGU courseware lesson PDF to Markdown (verbatim text, light structural cleanup)."""
import re, subprocess, sys
import xml.etree.ElementTree as ET

DROP = re.compile(r"^(Listen|▶ Image description|©\d{4} Western Governors University.*)$")
SENT_END = (".", "!", "?", ":", '"', "”", ")")
HEAD_MAX = 64

FOOT_WORDS = {"ADA", "Accommodation", "Privacy", "Policy", "|", "Terms", "of", "Service", "Honor", "Code", "©", "WGU", "WGU.",
              "Western", "Governors", "University", "–", "All", "rights", "reserved.", "Rights", "Reserved."}

def pdf_text(path):
    """Page text with the page-footer overlay removed, rebuilt from word coordinates.

    The footer is drawn in a larger font inside one vertical band and its words are interleaved with body words
    on the same lines. Words in that band that belong to its fixed vocabulary are dropped, so headings and body
    text elsewhere are untouched. Lines are rebuilt from y positions; a gap of ~2 line heights starts a paragraph.
    """
    xml = subprocess.run(["pdftotext", "-bbox", path, "-"], check=True, capture_output=True, text=True).stdout
    xml = re.sub(r"<!DOCTYPE[^>]*>", "", xml).replace('xmlns="http://www.w3.org/1999/xhtml"', "")
    root = ET.fromstring(xml)
    out = []
    for page in root.iter("page"):
        words = [(w.text or "", float(w.get("xMin")), float(w.get("yMin")), float(w.get("yMax"))) for w in page.iter("word")]
        foot = [(a, b) for t, _, a, b in words if t in ("Accommodation", "Honor", "Privacy", "Terms") and b - a >= 15]
        band = (min(a for a, _ in foot) - 28, max(b for _, b in foot) + 24) if foot else None
        keep = [(t, x, a, b) for t, x, a, b in words
                if t.strip() and not (band and t in FOOT_WORDS and b - a >= 15 and band[0] <= a and b <= band[1])]
        keep.sort(key=lambda w: ((w[2] + w[3]) / 2, w[1]))
        lines, cur = [], []
        for w in keep:
            yc = (w[2] + w[3]) / 2
            if cur and abs(yc - cur[-1][4]) > 0.5 * (w[3] - w[2]):
                lines.append(cur); cur = []
            cur.append(w + (yc,))
        if cur: lines.append(cur)
        heights = sorted(l[0][3] - l[0][2] for l in lines) or [12]
        h = heights[len(heights) // 2]
        prev = None
        for l in lines:
            l.sort(key=lambda w: w[1])
            yc = l[0][4]
            if prev is not None and yc - prev > 1.75 * h:
                out.append("")
            out.append(" ".join(w[0] for w in l))
            prev = yc
        if out and not re.search(r"[.!?:]$", out[-1]):
            pass                      # a paragraph may continue on the next page
        else:
            out.append("")
    return "\n".join(out)

def clean(l):
    l = re.sub(r"[- ​]", " ", l)  # private-use icon glyphs, nbsp
    return re.sub(r"\s+", " ", l).strip()

CREDIT = re.compile(r"(via Getty Images|Getty Images Plus|\bShutterstock\b|\biStock\b|/Alamy|Adobe Stock)\S*\s*$|^Photo by |/Text (color )?changed$")
FRAGMENT = re.compile(r"©\s*\d{4} Western Governors University – WGU\.? ?(All( [Rr]ights [Rr]eserved\.?)?)?|Privacy Policy \| Terms of Service( \| Honor Code)?|ADA Accommodation")
COPYRIGHT = re.compile(r"^©\s*\d{4} Western Governors University")
JUNK_LINE = re.compile(r"^(QUOTE|Listen|▶ Image description)$")

INLINE_CREDIT = re.compile(r"[^.!?]{2,70}?\s+via Getty Images\.?(?:/Text (?:color )?(?:changed|removed))?")
INLINE_FRAGMENT = re.compile(r"▶ Image description|©\s*\d{4}\s+Western(?: Governors University)?(?: – WGU\.?)?(?: All [Rr]ights [Rr]eserved\.?)?")

def inline_clean(t):
    """Credits and footers that ended up inside a paragraph (figure text shares lines with body text)."""
    t = INLINE_CREDIT.sub(" ", t)
    t = INLINE_FRAGMENT.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()

def strip_page_junk(raw_lines):
    """Remove photo credits and their captions, image-description blocks, page footers and widget labels."""
    blocks, cur = [], []
    for l in raw_lines + [""]:
        if l == "":
            if cur: blocks.append(cur); cur = []
        else:
            cur.append(l)
    out, skipping = [], False
    for block in blocks:
        kept = []
        for j, l in enumerate(block):
            if skipping:
                if COPYRIGHT.match(l): skipping = False
                continue
            if l in ("Image description", "▶ Image description"):
                skipping = True; continue
            if JUNK_LINE.match(l) or COPYRIGHT.match(l):
                continue
            l = FRAGMENT.sub(" ", l)
            l = re.sub(r"\s+", " ", l).strip()
            if not l:
                continue
            if CREDIT.search(l):
                # the caption is the block's lines before the credit when they are a short, self-contained run
                head = kept[:]
                if len(head) <= 3 and sum(len(h) for h in head) <= 250 and head and head[0][:1].isupper() and head[-1].endswith("."):
                    kept = []
                l = CREDIT.sub("", l).strip()
                if l and not l.endswith("."):
                    pass
                continue
            kept.append(l)
        if kept:
            out.extend(kept); out.append("")
    return out

def to_markdown(path, title):
    lines = strip_page_junk([clean(l) for l in pdf_text(path).replace("\f", "\n").split("\n")])
    # collapse leading/duplicate blanks
    out = [f"# {title}", ""]
    para = []
    def flush():
        nonlocal para
        if para:
            text = inline_clean(" ".join(para))
            if text:
                out.extend([text, ""])
            para = []
    n = len(lines)
    i = 0
    while i < n:
        l = lines[i]
        if l == "":
            flush(); i += 1; continue
        prev = lines[i - 1] if i > 0 else ""
        nxt = lines[i + 1] if i + 1 < n else ""
        prev_closed = (not para) or para[-1].endswith(SENT_END)
        is_head = (len(l) <= HEAD_MAX and not l.endswith((".", "!", "?", ":", ",", ";", '"', "”")) and l[0].isupper()
                   and prev_closed and (nxt == "" or nxt[0].isupper()) and not l.endswith(("and", "or", "of", "the")))
        if is_head:
            flush()
            out.extend([("### " if l.lower() == "essential question" else "## ") + l, ""])
            i += 1; continue
        para.append(l)
        i += 1
        # learning objectives: one sentence per line after the lead-in
        if l.endswith(":") and re.search(r"learning objectives", l, re.I) and i < n and lines[i].endswith("."):
            flush()
            while i < n and lines[i] and lines[i].endswith("."):
                out.append(f"- {lines[i]}"); i += 1
            out.append("")
            continue
        # bullet run after a line ending with ":"
        if l.endswith(":") and i < n and lines[i] and len(lines[i]) < 70 and not lines[i].endswith("."):
            flush()
            while i < n and lines[i] and len(lines[i]) < 70 and not lines[i].endswith("."):
                out.append(f"- {lines[i]}"); i += 1
            out.append("")
    flush()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip() + "\n"

if __name__ == "__main__":
    sys.stdout.write(to_markdown(sys.argv[1], sys.argv[2]))
