// Compiles content/courses/* into dist/ (static site) and netlify/content (private data bundle), and validates it.
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { buildLessonGuides, pageTitle } from "./lib/lessonGuides.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content", "courses");
const DIST = path.join(ROOT, "dist");
const PRIVATE = path.join(ROOT, "netlify", "content");
const validateOnly = process.argv.includes("--validate-only");
const MAX_EXAM = 60;

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

const readJson = async (file, fallback) => {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    fail(file, `invalid JSON (${e.message})`);
    return fallback;
  }
};

const validAnswer = (q) => {
  const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
  return ans.length > 0 && ans.every((a) => Number.isInteger(a) && a >= 0 && a < (q.choices?.length ?? 0));
};

/** "S5 Lesson 2.2" -> { lesson: "s5-l2", label: "Section 5, Lesson 2.2" } */
const pageRef = (page) => {
  const m = String(page ?? "").match(/S(\d+)\s+Lesson\s+(\d+)(?:\.(\d+))?/i);
  if (m) return { lesson: `s${m[1]}-l${m[2]}`, label: `Section ${m[1]}, Lesson ${m[2]}${m[3] ? "." + m[3] : ""}` };
  const s = String(page ?? "").match(/Section\s+(\d+)/i);
  return s ? { lesson: `s${s[1]}-l0`, label: `Section ${s[1]} introduction` } : { lesson: null, label: String(page ?? "") };
};

async function loadPreAssessments(dir, base, objectives, lessonIds, questionIds) {
  const pdir = path.join(base, "preassessment");
  const attempts = [], questions = [];
  if (!existsSync(pdir)) return { attempts, questions };
  for (const f of (await readdir(pdir)).filter((f) => /^attempt\d+\.json$/.test(f)).sort()) {
    const where = `${dir}/preassessment/${f}`;
    const data = await readJson(path.join(pdir, f), null);
    if (!data) continue;
    const clusterIds = new Set((data.clusters ?? []).map((c) => c.id));
    for (const q of data.questions ?? []) {
      const w = `${where}#${q.id}`;
      if (!q.id || questionIds.has(q.id)) fail(w, "missing or duplicate id");
      questionIds.add(q.id);
      if (!objectives.has(q.objective)) fail(w, `unknown objective "${q.objective}"`);
      if (q.lesson && !lessonIds.has(q.lesson)) fail(w, `unknown lesson "${q.lesson}"`);
      if (!Array.isArray(q.choices) || q.choices.length < 2) fail(w, "needs >=2 choices");
      if (!validAnswer(q)) fail(w, "answer index out of range");
      if (!q.explanation) fail(w, "missing explanation");
      if (!q.pa) { fail(w, "missing pa block"); continue; }
      if (!q.pa.correct && !clusterIds.has(q.pa.cluster)) fail(w, `missed question needs a known cluster, got "${q.pa.cluster}"`);
      const mine = Array.isArray(q.pa.myAnswer) ? q.pa.myAnswer : [q.pa.myAnswer];
      if (!mine.length || mine.some((a) => !Number.isInteger(a) || a < 0 || a >= q.choices.length)) fail(w, "pa.myAnswer out of range");
      q.pa.pageRef = pageRef(q.pa.page);
      questions.push(q);
    }
    for (const c of data.clusters ?? []) {
      for (const id of c.missed ?? []) {
        const known = (data.questions ?? []).some((q) => q.id === id);
        if (!known && !/-q(12|27)$/.test(id)) fail(`${where}#cluster:${c.id}`, `missed id "${id}" is not in the file`);
      }
      for (const l of c.lessons ?? []) if (!lessonIds.has(l)) fail(`${where}#cluster:${c.id}`, `unknown lesson "${l}"`);
      c.pageRefs = (c.pages ?? []).map(pageRef);
    }
    attempts.push({ ...data.attempt, clusters: data.clusters ?? [] });
  }
  return { attempts, questions };
}

async function loadCourse(dir) {
  const base = path.join(CONTENT, dir);
  const course = await readJson(path.join(base, "course.json"), null);
  if (!course) return fail(base, "missing course.json");
  if (course.id !== dir) fail(base, `course.json id "${course.id}" must match folder name`);
  const objectives = new Set((course.objectives ?? []).map((o) => o.id));
  if (objectives.size !== (course.objectives ?? []).length) fail(dir, "duplicate objective ids");

  const lessons = await readJson(path.join(base, "lessons.json"), []);
  const lessonIds = new Set(lessons.map((l) => l.id));
  const secTitle = Object.fromEntries((course.objectives ?? []).map((o) => [o.id, o.title]));
  for (const l of lessons) {
    if (!objectives.has(l.section)) fail(`${dir}/lessons.json#${l.id}`, `unknown section "${l.section}"`);
    l.sectionTitle = secTitle[l.section] ?? l.section;
  }

  // page-level guides (one per courseware page)
  const pages = [];
  const gdir = path.join(base, "guides");
  if (existsSync(gdir)) {
    for (const f of (await readdir(gdir)).filter((f) => f.endsWith(".md")).sort()) {
      const { meta, body } = parseFrontmatter(await readFile(path.join(gdir, f), "utf8"));
      const objs = (meta.objectives ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      for (const o of objs) if (!objectives.has(o)) fail(`${dir}/guides/${f}`, `unknown objective "${o}"`);
      if (meta.lesson && lessons.length && !lessonIds.has(meta.lesson)) fail(`${dir}/guides/${f}`, `unknown lesson "${meta.lesson}"`);
      pages.push({ id: f.replace(/\.md$/, ""), ...meta, title: meta.title ?? f.replace(/\.md$/, ""), objectives: objs, md: body });
    }
  }

  const questions = await readJson(path.join(base, "questions.json"), []);
  const questionIds = new Set();
  for (const q of questions) {
    const w = `${dir}/questions.json#${q.id}`;
    if (!q.id || questionIds.has(q.id)) fail(w, "missing or duplicate id");
    questionIds.add(q.id);
    if (!objectives.has(q.objective)) fail(w, `unknown objective "${q.objective}"`);
    if (q.lesson && lessons.length && !lessonIds.has(q.lesson)) fail(w, `unknown lesson "${q.lesson}"`);
    if (!q.q || !Array.isArray(q.choices) || q.choices.length < 2) fail(w, "needs q and >=2 choices");
    if (!validAnswer(q)) fail(w, "answer index out of range");
    if (!q.explanation) fail(w, "missing explanation");
    if (/\bAnswers are displayed\b|^\s*(That's right|Correct)[!.]|\bCorrect\s*$/.test(q.explanation ?? "")) fail(w, "explanation contains courseware junk");
  }

  const cards = await readJson(path.join(base, "flashcards.json"), []);
  const seenC = new Set();
  for (const c of cards) {
    const w = `${dir}/flashcards.json#${c.id}`;
    if (!c.id || seenC.has(c.id)) fail(w, "missing or duplicate id");
    seenC.add(c.id);
    if (!objectives.has(c.objective)) fail(w, `unknown objective "${c.objective}"`);
    if (c.lesson && lessons.length && !lessonIds.has(c.lesson)) fail(w, `unknown lesson "${c.lesson}"`);
    if (!c.front || !c.back) fail(w, "needs front and back");
  }

  // pre-assessment attempts (their questions join the bank)
  const pa = await loadPreAssessments(dir, base, objectives, lessonIds, questionIds);
  const allQuestions = [...questions, ...pa.questions];

  const latest = pa.attempts[pa.attempts.length - 1];
  let guides;
  if (course.lessonGuides && lessons.length) {
    guides = buildLessonGuides({ lessons, pages, questions: allQuestions, cards, clusters: latest?.clusters ?? [], courseId: course.id });
  } else {
    guides = pages.map((p) => ({
      id: p.id, title: pageTitle(p), objectives: p.objectives, lesson: p.lesson ?? null, kind: p.kind ?? "page",
      html: marked.parse(p.md),
    }));
  }

  course.exam = { minutes: 90, passPercent: 70, ...course.exam, count: Math.min(MAX_EXAM, allQuestions.length) };
  if (lessons.length) course.lessons = lessons;
  if (pa.attempts.length) course.pa = { attempts: pa.attempts };
  return { course, guides, questions: allQuestions, cards };
}

const dirs = existsSync(CONTENT)
  ? (await readdir(CONTENT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
const loaded = (await Promise.all(dirs.map(loadCourse))).filter(Boolean);

if (errors.length) {
  console.error(`Content validation failed:\n- ${errors.slice(0, 60).join("\n- ")}${errors.length > 60 ? `\n… and ${errors.length - 60} more` : ""}`);
  process.exit(1);
}
console.log(`Validated ${loaded.length} course(s).`);
if (validateOnly) process.exit(0);

await rm(DIST, { recursive: true, force: true });
await rm(PRIVATE, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await mkdir(PRIVATE, { recursive: true });
await cp(path.join(ROOT, "web"), DIST, { recursive: true });

// Course data is private: it is bundled into the `data` function and served only to authenticated sessions.
const index = loaded.map(({ course, guides, questions, cards }) => ({
  id: course.id, code: course.code, title: course.title, exam: course.exam, objectives: course.objectives,
  counts: { guides: guides.length, questions: questions.length, cards: cards.length },
  ...(course.pa ? { pa: { attempts: course.pa.attempts.map(({ clusters, ...a }) => a) } } : {}),
}));
const bundle = { courses: index };
for (const c of loaded) bundle[c.course.id] = c;
await writeFile(path.join(PRIVATE, "index.mjs"), `export default ${JSON.stringify(bundle)};\n`);
console.log(`Built ${DIST} and ${PRIVATE}`);
