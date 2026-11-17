#!/usr/bin/env python3
"""Clean and enrich an ingested course in place: content/courses/<id>/{questions,flashcards}.json.

usage: postprocess.py <course_dir>

 1. Strip courseware junk from explanations (lead-in "That's right!", stray "Correct", widget text).
 2. Apply hand-written explanation fixes from explanations.json ({question id: {explanation, note}}), marked
    "explanationSource": "added". Used where the courseware explanation is missing, thin or contradicts the answer.
 3. De-duplicate questions by normalized stem; the lesson-quiz id is kept and both sources are recorded.
 4. Infer `lesson` for section-test questions and flashcards from the course's own lesson text (same section only).
 5. Rewrite flashcard backs so they never start with or contain their own term.
Idempotent: safe to re-run after ingest_course.py.
"""
import json, math, os, re, sys, collections

STOP = set("the a an and or of to in on for with is are was were be been by as at it its this that these those from which what who whom how why when where can will would should may might must not no yes true false project projects".split())

def load(p, default):
    return json.load(open(p)) if os.path.exists(p) else default

def tokens(t):
    return [w for w in re.findall(r"[a-z][a-z0-9']+", t.lower()) if w not in STOP and len(w) > 2]

def front_matter(path):
    src = open(path).read()
    m = re.match(r"^---\n(.*?)\n---\n?", src, re.S)
    meta = dict(l.split(": ", 1) for l in m.group(1).split("\n") if ": " in l) if m else {}
    return meta, src[m.end():] if m else src

# ---- 1. explanation cleanup -------------------------------------------------------------------
JUNK = [
    (re.compile(r"^(That's right|Correct|Incorrect)[!.:]\s*", re.I), ""),
    (re.compile(r"\s*Answers? (is|are) displayed within the problem\.?\s*", re.I), " "),
    (re.compile(r"\s*\bCorrect\b\s*$"), ""),
    (re.compile(r"\s*(ADA Accommodation|Privacy Policy \| Terms of Service.*|© \d{4} Western.*)$"), ""),
]

def clean_explanation(t):
    for rx, rep in JUNK:
        t = rx.sub(rep, t.strip())
    return re.sub(r"\s+", " ", t).strip()

# ---- 3. de-dupe ---------------------------------------------------------------------------------
def norm_stem(q):
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", q.lower())).strip()

def priority(q):
    return (0 if q.get("lesson") else 1, q["id"])

# ---- 4. lesson inference ------------------------------------------------------------------------
class Bm25:
    def __init__(self, docs):
        self.docs = {k: collections.Counter(tokens(v)) for k, v in docs.items()}
        self.len = {k: sum(c.values()) or 1 for k, c in self.docs.items()}
        self.avg = sum(self.len.values()) / max(len(self.len), 1)
        df = collections.Counter(w for c in self.docs.values() for w in c)
        n = len(self.docs)
        self.idf = {w: math.log(1 + (n - d + .5) / (d + .5)) for w, d in df.items()}

    def best(self, query, keys):
        q = set(tokens(query))
        scored = []
        for k in keys:
            c, L = self.docs[k], self.len[k]
            s = sum(self.idf.get(w, 0) * c[w] * 2.2 / (c[w] + 1.2 * (0.25 + 0.75 * L / self.avg)) for w in q if w in c)
            scored.append((s, k))
        scored.sort(reverse=True)
        return scored[0][1] if scored and scored[0][0] > 0 else None

# ---- 5. flashcard scrub -------------------------------------------------------------------------
LEAD_VERBS = r"(?:is defined as|are defined as|is|are|refers to|refer to|means|involves|helps|measures|occurs|include|includes|has been developed|continuously monitors|has|have)"

def variants(front):
    base = re.sub(r"\s*\(.*?\)", "", front).strip()
    abbr = re.findall(r"\(([^)]+)\)", front)
    return [v for v in {front.strip(), base, *abbr} if len(v) > 2]

def term_rx(vs):
    parts = sorted((re.escape(v) for v in vs), key=len, reverse=True)
    return re.compile(r"(?<![A-Za-z])(?:" + "|".join(parts) + r")(?:s|es)?(?![A-Za-z])", re.I)

def scrub_back(front, back):
    vs = variants(front)
    rx = term_rx(vs)
    out = []
    for line in back.split("\n"):
        prefix = ""
        m = re.match(r"^(Example:\s*|Formula:\s*)(.*)$", line, re.S)
        if m: prefix, line = m.group(1), m.group(2)
        lead = re.match(r"^(?:(?:The|A|An)\s+)?(?:" + "|".join(re.escape(v) for v in sorted(vs, key=len, reverse=True)) + r")(?:s|es)?\s+" + LEAD_VERBS + r"\s+(.*)$", line, re.I | re.S)
        if lead:
            rest = lead.group(1).strip()
            line = rest[:1].upper() + rest[1:]
        line = rx.sub("____", line)
        out.append(prefix + line)
    return "\n".join(out)

def sentences(text):
    text = re.sub(r"[#*_`>]|\s+", " ", text)
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])", text) if 40 <= len(s.strip()) <= 300]

def find_definition(front, texts):
    """A defining sentence for the term from the same section's lesson text, or None.

    Conservative: the sentence must open with the term and then say "is/are a|an|the ..." or "refers to / means /
    is defined as / is called". Anything looser pulled in sentences that merely mention the term.
    """
    vs = sorted((re.escape(v) for v in variants(front)), key=len, reverse=True)
    pat = re.compile(r"^(?:(?:The|A|An)\s+)?(?:" + "|".join(vs) + r")(?:s|es)?\s+(?:(?:is|are)\s+(?:a|an|the|defined as|called|known as)\b|refers? to\b|means\b|describes\b)", re.I)
    best = None
    for t in texts:
        for sent in sentences(t):
            if pat.search(sent) and (best is None or len(sent) < len(best)):
                best = sent
    return best

def main(course_dir):
    cj = load(os.path.join(course_dir, "course.json"), {})
    questions = load(os.path.join(course_dir, "questions.json"), [])
    cards = load(os.path.join(course_dir, "flashcards.json"), [])
    overrides = load(os.path.join(course_dir, "explanations.json"), {})
    report = collections.Counter()

    # explanations
    for q in questions:
        before = q["explanation"]
        q["explanation"] = clean_explanation(q["explanation"])
        report["explanations cleaned"] += before != q["explanation"]
        q.pop("explanationSource", None)
        if q["id"] in overrides:
            q["explanation"] = overrides[q["id"]]["explanation"]
            q["explanationSource"] = "added"
            report["explanations added"] += 1

    # de-dupe
    groups = collections.OrderedDict()
    for q in sorted(questions, key=priority):
        groups.setdefault(norm_stem(q["q"]), []).append(q)
    deduped = []
    for grp in groups.values():
        keep = grp[0]
        sources = []
        for q in grp:
            src = q.get("source")
            if src and src not in sources: sources.append(src)
        keep["source"] = " · ".join(sources)
        deduped.append(keep)
        report["duplicates merged"] += len(grp) - 1
    order = {q["id"]: i for i, q in enumerate(questions)}
    questions = sorted(deduped, key=lambda q: order[q["id"]])

    # lessons text from guides
    docs, section_lessons = {}, collections.defaultdict(list)
    gdir = os.path.join(course_dir, "guides")
    if os.path.isdir(gdir):
        for f in sorted(os.listdir(gdir)):
            meta, body = front_matter(os.path.join(gdir, f))
            lid = meta.get("lesson")
            if lid and not lid.endswith("-l0"):
                docs[lid] = docs.get(lid, "") + " " + body
    for lid in docs:
        section_lessons[lid.split("-")[0]].append(lid)
    bm = Bm25(docs) if docs else None

    def infer(obj, query):
        keys = section_lessons.get(obj, [])
        return bm.best(query, keys) if bm and keys else None

    for q in questions:
        if not q.get("lesson"):
            correct = q["answer"] if isinstance(q["answer"], list) else [q["answer"]]
            query = q["q"] + " " + " ".join(q["choices"][i] for i in correct) + " " + q["explanation"]
            q["lesson"] = infer(q["objective"], query)
            if q["lesson"]: q["lessonSource"] = "inferred"; report["question lessons inferred"] += 1

    skip_defs = set(load(os.path.join(course_dir, "ingest.json"), {}).get("noPulledDefinition", []))
    section_text = collections.defaultdict(list)
    for lid, text in docs.items():
        section_text[lid.split("-")[0]].append(text)

    for c in cards:
        lines = c["back"].split("\n")
        has_def = any(not re.match(r"^(Example|Formula):", l) for l in lines)
        if not has_def and c["objective"] in section_text and not c.get("definitionSource") and c["front"] not in skip_defs:
            d = find_definition(c["front"], section_text[c["objective"]])
            if d:
                c["back"] = d + "\n" + c["back"]
                c["definitionSource"] = "lesson"
                report["definitions pulled from lessons"] += 1
        raw = c["back"]
        c["back"] = scrub_back(c["front"], raw)
        if c["back"] != raw: c["raw"] = raw   # unmasked text, for reading (the game and flashcards use the masked back)
        else: c.pop("raw", None)
        if not c.get("lesson"):
            lid = infer(c["objective"], c["front"] + " " + c["back"])
            c["lesson"] = lid
            if lid: c["lessonSource"] = "inferred"
        report["cards"] += 1
        report["card backs still containing term"] += bool(term_rx(variants(c["front"])).search(c["back"]))

    json.dump(questions, open(os.path.join(course_dir, "questions.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(cards, open(os.path.join(course_dir, "flashcards.json"), "w"), indent=1, ensure_ascii=False)
    print(cj.get("id"), dict(report), "questions:", len(questions))

if __name__ == "__main__":
    main(sys.argv[1])
