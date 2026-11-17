// Pure study logic (no DOM): stats, readiness, next up, session selection, pre-assessment mastery.
// Progress shape (unchanged, stored under localStorage "wgu-progress-v1"):
//   questions: { [id]: { n, c, last, t } }   cards: { [id]: { box, due, t } }   exams: [...]   games: {...}
//   pa: { q: { [questionId]: { sessions: [sid], t } }, c: { [clusterId]: { last: [0|1 x<=10], started, t } } }

export const PASS = 70;
export const DAY = 864e5;
export const asArr = (a) => (Array.isArray(a) ? a : [a]);
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
export const stemKey = (q) => q.q.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export const toneOf = (accuracy) => (accuracy === null ? "none" : accuracy >= 80 ? "ok" : accuracy >= 60 ? "mid" : "low");

export function mulberry(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- names ----------
export const sectionTitle = (d, id) => d.course.objectives.find((o) => o.id === id)?.title ?? id;
export const lessonOf = (d, id) => (d.course.lessons ?? []).find((l) => l.id === id) ?? null;
export function lessonName(d, id) {
  const l = lessonOf(d, id);
  if (!l) return null;
  return l.number ? `Lesson ${l.number}: ${l.title}` : "Section overview";
}
export const lessonsInSection = (d, sec) => (d.course.lessons ?? []).filter((l) => l.section === sec && l.number > 0);
export const hasLessons = (d) => (d.course.lessons ?? []).some((l) => l.number > 0);

/** The guide a question's "Read more" link should open, or null. */
export function guideForLesson(d, lessonId) {
  return lessonId ? d.guides.find((g) => g.lesson === lessonId && (g.kind === "lesson" || !hasLessons(d))) ?? d.guides.find((g) => g.lesson === lessonId) ?? null : null;
}

// ---------- statistics ----------
const stat = (state, q) => state.questions?.[q.id] ?? null;

/** Coverage and last-attempt accuracy for any set of questions. accuracy is null until something is attempted. */
export function summarize(state, questions) {
  const seen = questions.filter((q) => stat(state, q));
  const right = seen.filter((q) => stat(state, q).last).length;
  const accuracy = seen.length ? Math.round((right / seen.length) * 100) : null;
  return {
    total: questions.length, seen: seen.length, right, wrong: seen.length - right,
    coverage: pct(seen.length, questions.length), accuracy,
    readiness: questions.length ? ((seen.length ? right / seen.length : 0) * (seen.length / questions.length)) : 0,
  };
}

export function statusOf(sum) {
  if (!sum.seen) return "Not started";
  if (sum.accuracy < 60) return "Weak";
  if (sum.coverage === 100 && sum.accuracy >= 80) return "Ready";
  return "In progress";
}

export const questionsOf = (d, filter = {}) =>
  d.questions.filter((q) => (!filter.section || q.objective === filter.section) && (!filter.lesson || q.lesson === filter.lesson) &&
    (!filter.source || (filter.source === "pa" ? !!q.pa : !q.pa)));

export function sectionRows(d, state) {
  return d.course.objectives.map((o, i) => {
    const qs = questionsOf(d, { section: o.id });
    const sum = summarize(state, qs);
    return { id: o.id, number: i + 1, title: o.title.replace(/^Section \d+:\s*/, ""), ...sum, status: statusOf(sum), tone: toneOf(sum.accuracy) };
  }).filter((r) => r.total > 0);
}

export function lessonRows(d, state, sec) {
  return lessonsInSection(d, sec).map((l) => {
    const sum = summarize(state, questionsOf(d, { lesson: l.id }));
    return { id: l.id, number: l.number, title: l.title, ...sum, status: statusOf(sum), tone: toneOf(sum.accuracy) };
  });
}

export const missedQuestions = (d, state) => d.questions.filter((q) => stat(state, q) && !stat(state, q).last);

// ---------- exams and readiness ----------
export const examsOf = (state, courseId) => (state.exams ?? []).filter((e) => e.course === courseId).sort((a, b) => a.t - b.t);

/** Overall readiness %: per-section (last-attempt accuracy x coverage) weighted by question count, averaged with the latest mock. */
export function readiness(d, state) {
  const rows = sectionRows(d, state);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const bank = total ? rows.reduce((s, r) => s + r.readiness * r.total, 0) / total : 0;
  const exams = examsOf(state, d.course.id);
  const last = exams[exams.length - 1];
  const mock = last ? pct(last.score, last.total) : null;
  const value = mock === null ? bank * 100 : (bank * 100 + mock) / 2;
  return { value: Math.round(value), bank: Math.round(bank * 100), mock, passMark: d.course.exam?.passPercent ?? PASS };
}

// ---------- next up ----------
const needsWork = (sum) => sum.coverage < 100 || (sum.accuracy ?? 0) < 70;
const minutes = (n) => Math.max(2, Math.round(n * 0.75));

function reasonFor(sum, label) {
  if (!sum.seen) return `${label}: ${sum.total} questions, none tried yet.`;
  if (sum.wrong) return `You missed ${sum.wrong} of ${sum.seen} here last time.`;
  return `${sum.total - sum.seen} of ${sum.total} questions here are still untried.`;
}

/** { kind, title, why, minutes, href } or null when everything is covered and accurate. */
export function nextUp(d, state) {
  const id = d.course.id;
  for (const c of paClusters(d)) {
    const st = clusterStatus(d, state, c);
    if (st.status !== "Mastered") {
      const n = c.missed.length;
      return { kind: "cluster", title: c.title, why: `Pre-assessment: you missed ${n} question${n === 1 ? "" : "s"} on this topic.`, minutes: 8, href: `#/c/${id}/fix/${c.id}/drill` };
    }
  }
  for (const o of d.course.objectives) {
    const qs = questionsOf(d, { section: o.id });
    if (!qs.length) continue;
    const sum = summarize(state, qs);
    if (!needsWork(sum)) continue;
    const lessons = lessonsInSection(d, o.id);
    for (const l of lessons) {
      const ls = summarize(state, questionsOf(d, { lesson: l.id }));
      if (ls.total && needsWork(ls)) {
        return { kind: "lesson", title: `${o.title.replace(/:.*/, "")}, Lesson ${l.number}: ${l.title}`, why: reasonFor(ls, "Lesson"), minutes: minutes(Math.min(10, ls.total)), href: `#/c/${id}/quiz?lesson=${l.id}` };
      }
    }
    return { kind: "section", title: o.title, why: reasonFor(sum, "Section"), minutes: minutes(Math.min(10, qs.length)), href: `#/c/${id}/quiz?section=${o.id}` };
  }
  return null;
}

// ---------- session selection ----------
/** Weakest first: missed last time (lowest accuracy first), then untried, then the rest (lowest accuracy first). */
export function pickPractice(d, state, { n = 10, section, lesson, source, ids, rng = Math.random } = {}) {
  let pool = ids ? d.questions.filter((q) => ids.includes(q.id)) : questionsOf(d, { section, lesson, source });
  const acc = (q) => { const s = stat(state, q); return s ? s.c / Math.max(s.n, 1) : 1; };
  const bucket = (q) => { const s = stat(state, q); return !s ? 1 : s.last ? 2 : 0; };
  pool = shuffle(pool, rng).sort((a, b) => bucket(a) - bucket(b) || (bucket(a) === 1 ? 0 : acc(a) - acc(b)));
  const seenStems = new Set();   // after sorting, so the copy with history is the one that survives
  pool = pool.filter((q) => { const k = stemKey(q); if (seenStems.has(k)) return false; seenStems.add(k); return true; });
  return shuffle(pool.slice(0, n), rng);
}

/** Mock exam: `count` questions drawn from each section in proportion to its share of the bank. */
export function sampleExam(d, count, rng = Math.random) {
  const secs = d.course.objectives.map((o) => ({ id: o.id, qs: shuffle(questionsOf(d, { section: o.id }), rng) })).filter((s) => s.qs.length);
  const bank = secs.reduce((s, x) => s + x.qs.length, 0);
  const want = Math.min(count, bank);
  const raw = secs.map((s) => ({ ...s, exact: (s.qs.length / bank) * want }));
  raw.forEach((s) => (s.take = Math.floor(s.exact)));
  let left = want - raw.reduce((s, x) => s + x.take, 0);
  [...raw].sort((a, b) => (b.exact - b.take) - (a.exact - a.take)).forEach((s) => { if (left > 0 && s.take < s.qs.length) { s.take++; left--; } });
  const seen = new Set(), out = [];
  for (const s of raw) for (const q of s.qs.slice(0, s.take)) { const k = stemKey(q); if (!seen.has(k)) { seen.add(k); out.push(q); } }
  return shuffle(out, rng);
}

// ---------- pre-assessment ----------
export const paAttempts = (d) => d.course.pa?.attempts ?? [];
export const paLatest = (d) => paAttempts(d).at(-1) ?? null;
export const paClusters = (d) => paLatest(d)?.clusters ?? [];
export const paQuestions = (d, attempt) => d.questions.filter((q) => q.pa && (attempt ? q.pa.attempt === attempt : true));

const playable = (d, id) => d.questions.some((q) => q.id === id);

/** Mastered = every missed pre-assessment question answered correctly in two separate sessions AND >=80% on the last 10 drill answers. */
export function clusterStatus(d, state, cluster) {
  const ids = cluster.missed.filter((id) => playable(d, id));
  const sessions = (id) => state.pa?.q?.[id]?.sessions?.length ?? 0;
  const fixed = ids.filter((id) => sessions(id) >= 2).length;
  const c = state.pa?.c?.[cluster.id];
  const last = (c?.last ?? []).slice(-10);
  const acc = last.length ? Math.round((last.reduce((a, b) => a + b, 0) / last.length) * 100) : null;
  const started = !!c?.started || ids.some((id) => sessions(id) > 0);
  const mastered = ids.length > 0 && fixed === ids.length && last.length >= 5 && acc >= 80;
  return { total: ids.length, fixed, accuracy: acc, answers: last.length, status: mastered ? "Mastered" : started ? "Practicing" : "Not started" };
}

export function paMastery(d, state) {
  const cl = paClusters(d);
  const done = cl.filter((c) => clusterStatus(d, state, c).status === "Mastered").length;
  return { mastered: done, total: cl.length };
}

/** Record one answer. `sid` identifies the session; `drillCluster` is set when answering inside a topic drill. */
export function noteAnswer(state, q, correct, sid, drillCluster = null, now = Date.now()) {
  state.pa ??= { q: {}, c: {} };
  state.pa.q ??= {}; state.pa.c ??= {};
  if (q.pa && !q.pa.correct && correct) {
    const e = state.pa.q[q.id] ?? { sessions: [], t: 0 };
    if (!e.sessions.includes(sid)) e.sessions = [...e.sessions, sid];
    state.pa.q[q.id] = { ...e, t: now };
  }
  if (drillCluster) {
    const e = state.pa.c[drillCluster] ?? { last: [], started: true, t: 0 };
    state.pa.c[drillCluster] = { last: [...e.last, correct ? 1 : 0].slice(-10), started: true, t: now };
  }
  return state;
}

/** Drill for one topic: its unmastered pre-assessment misses first, then bank questions from the topic's lessons. */
export function pickDrill(d, state, cluster, { n = 10, rng = Math.random } = {}) {
  const missed = cluster.missed.map((id) => d.questions.find((q) => q.id === id)).filter(Boolean)
    .filter((q) => (state.pa?.q?.[q.id]?.sessions?.length ?? 0) < 2);
  const picked = new Set(missed.map(stemKey));
  const lessons = new Set(cluster.lessons ?? []);
  const fill = pickPractice(d, state, { n: 999, rng }).filter((q) => lessons.has(q.lesson) && !q.pa && !picked.has(stemKey(q)));
  return shuffle([...missed.slice(0, n), ...fill.slice(0, Math.max(0, n - missed.length))], rng);
}

/** Which pre-assessment misses are now fixed, for the end-of-drill screen. */
export const fixedMisses = (d, state, cluster) =>
  cluster.missed.filter((id) => playable(d, id) && (state.pa?.q?.[id]?.sessions?.length ?? 0) >= 2);

/** Per-cluster results of a retake: how many of the originally missed questions are right now. */
export function retakeByCluster(d, results) {
  const right = new Set(results.filter((r) => r.correct).map((r) => r.q.id));
  const out = {};
  for (const c of paClusters(d)) {
    const ids = c.missed.filter((id) => playable(d, id));
    out[c.id] = { before: 0, now: ids.filter((id) => right.has(id)).length, of: ids.length };
  }
  return out;
}
