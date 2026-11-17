// The question screen shared by practice, drills, missed review and exams.
import { asArr, lessonName, sectionTitle, guideForLesson, noteAnswer } from "./model.js";
import { recordQ, getState, newSession, touch } from "./store.js";
import { $app, esc, LETTERS, segments, fmtClock, onLeave } from "./ui.js";

const KEY_LETTERS = "abcde"; // F is reserved for "flag"

export function whereLabel(d, q) {
  const sec = sectionTitle(d, q.objective);
  const les = q.lesson ? lessonName(d, q.lesson) : null;
  return les ? `${sec} · ${les}` : sec;
}

export function readMore(d, q) {
  const parts = [];
  const g = guideForLesson(d, q.lesson);
  if (g) parts.push(`<a href="#/c/${d.course.id}/guide/${g.id}">Read more: ${esc(lessonName(d, q.lesson) ?? g.title)}</a>`);
  const ref = q.pa?.pageRef;
  if (ref?.lesson && ref.lesson !== q.lesson) {
    const rg = guideForLesson(d, ref.lesson);
    if (rg) parts.push(`<a href="#/c/${d.course.id}/guide/${rg.id}">Re-read: ${esc(ref.label)}</a>`);
  } else if (ref?.label && q.pa && !g) parts.push(`<span>Re-read: ${esc(ref.label)}</span>`);
  return parts.length ? `<p class="readmore">${parts.join(" · ")}</p>` : "";
}

/**
 * opts: { questions, mode: "practice" | "exam", sid, drillCluster, minutes, showTrap, onDone(results, ctx) }
 * Answers are recorded as they are checked. Exam mode hides feedback and shows a countdown.
 */
export function runQuiz(d, opts) {
  const { questions, mode = "practice", drillCluster = null, minutes = null, showTrap = true, onDone } = opts;
  const exam = mode === "exam";
  const sid = opts.sid ?? newSession();
  const results = [];
  const flagged = new Set();
  const started = Date.now();
  const deadline = minutes ? started + minutes * 60000 : null;
  let i = 0, picked = new Set(), checked = false, finished = false, clock;

  const finish = () => {
    if (finished) return; finished = true;
    clearInterval(clock);
    document.removeEventListener("keydown", onKey);
    onDone(results, { flagged: [...flagged], elapsed: Date.now() - started, sid });
  };

  function render() {
    if (i >= questions.length) return finish();
    const q = questions[i];
    const want = new Set(asArr(q.answer)), multi = want.size > 1;
    picked = new Set(); checked = false;
    const right = results.filter((r) => r.correct).length;
    const n = questions.length;
    $app().innerHTML = `<section class="quiz" aria-label="Question ${i + 1} of ${n}"><h1 class="sr">${exam ? "Mock exam" : "Practice questions"}</h1>
      <div class="qtop">
        <span><b>Question ${i + 1} of ${n}</b> · ${exam ? `${results.length} answered` : `${right} correct so far`}${flagged.size ? ` · ${flagged.size} flagged` : ""}</span>
        <span class="qwhere">${esc(whereLabel(d, q))}</span>
      </div>
      ${exam ? `<div class="qclock"><span id="clock" class="clock" role="timer" aria-label="Time remaining"></span><span class="muted">${n} questions</span></div>` : ""}
      ${segments(results, n, i, exam)}
      <article class="qcard">
        <h2 class="stem">${esc(q.q)}</h2>
        ${multi ? `<p class="hint">Select all that apply.</p>` : ""}
        <div class="choices" role="${multi ? "group" : "radiogroup"}" aria-label="Answer choices">
          ${q.choices.map((c, k) => `<button type="button" class="choice" data-k="${k}" role="${multi ? "checkbox" : "radio"}" aria-checked="false"><span class="k">${LETTERS[k]}</span><span class="txt">${esc(c)}</span><span class="tag"></span></button>`).join("")}
        </div>
        <div id="why"></div>
      </article>
      <footer class="qfoot">
        <span class="keys" aria-hidden="true">1–${Math.min(q.choices.length, 9)} to pick · Enter to ${exam ? "go on" : "check"} · F to flag</span>
        <span class="qbtns"><button type="button" class="ghost" id="flag" aria-pressed="false">Flag</button><button type="button" class="primary" id="go" disabled>${exam ? (i + 1 === n ? "Finish" : "Next") : "Check"}</button></span>
      </footer>
    </section>`;
    const $ = (s) => $app().querySelector(s);
    $app().querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.k)));
    $("#go").addEventListener("click", advance);
    $("#flag").addEventListener("click", toggleFlag);
    if (exam) tick();
  }

  /** Keep the "n correct so far" line and the segmented bar in step with the answer just checked. */
  function refreshTop() {
    const right = results.filter((r) => r.correct).length;
    const first = $app().querySelector(".qtop > span:first-child");
    if (first) first.innerHTML = `<b>Question ${i + 1} of ${questions.length}</b> · ${right} correct so far${flagged.size ? ` · ${flagged.size} flagged` : ""}`;
    const segs = $app().querySelector(".segs");
    if (segs) segs.outerHTML = segments(results, questions.length, i);
  }

  function paint() {
    $app().querySelectorAll(".choice").forEach((b) => { const on = picked.has(+b.dataset.k); b.classList.toggle("picked", on); b.setAttribute("aria-checked", String(on)); });
    const go = $app().querySelector("#go"); if (go) go.disabled = picked.size === 0;
  }
  function pick(k) {
    if (checked || k >= questions[i].choices.length) return;
    const multi = asArr(questions[i].answer).length > 1;
    if (multi) { picked.has(k) ? picked.delete(k) : picked.add(k); } else { picked = new Set([k]); }
    paint();
  }
  function toggleFlag() {
    const q = questions[i];
    flagged.has(q.id) ? flagged.delete(q.id) : flagged.add(q.id);
    const b = $app().querySelector("#flag"); if (b) { b.setAttribute("aria-pressed", String(flagged.has(q.id))); b.classList.toggle("on", flagged.has(q.id)); }
  }

  function check() {
    const q = questions[i];
    const want = new Set(asArr(q.answer));
    const correct = picked.size === want.size && [...picked].every((k) => want.has(k));
    results.push({ q, correct, picked: [...picked] });
    recordQ(q.id, correct);
    noteAnswer(getState(), q, correct, sid, drillCluster); touch();
    checked = true;
    if (exam) return;
    refreshTop();
    $app().querySelectorAll(".choice").forEach((b) => {
      const k = +b.dataset.k, tag = b.querySelector(".tag");
      b.disabled = true;
      if (want.has(k)) { b.classList.add("right"); tag.textContent = picked.has(k) ? "Correct · your answer" : "Correct"; }
      else if (picked.has(k)) { b.classList.add("wrong"); tag.textContent = "Your answer"; }
      else b.classList.add("dim");
    });
    const letters = [...want].sort().map((k) => LETTERS[k]).join(", ");
    const trap = showTrap && q.pa && !q.pa.correct && q.pa.trap && !correct ? `<p class="trap"><b>Why the pick is a trap:</b> ${esc(q.pa.trap)}</p>` : "";
    $app().querySelector("#why").innerHTML = `<div class="why ${correct ? "ok" : "bad"}" role="status"><h3>${correct ? "Correct. " : ""}Why ${esc(letters)}</h3><p>${esc(q.explanation)}</p>${trap}${readMore(d, q)}</div>`;
    const go = $app().querySelector("#go"); go.textContent = i + 1 === questions.length ? "Finish" : "Next"; go.disabled = false;
    go.focus({ preventScroll: true });
  }

  function advance() {
    if (!checked) {
      if (!picked.size) return;
      check();
      if (exam) { i++; render(); }
      return;
    }
    i++; render();
  }

  function tick() {
    const el = document.getElementById("clock");
    if (!el || !deadline) return;
    const left = deadline - Date.now();
    el.textContent = fmtClock(left);
    el.classList.toggle("low", left < 5 * 60000);
    if (left <= 0) finish();
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? "")) return;
    const k = e.key.toLowerCase();
    if (k === "enter") { if (e.target?.tagName === "A") return; e.preventDefault(); advance(); }
    else if (/^[1-9]$/.test(k)) pick(+k - 1);
    else if (KEY_LETTERS.includes(k) && k.length === 1) pick(KEY_LETTERS.indexOf(k));
    else if (k === "f") { toggleFlag(); }
  }

  document.addEventListener("keydown", onKey);
  if (deadline) clock = setInterval(tick, 500);
  onLeave(() => { finished = true; clearInterval(clock); document.removeEventListener("keydown", onKey); });
  render();
}
