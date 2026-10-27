#!/usr/bin/env python3
"""Build content/courses/<id>/ from courseware PDFs, driven by <out>/ingest.json.

usage: ingest_course.py <courseware_dir> <course_dir>

ingest.json:
  guides:   [{file, title, objectives:[...]}]        lesson PDFs -> guides/NN-slug.md (courseware text)
  quizzes:  [{file, objective}]                       graded quiz PDFs -> questions.json
  keyterms: [{file, objective}]                       "Term is ..." definition PDFs -> flashcards.json
The courseware is the only source of correct answers. Questions without a graded result are skipped and reported.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from quiz_pdf import extract
from lesson_pdf import to_markdown, pdf_text

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]

DEF_VERBS = r"(?: is | are | refers to | involves | helps | has been developed | measures | occurs | means | include | includes | continuously monitors | have | has )"

def key_terms(path):
    text = pdf_text(path).replace("\f", "\n")
    lines = [l.strip() for l in text.split("\n")]
    entries, cur = [], []
    start = re.compile(r"^[A-Z][A-Za-z()/,' -]{1,60}?" + DEF_VERBS)
    for l in lines:
        if not l or l in ("Listen",) or l.startswith(("©", "▶", "Section", "Below")): continue
        m = start.match(l)
        if m and "." not in m.group(0):
            if cur: entries.append(" ".join(cur))
            cur = [l]
        elif cur:
            cur.append(l)
    if cur: entries.append(" ".join(cur))
    cards = []
    for e in entries:
        m = re.match(r"^(.+?)" + DEF_VERBS + r"(.*)$", e)
        if not m: continue
        term, rest = m.group(1).strip(), e[len(m.group(1)):].strip()
        term = term.split(", also known as")[0].strip()
        cards.append((term, f"{term} {rest}" if not rest[0].isupper() else rest))
    return cards

def main(src, out):
    cfg = json.load(open(os.path.join(out, "ingest.json")))
    cid = os.path.basename(out.rstrip("/"))
    os.makedirs(os.path.join(out, "guides"), exist_ok=True)
    for f in os.listdir(os.path.join(out, "guides")):
        os.remove(os.path.join(out, "guides", f))
    for i, g in enumerate(cfg["guides"], 1):
        md = to_markdown(os.path.join(src, g["file"]), g["title"])
        fm = f"---\ntitle: {g['title']}\nobjectives: {', '.join(g['objectives'])}\n---\n"
        name = f"{i:02d}-{slug(g['title'])}.md"
        open(os.path.join(out, "guides", name), "w").write(fm + md)

    questions, skipped = [], []
    for qz in cfg.get("quizzes", []):
        for q in extract(os.path.join(src, qz["file"])):
            where = f"{qz['file']} Q{q['n']}"
            if q["result"] != "correct" or not q["selected"] or not q["explanation"]:
                skipped.append(where); continue
            ans = q["selected"]
            questions.append({
                "id": f"{cid}-{slug(qz['file'].rsplit('.',1)[0])}-q{q['n']}",
                "objective": qz["objective"],
                "q": q["stem"], "choices": q["choices"],
                "answer": ans[0] if len(ans) == 1 else ans,
                "explanation": re.sub(r"^(That's right|Correct)[!.]\s*", "", q["explanation"]),
                "source": qz["file"].rsplit(".", 1)[0],
            })
    json.dump(questions, open(os.path.join(out, "questions.json"), "w"), indent=1, ensure_ascii=False)

    cards = []
    for kt in cfg.get("keyterms", []):
        for n, (term, back) in enumerate(key_terms(os.path.join(src, kt["file"])), 1):
            cards.append({"id": f"{cid}-kt{len(cards)+1}", "objective": kt["objective"], "front": term, "back": back})
    json.dump(cards, open(os.path.join(out, "flashcards.json"), "w"), indent=1, ensure_ascii=False)
    print(f"guides={len(cfg['guides'])} questions={len(questions)} cards={len(cards)} skipped={skipped}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
