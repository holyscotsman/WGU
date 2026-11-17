#!/usr/bin/env python3
"""Convert a WGU courseware lesson PDF to Markdown (verbatim text, light structural cleanup)."""
import re, subprocess, sys

DROP = re.compile(r"^(Listen|▶ Image description|©\d{4} Western Governors University.*)$")
SENT_END = (".", "!", "?", ":", '"', "”", ")")
HEAD_MAX = 64

def pdf_text(path):
    return subprocess.run(["pdftotext", path, "-"], check=True, capture_output=True, text=True).stdout

def clean(l):
    l = re.sub(r"[- ​]", " ", l)  # private-use icon glyphs, nbsp
    return re.sub(r"\s+", " ", l).strip()

CREDIT = re.compile(r"(via Getty Images|Getty Images Plus|\bShutterstock\b|\biStock\b|/Alamy|Adobe Stock)\S*\s*$|^Photo by |/Text (color )?changed$")
FRAGMENT = re.compile(r"©\s*\d{4} Western Governors University – WGU\.? ?(All( [Rr]ights [Rr]eserved\.?)?)?|Privacy Policy \| Terms of Service( \| Honor Code)?|ADA Accommodation")
COPYRIGHT = re.compile(r"^©\s*\d{4} Western Governors University")
JUNK_LINE = re.compile(r"^(QUOTE|Listen|▶ Image description)$")

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
            out.extend([" ".join(para), ""]); para = []
    n = len(lines)
    i = 0
    while i < n:
        l = lines[i]
        if l == "":
            flush(); i += 1; continue
        prev = lines[i - 1] if i > 0 else ""
        nxt = lines[i + 1] if i + 1 < n else ""
        prev_closed = (not para) or para[-1].endswith(SENT_END)
        is_head = (len(l) <= HEAD_MAX and not l.endswith(SENT_END + (",", ";")) and l[0].isupper()
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
