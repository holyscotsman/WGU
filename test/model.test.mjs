import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../web/js/model.js";

const mkq = (id, section, lesson, extra = {}) => ({ id, q: `Question ${id}`, objective: section, lesson, choices: ["a", "b"], answer: 0, explanation: "e", ...extra });
function course() {
  const questions = [
    ...["a1", "a2", "a3", "a4"].map((id) => mkq(id, "s1", "s1-l1")),
    ...["b1", "b2"].map((id) => mkq(id, "s1", "s1-l2")),
    ...["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => mkq(id, "s2", "s2-l1")),
    mkq("p1", "s2", "s2-l1", { pa: { attempt: 1, correct: false, cluster: "tools", myAnswer: 1 } }),
    mkq("p2", "s2", "s2-l1", { pa: { attempt: 1, correct: false, cluster: "tools", myAnswer: 1 } }),
  ];
  return {
    course: {
      id: "x", exam: { count: 8, passPercent: 70 },
      objectives: [{ id: "s1", title: "Section 1: One" }, { id: "s2", title: "Section 2: Two" }],
      lessons: [
        { id: "s1-l1", section: "s1", number: 1, title: "A" }, { id: "s1-l2", section: "s1", number: 2, title: "B" },
        { id: "s2-l1", section: "s2", number: 1, title: "C" },
      ],
      pa: { attempts: [{ n: 1, clusters: [{ id: "tools", title: "Tools", missed: ["p1", "p2", "p3-unplayable"], lessons: ["s2-l1"] }] }] },
    },
    guides: [], cards: [], questions,
  };
}
const st = (over = {}) => ({ questions: {}, cards: {}, exams: [], games: {}, ...over });
const right = (t = 1) => ({ n: 1, c: 1, last: true, t });
const wrong = (t = 1) => ({ n: 1, c: 0, last: false, t });

test("summarize: coverage, last-attempt accuracy and status chips", () => {
  const d = course();
  const qs = M.questionsOf(d, { section: "s1" });
  assert.equal(M.statusOf(M.summarize(st(), qs)), "Not started");
  const state = st({ questions: { a1: wrong(), a2: wrong(), a3: right() } });
  const sum = M.summarize(state, qs);
  assert.deepEqual([sum.seen, sum.accuracy, sum.coverage], [3, 33, 50]);
  assert.equal(M.statusOf(sum), "Weak");
  const full = st({ questions: Object.fromEntries(qs.map((q) => [q.id, right()])) });
  assert.equal(M.statusOf(M.summarize(full, qs)), "Ready");
  const mid = st({ questions: { a1: right(), a2: right() } });
  assert.equal(M.statusOf(M.summarize(mid, qs)), "In progress");
});

test("tone: green 80+, gold 60-79, red under 60, grey not started", () => {
  assert.deepEqual([80, 79, 60, 59, null].map(M.toneOf), ["ok", "mid", "mid", "low", "none"]);
});

test("readiness weights sections by question count and averages in the latest mock", () => {
  const d = course();
  const all = d.questions.filter((q) => !q.pa);
  const state = st({ questions: Object.fromEntries(all.filter((q) => q.objective === "s1").map((q) => [q.id, right()])) });
  const r = M.readiness(d, state);
  // s1 has 6 questions at readiness 1.0, s2 has 8 at 0 -> 6/14
  assert.equal(r.bank, Math.round((6 / 14) * 100));
  assert.equal(r.mock, null);
  state.exams = [{ course: "x", t: 1, score: 30, total: 40 }];
  const r2 = M.readiness(d, state);
  assert.equal(r2.mock, 75);
  assert.equal(r2.value, Math.round((r.bank + 75) / 2));
  assert.equal(r2.passMark, 70);
});

test("next up: unmastered pre-assessment topic first, then first section/lesson that needs work", () => {
  const d = course();
  let n = M.nextUp(d, st());
  assert.equal(n.kind, "cluster");
  assert.match(n.why, /missed 3 questions/);
  d.course.pa = undefined;
  n = M.nextUp(d, st());
  assert.equal(n.kind, "lesson");
  assert.match(n.href, /lesson=s1-l1/);
  // finish all of section 1 accurately: moves on to section 2
  const state = st({ questions: Object.fromEntries(["a1", "a2", "a3", "a4", "b1", "b2"].map((id) => [id, right()])) });
  assert.match(M.nextUp(d, state).href, /lesson=s2-l1/);
  // everything seen and accurate: nothing to do
  const all = st({ questions: Object.fromEntries(d.questions.map((q) => [q.id, right()])) });
  assert.equal(M.nextUp(d, all), null);
});

test("next up explains why from the last result", () => {
  const d = course(); d.course.pa = undefined;
  const state = st({ questions: { a1: wrong(), a2: wrong(), a3: right() } });
  assert.match(M.nextUp(d, state).why, /missed 2 of 3/);
});

test("practice: 10 by default, weakest first, no duplicate stems", () => {
  const d = course();
  d.questions.push(mkq("dup", "s1", "s1-l1", { q: "Question a1" }));
  const state = st({ questions: { c1: right(), c2: right(), a1: wrong(), a2: { n: 4, c: 1, last: false, t: 1 } } });
  const picked = M.pickPractice(d, state, { n: 3, rng: M.mulberry(7) });
  const ids = picked.map((q) => q.id).sort();
  assert.deepEqual(ids.filter((id) => ["a1", "a2"].includes(id)).length, 2, "both missed questions are included");
  assert.ok(!(ids.includes("dup") && ids.includes("a1")), "duplicate stem never appears twice");
  assert.equal(M.pickPractice(d, st(), { rng: M.mulberry(1) }).length, 10);
  assert.ok(M.pickPractice(d, st(), { section: "s2", n: 20, rng: M.mulberry(1) }).every((q) => q.objective === "s2"));
  assert.ok(M.pickPractice(d, st(), { lesson: "s1-l2", n: 20 }).every((q) => q.lesson === "s1-l2"));
});

test("mock exam samples each section in proportion to its share", () => {
  const d = course();
  const exam = M.sampleExam(d, 7, M.mulberry(3));
  assert.equal(exam.length, 7);
  const s1 = exam.filter((q) => q.objective === "s1").length;
  assert.equal(s1, 3); // 6 of 14 questions are in section 1 -> round(7 * 6/14) = 3
  assert.equal(M.sampleExam(d, 99).length, 14, "never more than the bank");
});

test("missed queue: leaves once the last attempt is right", () => {
  const d = course();
  assert.deepEqual(M.missedQuestions(d, st({ questions: { a1: wrong(), a2: right() } })).map((q) => q.id), ["a1"]);
  assert.equal(M.missedQuestions(d, st({ questions: { a1: right() } })).length, 0);
});

test("pre-assessment mastery needs two sessions per miss AND 80% on the last drill answers", () => {
  const d = course();
  const cl = M.paClusters(d)[0];
  const state = st();
  assert.equal(M.clusterStatus(d, state, cl).status, "Not started");
  // correct answers across two separate sessions for both playable misses
  for (const sid of ["s1", "s2"]) for (const q of d.questions.filter((q) => q.pa)) M.noteAnswer(state, q, true, sid, "tools");
  M.noteAnswer(state, d.questions.find((q) => q.id === "p1"), true, "s2", null); // same session twice does not double count
  assert.equal(state.pa.q.p1.sessions.length, 2);
  let s = M.clusterStatus(d, state, cl);
  assert.equal(s.status, "Practicing", "only 4 drill answers so far");
  for (let i = 0; i < 6; i++) M.noteAnswer(state, d.questions.find((q) => q.id === "p1"), true, "s3", "tools");
  s = M.clusterStatus(d, state, cl);
  assert.equal(s.status, "Mastered");
  assert.deepEqual(M.paMastery(d, state), { mastered: 1, total: 1 });
  // a bad run of drill answers drops it back
  for (let i = 0; i < 4; i++) M.noteAnswer(state, d.questions.find((q) => q.id === "p1"), false, "s4", "tools");
  assert.equal(M.clusterStatus(d, state, cl).status, "Practicing");
});

test("a wrong answer never counts as a fixed session; non-miss questions never create pa entries", () => {
  const d = course();
  const state = st();
  M.noteAnswer(state, d.questions.find((q) => q.id === "p1"), false, "s1", null);
  assert.equal(state.pa.q.p1, undefined);
  M.noteAnswer(state, d.questions.find((q) => q.id === "a1"), true, "s1", null);
  assert.deepEqual(state.pa.q, {});
});

test("topic drill: unfixed misses first, then bank questions from the topic's lessons", () => {
  const d = course();
  const cl = M.paClusters(d)[0];
  const state = st();
  const first = M.pickDrill(d, state, cl, { n: 5, rng: M.mulberry(2) });
  assert.equal(first.length, 5);
  assert.ok(first.some((q) => q.id === "p1") && first.some((q) => q.id === "p2"));
  assert.ok(first.filter((q) => !q.pa).every((q) => q.lesson === "s2-l1"));
  state.pa = { q: { p1: { sessions: ["a", "b"], t: 1 } }, c: {} };
  const second = M.pickDrill(d, state, cl, { n: 5, rng: M.mulberry(2) });
  assert.ok(!second.some((q) => q.id === "p1"), "a fixed miss drops out of the drill");
});

test("old progress without pa still works everywhere", () => {
  const d = course();
  const old = { questions: { a1: right() }, cards: {}, exams: [] };
  assert.doesNotThrow(() => { M.readiness(d, old); M.nextUp(d, old); M.paMastery(d, old); M.pickDrill(d, old, M.paClusters(d)[0]); });
});

test("retake compares per topic against the original misses", () => {
  const d = course();
  const res = [{ q: d.questions.find((q) => q.id === "p1"), correct: true }, { q: d.questions.find((q) => q.id === "p2"), correct: false }];
  assert.deepEqual(M.retakeByCluster(d, res).tools, { before: 0, now: 1, of: 2 });
});
