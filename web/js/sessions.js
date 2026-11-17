// Practice, missed review and mock exam entry points plus their result screens.
import * as M from "./model.js";
import { getState, loadCourse, recordExam } from "./store.js";
import { runQuiz, whereLabel, readMore } from "./quiz.js";
import { $app, esc, setCrumb, segments, pct } from "./ui.js";

const crumbs = (d, last) => [{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${d.course.id}` }, { label: last }];

export function missedList(d, results) {
  const wrong = results.filter((r) => !r.correct);
  if (!wrong.length) return `<p class="muted">Nothing missed.</p>`;
  return wrong.map((r) => `<article class="card missed"><h3>${esc(r.q.q)}</h3>
    <p><b>Answer:</b> ${M.asArr(r.q.answer).map((k) => esc(r.q.choices[k])).join("; ")}</p>
    ${r.unanswered ? `<p class="muted">Not answered.</p>` : ""}<p class="muted">${esc(r.q.explanation)}</p>
    <p class="where">${esc(whereLabel(d, r.q))}</p>${readMore(d, r.q)}</article>`).join("");
}

export function practiceDone(d, results, ctx, again) {
  const right = results.filter((r) => r.correct).length;
  const flagged = results.length ? ctx.flagged : [];
  $app().innerHTML = `<section class="done"><h1>${right} of ${results.length} correct</h1>
    ${segments(results, results.length, -1)}
    <div class="btns row"><button class="primary" id="again">Practice again</button>${flagged.length ? `<button class="ghost" id="flag">Retry flagged (${flagged.length})</button>` : ""}<a class="btn ghost" href="#/c/${d.course.id}">Back to course</a></div>
    <h2 class="sh">Missed</h2>${missedList(d, results)}</section>`;
  $app().querySelector("#again").onclick = again;
  const f = $app().querySelector("#flag");
  if (f) f.onclick = () => runQuiz(d, { questions: flagged.map((id) => d.questions.find((q) => q.id === id)).filter(Boolean), onDone: (r, c) => practiceDone(d, r, c, again) });
}

export async function practice(id, params, missedOnly = false) {
  const d = await loadCourse(id);
  const state = getState();
  const n = +params.get("n") || 10;
  const opts = { section: params.get("section") || undefined, lesson: params.get("lesson") || undefined, source: params.get("source") || undefined };
  const label = missedOnly ? "Review missed" : opts.lesson ? M.lessonName(d, opts.lesson) : opts.section ? M.sectionTitle(d, opts.section) : opts.source === "pa" ? "Pre-assessment questions" : `Practice ${n}`;
  setCrumb(crumbs(d, label));
  const pick = () => (missedOnly ? M.shuffle(M.missedQuestions(d, getState())).slice(0, 20) : M.pickPractice(d, getState(), { n, ...opts }));
  const start = () => {
    const questions = pick();
    if (!questions.length) { $app().innerHTML = `<section class="done"><h1>${missedOnly ? "Nothing missed" : "No questions here"}</h1><p class="muted">${missedOnly ? "Questions you get wrong will show up here until you answer them correctly." : "This selection has no questions."}</p><a class="btn" href="#/c/${d.course.id}">Back to course</a></section>`; return; }
    runQuiz(d, { questions, onDone: (r, c) => practiceDone(d, r, c, start) });
  };
  start();
}

export async function exam(id) {
  const d = await loadCourse(id);
  const cfg = d.course.exam;
  setCrumb(crumbs(d, "Mock exam"));
  const questions = M.sampleExam(d, cfg.count);
  if (!questions.length) { $app().innerHTML = "<p>No questions yet.</p>"; return; }
  runQuiz(d, {
    questions, mode: "exam", minutes: cfg.minutes,
    onDone: (answered) => {
      const done = new Set(answered.map((r) => r.q.id));
      const results = [...answered, ...questions.filter((q) => !done.has(q.id)).map((q) => ({ q, correct: false, unanswered: true }))];
      const score = results.filter((r) => r.correct).length;
      const byObj = {};
      for (const r of results) { const o = (byObj[r.q.objective] ??= { n: 0, c: 0 }); o.n++; o.c += r.correct ? 1 : 0; }
      recordExam({ course: d.course.id, kind: "mock", t: Date.now(), score, total: questions.length, byObj });
      const p = pct(score, questions.length), pass = p >= cfg.passPercent;
      $app().innerHTML = `<section class="done"><p class="eyebrow">${pass ? "Passed" : "Not yet"} · pass mark ${cfg.passPercent}%</p><h1>${p}%</h1><p>${score} of ${questions.length} correct.</p>
        <div class="card tablecard"><table><thead><tr><th>Section</th><th>Score</th></tr></thead><tbody>${Object.entries(byObj).map(([o, v]) => `<tr><td>${esc(M.sectionTitle(d, o))}</td><td><b>${v.c}/${v.n}</b> (${pct(v.c, v.n)}%)</td></tr>`).join("")}</tbody></table></div>
        <div class="btns row"><a class="btn" href="#/c/${d.course.id}/quiz/missed">Review missed</a><a class="btn ghost" href="#/c/${d.course.id}">Back to course</a></div>
        <h2 class="sh">Missed</h2>${missedList(d, results)}</section>`;
    },
  });
}
