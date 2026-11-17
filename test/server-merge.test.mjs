import { test } from "node:test";
import assert from "node:assert/strict";
import { merge } from "../netlify/functions/progress.mjs";

test("per-item last write wins across devices", () => {
  const out = merge({ questions: { a: { t: 2, v: "server" } } }, { questions: { a: { t: 1, v: "old" }, b: { t: 1 } } });
  assert.equal(out.questions.a.v, "server");
  assert.ok(out.questions.b);
});

test("pre-assessment progress merges per question and per cluster", () => {
  const out = merge(
    { pa: { q: { x: { t: 5, sessions: ["s1"] } }, c: { sel: { t: 5, last: [1] } } } },
    { pa: { q: { x: { t: 9, sessions: ["s1", "s2"] }, y: { t: 1, sessions: ["s3"] } }, c: {} } },
  );
  assert.deepEqual(out.pa.q.x.sessions, ["s1", "s2"]);
  assert.ok(out.pa.q.y);
  assert.deepEqual(out.pa.c.sel.last, [1]);
});

test("old saved progress without pa or games still loads", () => {
  const out = merge({ questions: { a: { t: 1 } }, cards: {}, exams: [] }, {});
  assert.deepEqual(out.pa, { q: {}, c: {} });
  assert.deepEqual(out.games, {});
});
