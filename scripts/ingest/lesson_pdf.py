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

def to_markdown(path, title):
    lines = []
    for l in pdf_text(path).replace("\f", "\n").split("\n"):
        l = clean(l)
        if l == "":
            lines.append("")
        elif not DROP.match(l):
            lines.append(l)
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
