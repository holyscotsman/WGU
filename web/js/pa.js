// Pre-assessment: review the original attempt, "Fix my misses" topics, topic drills and a timed retake.
import * as M from "./model.js";
import { getState, loadCourse, recordExam } from "./store.js";
import { runQuiz, whereLabel } from "./quiz.js";
import { missedList } from "./sessions.js";
import { $app, esc, bar, chip, setCrumb, segments, LETTERS, pct } from "./ui.js";

const crumbs = (d, last, mid = null) => [
  { label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${d.course.id}` },
  ...(mid ? [mid] : []), { label: last },
];
const scoreLine = (a) => `${a.correct}/${a.total} (${pct(a.correct, a.total)}%) · ${a.status}`;
const guideLink = (d, ref) => {
  const g = ref?.lesson ? M.guideForLesson(d, ref.lesson) : null;
  return g ? `<a href="#/c/${d.course.id}/guide/${g.id}">${esc(ref.label)}</a>` : esc(ref?.label ?? "");
};

// ---------- Review attempt ----------
export async function review(id) {
  const d = await loadCourse(id);
  const a = M.paLatest(d);
  if (!a) { $app().innerHTML = "<p>No pre-assessment on this course.</p>"; return; }
  setCrumb(crumbs(d, "Review attempt"));
  const qs = M.paQuestions(d, a.n);
  let filter = "all";
  const counts = { all: qs.length, missed: qs.filter((q) => !q.pa.correct).length, correct: qs.filter((q) => q.pa.correct).length };
  const view = () => {
    const shown = qs.filter((q) => filter === "all" || (filter === "missed" ? !q.pa.correct : q.pa.correct));
    const segs = segments(qs.map((q) => ({ correct: q.pa.correct })), qs.length, -1);
    const skipped = Object.entries(a.notPlayable ?? {}).map(([n, why]) => `Question ${n}: ${why}`).join(" · ");
    $app().innerHTML = `<section class="review"><div class="chead"><h1>Pre-Assessment attempt ${a.n}</h1></div>
      <p class="pa-score"><b>${scoreLine(a)}</b></p>${segs}
      <div class="btns row"><a class="btn gold" href="#/c/${d.course.id}/pa/retake">Retake pre-assessment</a><a class="btn ghost" href="#/c/${d.course.id}/fix">Fix my misses</a></div>
      <div class="filters" role="group" aria-label="Filter questions">${["all", "missed", "correct"].map((f) => `<button type="button" class="fchip${filter === f ? " on" : ""}" data-f="${f}" aria-pressed="${filter === f}">${{ all: "All", missed: "Missed", correct: "Correct" }[f]} (${counts[f]})</button>`).join("")}</div>
      ${skipped ? `<p class="muted small">Not playable here: ${esc(skipped)}.</p>` : ""}
      <div class="rlist">${shown.map((q) => reviewCard(d, q)).join("")}</div></section>`;
    $app().querySelectorAll(".fchip").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; view(); }));
  };
  view();
}

function reviewCard(d, q) {
  const want = new Set(M.asArr(q.answer)), mine = new Set(M.asArr(q.pa.myAnswer));
  const choices = q.choices.map((c, k) => {
    const cls = want.has(k) ? "right" : mine.has(k) ? "wrong" : "dim";
    const tag = want.has(k) ? (mine.has(k) ? "Correct · your answer (attempt 1)" : "Correct") : mine.has(k) ? "Your answer (attempt 1)" : "";
    return `<div class="choice static ${cls}"><span class="k">${LETTERS[k]}</span><span class="txt">${esc(c)}</span><span class="tag">${tag}</span></div>`;
  }).join("");
  const letters = [...want].sort().map((k) => LETTERS[k]).join(", ");
  const ref = q.pa.pageRef;
  return `<article class="qcard review-q ${q.pa.correct ? "was-right" : "was-wrong"}">
    <p class="qno">Question ${q.pa.n} · ${q.pa.correct ? "answered correctly" : "missed"} <span class="qwhere">${esc(whereLabel(d, q))}</span></p>
    <h2 class="stem">${esc(q.q)}</h2><div class="choices">${choices}</div>
    <div class="why ${q.pa.correct ? "ok" : "bad"}"><h3>Why ${esc(letters)}</h3><p>${esc(q.explanation)}</p>
    ${!q.pa.correct && q.pa.trap ? `<p class="trap"><b>Why your pick was wrong:</b> ${esc(q.pa.trap)}</p>` : ""}
    ${ref?.label ? `<p class="readmore">Re-read: ${guideLink(d, ref)}</p>` : ""}</div></article>`;
}

// ---------- Fix my misses ----------
export async function fix(id, cid = null) {
  const d = await loadCourse(id);
  const a = M.paLatest(d);
  if (!a) { $app().innerHTML = "<p>No pre-assessment on this course.</p>"; return; }
  const state = getState();
  setCrumb(crumbs(d, "Fix my misses"));
  const m = M.paMastery(d, state);
  const missedTotal = a.total - a.correct;
  const patterns = a.patterns ?? [];
  const cards = M.paClusters(d).map((c) => {
    const st = M.clusterStatus(d, state, c);
    const refs = (c.pageRefs ?? []).map((r) => guideLink(d, r)).join(" · ");
    const open = c.id === cid;
    return `<article class="cluster" id="cl-${esc(c.id)}">
      <header><h3>${esc(c.title)}</h3><span class="count">${c.missed.length} missed</span>${chip(st.status)}</header>
      <p class="rule"><b>${esc(c.rule)}</b></p>
      <p class="muted small">${st.fixed} of ${st.total} misses fixed (right in two sessions)${st.accuracy === null ? "" : ` · last ${st.answers} drill answers ${st.accuracy}%`}</p>
      <div class="btns row"><a class="btn gold" href="#/c/${d.course.id}/fix/${esc(c.id)}/drill">Drill this topic</a><button type="button" class="ghost toggle" aria-expanded="${open}" aria-controls="g-${esc(c.id)}">${open ? "Hide the guide" : "Show the guide"}</button></div>
      <div class="cguide" id="g-${esc(c.id)}" ${open ? "" : "hidden"}>${c.guide?.html ?? ""}${refs ? `<p class="readmore"><b>Re-read:</b> ${refs}</p>` : ""}</div></article>`;
  }).join("");
  $app().innerHTML = `<section class="fix"><div class="chead"><h1>Fix my misses</h1></div>
    <div class="card fixhead"><p class="pa-score"><b>Attempt ${a.n}: ${scoreLine(a)}</b></p><p>${missedTotal} missed across ${M.paClusters(d).length} topics.</p>
    <p class="muted">${m.mastered} of ${m.total} topics mastered</p>${bar(pct(m.mastered, m.total), "gold", "topics mastered")}</div>
    ${patterns.length ? `<div class="card patterns"><h2>Patterns across your misses</h2><ol>${patterns.map((p) => `<li><b>${esc(p.title)}.</b> ${esc(p.text)}</li>`).join("")}</ol></div>` : ""}
    <div class="clusters">${cards}</div></section>`;
  $app().querySelectorAll(".toggle").forEach((b) => b.addEventListener("click", () => {
    const panel = document.getElementById(b.getAttribute("aria-controls"));
    const open = b.getAttribute("aria-expanded") === "true";
    panel.hidden = open; b.setAttribute("aria-expanded", String(!open)); b.textContent = open ? "Show the guide" : "Hide the guide";
  }));
  if (cid) document.getElementById(`cl-${cid}`)?.scrollIntoView({ block: "start" });
}

// ---------- Topic drill ----------
export async function drill(id, cid) {
  const d = await loadCourse(id);
  const c = M.paClusters(d).find((x) => x.id === cid);
  if (!c) { $app().innerHTML = "<p>Topic not found.</p>"; return; }
  setCrumb(crumbs(d, `Drill: ${c.title}`, { label: "Fix my misses", href: `#/c/${d.course.id}/fix` }));
  const start = () => {
    const questions = M.pickDrill(d, getState(), c);
    if (!questions.length) { $app().innerHTML = `<section class="done"><h1>No questions for this topic</h1><a class="btn" href="#/c/${d.course.id}/fix">Back to Fix my misses</a></section>`; return; }
    runQuiz(d, {
      questions, drillCluster: c.id, showTrap: true,
      onDone: (results) => {
        const right = results.filter((r) => r.correct).length;
        const st = M.clusterStatus(d, getState(), c);
        const fixedIds = M.fixedMisses(d, getState(), c);
        const names = fixedIds.map((qid) => d.questions.find((q) => q.id === qid)).filter(Boolean);
        $app().innerHTML = `<section class="done"><p class="eyebrow">${esc(c.title)}</p><h1>${right} of ${results.length} correct</h1>${segments(results, results.length, -1)}
          <div class="card"><h2>Pre-assessment misses fixed</h2><p>${st.fixed} of ${st.total} fixed (each needs a correct answer in two separate sessions)${st.accuracy === null ? "" : `, ${st.accuracy}% on your last ${st.answers} drill answers`}. Status: ${chip(st.status)}</p>
          ${names.length ? `<ul>${names.map((q) => `<li>${esc(q.q.length > 110 ? q.q.slice(0, 107).replace(/\s+\S*$/, "") + "…" : q.q)}</li>`).join("")}</ul>` : `<p class="muted">None fixed yet.</p>`}</div>
          <div class="btns row"><button class="gold" id="again">Drill again</button><a class="btn ghost" href="#/c/${d.course.id}/fix">Back to Fix my misses</a></div>
          <h2 class="sh">Missed in this drill</h2>${missedList(d, results)}</section>`;
        $app().querySelector("#again").onclick = start;
      },
    });
  };
  start();
}

// ---------- Retake ----------
export async function retake(id) {
  const d = await loadCourse(id);
  const a = M.paLatest(d);
  if (!a) { $app().innerHTML = "<p>No pre-assessment on this course.</p>"; return; }
  setCrumb(crumbs(d, "Retake pre-assessment", { label: "Review attempt", href: `#/c/${d.course.id}/pa` }));
  const questions = M.shuffle(M.paQuestions(d, a.n));
  runQuiz(d, {
    questions, mode: "exam", minutes: d.course.exam.minutes,
    onDone: (answered) => {
      const seen = new Set(answered.map((r) => r.q.id));
      const results = [...answered, ...questions.filter((q) => !seen.has(q.id)).map((q) => ({ q, correct: false, unanswered: true }))];
      const score = results.filter((r) => r.correct).length;
      const byCluster = M.retakeByCluster(d, results);
      recordExam({ course: d.course.id, kind: "pa", attempt: a.n, t: Date.now(), score, total: questions.length, byCluster });
      const rows = M.paClusters(d).map((c) => { const r = byCluster[c.id]; return `<tr><td>${esc(c.title)}</td><td>${r.of} missed</td><td><b>${r.now}/${r.of}</b> now right</td></tr>`; }).join("");
      $app().innerHTML = `<section class="done"><p class="eyebrow">Retake of attempt ${a.n}</p><h1>${score} of ${questions.length} (${pct(score, questions.length)}%)</h1>
        <p class="muted">Attempt ${a.n} was ${scoreLine(a)}. The retake now counts like a mock exam in your readiness.</p>
        <div class="card tablecard"><table><thead><tr><th>Topic</th><th>Attempt ${a.n}</th><th>Retake</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="btns row"><a class="btn gold" href="#/c/${d.course.id}/fix">Fix my misses</a><a class="btn ghost" href="#/c/${d.course.id}">Back to course</a></div>
        <h2 class="sh">Missed</h2>${missedList(d, results)}</section>`;
    },
  });
}
