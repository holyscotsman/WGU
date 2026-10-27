// Compiles content/courses/* into dist/ (static site + JSON data) and validates it.
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content", "courses");
const DIST = path.join(ROOT, "dist");
const validateOnly = process.argv.includes("--validate-only");

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

async function loadCourse(dir) {
  const base = path.join(CONTENT, dir);
  const course = await readJson(path.join(base, "course.json"), null);
  if (!course) return fail(base, "missing course.json");
  if (course.id !== dir) fail(base, `course.json id "${course.id}" must match folder name`);
  const objectives = new Set((course.objectives ?? []).map((o) => o.id));
  if (objectives.size !== (course.objectives ?? []).length) fail(dir, "duplicate objective ids");

  const guides = [];
  const gdir = path.join(base, "guides");
  if (existsSync(gdir)) {
    for (const f of (await readdir(gdir)).filter((f) => f.endsWith(".md")).sort()) {
      const { meta, body } = parseFrontmatter(await readFile(path.join(gdir, f), "utf8"));
      const objs = (meta.objectives ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      for (const o of objs) if (!objectives.has(o)) fail(`${dir}/guides/${f}`, `unknown objective "${o}"`);
      guides.push({
        id: f.replace(/\.md$/, ""),
        title: meta.title ?? f.replace(/\.md$/, ""),
        objectives: objs,
        html: marked.parse(body),
      });
    }
  }

  const questions = await readJson(path.join(base, "questions.json"), []);
  const seenQ = new Set();
  for (const q of questions) {
    const w = `${dir}/questions.json#${q.id}`;
    if (!q.id || seenQ.has(q.id)) fail(w, "missing or duplicate id");
    seenQ.add(q.id);
    if (!objectives.has(q.objective)) fail(w, `unknown objective "${q.objective}"`);
    if (!q.q || !Array.isArray(q.choices) || q.choices.length < 2) fail(w, "needs q and >=2 choices");
    const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
    if (!ans.length || ans.some((a) => !Number.isInteger(a) || a < 0 || a >= (q.choices?.length ?? 0)))
      fail(w, "answer index out of range");
    if (!q.explanation) fail(w, "missing explanation");
  }

  const cards = await readJson(path.join(base, "flashcards.json"), []);
  const seenC = new Set();
  for (const c of cards) {
    const w = `${dir}/flashcards.json#${c.id}`;
    if (!c.id || seenC.has(c.id)) fail(w, "missing or duplicate id");
    seenC.add(c.id);
    if (!objectives.has(c.objective)) fail(w, `unknown objective "${c.objective}"`);
    if (!c.front || !c.back) fail(w, "needs front and back");
  }

  return { course, guides, questions, cards };
}

const dirs = existsSync(CONTENT)
  ? (await readdir(CONTENT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
const loaded = (await Promise.all(dirs.map(loadCourse))).filter(Boolean);

if (errors.length) {
  console.error(`Content validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Validated ${loaded.length} course(s).`);
if (validateOnly) process.exit(0);

await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, "data"), { recursive: true });
await cp(path.join(ROOT, "web"), DIST, { recursive: true });

const index = loaded.map(({ course, guides, questions, cards }) => ({
  ...course,
  counts: { guides: guides.length, questions: questions.length, cards: cards.length },
}));
await writeFile(path.join(DIST, "data", "courses.json"), JSON.stringify(index));
for (const c of loaded)
  await writeFile(path.join(DIST, "data", `${c.course.id}.json`), JSON.stringify(c));
console.log(`Built ${DIST}`);
