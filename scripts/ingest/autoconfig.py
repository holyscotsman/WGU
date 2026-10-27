#!/usr/bin/env python3
"""Generate course.json + ingest.json for courseware laid out as Section N/Lesson N.M PDFs.

usage: autoconfig.py <courseware_dir> <course_dir> <code> <title>
Objectives are one per Section (the courseware pairs one competency with each section). Edit the
generated course.json afterwards to replace section names with official competency statements.
"""
import json, os, re, sys

def main(src, out, code, title):
    files = []
    for root, _, fs in os.walk(src):
        for f in fs:
            if f.lower().endswith(".pdf"):
                files.append(os.path.relpath(os.path.join(root, f), src))
    sec_title = {}
    for f in files:
        m = re.match(r"(?:.*/)?Section (\d+)\s*-+\s*(?:Introduction)?\s*(.*)\.pdf$", f)
        base = os.path.basename(f)
        m = re.match(r"Section (\d+)\s*-\s*(.+)\.pdf$", base)
        if m and not re.match(r"(Introduction|Summary|Test|Key Terms)", m.group(2)):
            sec_title[int(m.group(1))] = m.group(2).strip()
    def section_of(f):
        m = re.search(r"Section (\d+)", f)
        return int(m.group(1)) if m else None
    def lesson_key(f):
        b = os.path.basename(f)
        m = re.search(r"Lesson (\d+)(?:\.(\d+))?", b)
        lesson, sub = (int(m.group(1)), int(m.group(2) or 0)) if m else (-1, 0)
        if re.search(r"Summary", b): sub = 98
        if re.search(r"Introduction", b) and not m: lesson = -1
        return (section_of(f) or 0, lesson, sub, b)
    quiz_re = re.compile(r"(Quiz|Test|Assessment|Pre-Assessment)", re.I)
    guides, quizzes = [], []
    for f in sorted(files, key=lesson_key):
        b = os.path.basename(f)
        sec = section_of(f)
        if "Study Guide" in f or "Pre-Assessment" in b or sec is None:
            continue
        obj = f"s{sec}"
        if quiz_re.search(b) and "Summary" not in b:
            quizzes.append({"file": f, "objective": obj})
        else:
            t = re.sub(r"\.pdf$", "", b)
            t = re.sub(r"^Lesson (\d+(?:\.\d+)?)\s*-+\s*", r"\1 ", t)
            t = re.sub(r"^Section (\d+)\s*-+\s*", r"Section \1: ", t)
            t = re.sub(r"\s+", " ", t).strip()
            guides.append({"file": f, "title": f"S{sec} {t}" if not t.startswith("Section") else t, "objectives": [obj]})
    os.makedirs(out, exist_ok=True)
    json.dump({"guides": guides, "quizzes": quizzes, "keyterms": []}, open(os.path.join(out, "ingest.json"), "w"), indent=1)
    secs = sorted({int(g["objectives"][0][1:]) for g in guides} | {int(q["objective"][1:]) for q in quizzes})
    course = {"id": os.path.basename(out.rstrip("/")), "code": code, "title": title,
              "exam": {"count": 50, "minutes": 90, "passPercent": 70},
              "objectives": [{"id": f"s{n}", "title": f"Section {n}: {sec_title.get(n, '')}".strip().rstrip(":")} for n in secs]}
    cj = os.path.join(out, "course.json")
    if not os.path.exists(cj):
        json.dump(course, open(cj, "w"), indent=1)
    print(f"guides={len(guides)} quizzes={len(quizzes)} sections={secs}")

if __name__ == "__main__":
    main(*sys.argv[1:5])
