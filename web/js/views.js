// Home, course page, section, lesson guide and progress views.
import * as M from "./model.js";
import { getState, loadCourse, loadCourses } from "./store.js";
import { $app, esc, bar, chip, setCrumb, pct } from "./ui.js";

const rowStat = (r) => `<span class="scov">${bar(r.coverage, r.tone === "none" ? "none" : r.tone, `${r.coverage}% of questions tried`)}</span><span class="sacc ${r.tone}">${r.accuracy === null ? "n/a" : r.accuracy + "%"}</span>`;

export async function home() {
  const courses = await loadCourses();
  const state = getState();
  setCrumb([{ label: "Courses" }]);
  const cards = await Promise.all(courses.map(async (c) => {
    const d = await loadCourse(c.id);
    const r = M.readiness(d, state);
    const seen = M.summarize(state, d.questions);
    return `<a class="card course" href="#/c/${c.id}">
      <span class="chip plain">${esc(c.code ?? c.id.toUpperCase())}</span>
      <span class="ctitle">${esc(c.title)}</span>
      <span class="meta"><span>${c.counts.questions} questions</span>${c.counts.cards ? `<span>${c.counts.cards} flashcards</span>` : ""}<span>${c.counts.guides} guides</span></span>
      <span class="ready-line"><b>${r.value}%</b> exam readiness</span>
      ${bar(seen.coverage, "blue", "questions tried")}
    </a>`;
  }));
  $app().innerHTML = `<h1>Your courses</h1><div class="grid">${cards.join("") || "<p>No courses yet.</p>"}</div>`;
}

function readinessCard(d, state) {
  const r = M.readiness(d, state);
  const how = r.mock === null
    ? "Last-attempt accuracy times coverage for each section, weighted by question count."
    : `Section accuracy times coverage, averaged with your latest mock exam (${r.mock}%).`;
  return `<section class="card ready" aria-labelledby="rd-h"><h2 id="rd-h">Exam readiness</h2>
    <div class="big">${r.value}<small>%</small></div>
    <div class="gauge" role="img" aria-label="Readiness ${r.value}% against a pass mark of ${r.passMark}%"><i style="width:${r.value}%"></i><b style="left:${r.passMark}%"><span>${r.passMark}% pass</span></b></div>
    <p class="muted">${how}</p></section>`;
}

function paCard(d, state) {
  const a = M.paLatest(d);
  if (!a) return "";
  const m = M.paMastery(d, state);
  const retake = (state.exams ?? []).filter((e) => e.course === d.course.id && e.kind === "pa").sort((x, y) => x.t - y.t).at(-1);
  const score = `${a.correct}/${a.total} (${pct(a.correct, a.total)}%)`;
  return `<section class="card pa" aria-labelledby="pa-h"><h2 id="pa-h">Pre-Assessment ${a.n}</h2>
    <p class="pa-score"><b>${score}</b> · ${esc(a.status)}${retake ? ` <span class="retake">Retake ${retake.score}/${retake.total} (${pct(retake.score, retake.total)}%)</span>` : ""}</p>
    <p class="muted">${m.mastered} of ${m.total} weak topics mastered</p>
    ${bar(pct(m.mastered, m.total), "gold", "weak topics mastered")}
    <div class="btns"><a class="btn gold" href="#/c/${d.course.id}/fix">Fix my misses</a><a class="btn ghost" href="#/c/${d.course.id}/pa">Review attempt</a></div></section>`;
}

export async function course(id) {
  const d = await loadCourse(id);
  const state = getState();
  const cid = d.course.id;
  setCrumb([{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim() }]);

  const nu = M.nextUp(d, state);
  const nextCard = nu
    ? `<section class="card nextup" aria-labelledby="nu-h"><p class="eyebrow" id="nu-h">Next up</p><h2>${esc(nu.title)}</h2><p class="muted">${esc(nu.why)} About ${nu.minutes} min.</p><a class="btn gold" href="${nu.href}">Continue</a></section>`
    : `<section class="card nextup done"><p class="eyebrow">Next up</p><h2>You are caught up</h2><p class="muted">Every section is covered and accurate. Take a mock exam to confirm.</p><a class="btn gold" href="#/c/${cid}/exam">Start a mock exam</a></section>`;

  const rows = M.sectionRows(d, state).map((r) => `
    <li><a class="srow" href="#/c/${cid}/section/${r.id}">
      <span class="num">${r.number}</span><span class="stitle">${esc(r.title)}</span>${rowStat(r)}${chip(r.status)}
    </a></li>`).join("");

  const missed = M.missedQuestions(d, state).length;
  const due = d.cards.filter((c) => (state.cards[c.id]?.due ?? 0) <= Date.now()).length;
  const row = (href, label, right = "", cls = "") => `<a class="arow ${cls}" href="${href}"><span>${label}</span><span class="rt">${right}</span></a>`;
  const actions = `<section class="actions" aria-label="Study actions">
      ${row(`#/c/${cid}/quiz`, "Practice 10 questions", "weakest first", "primary")}
      <div class="subrow"><a href="#/c/${cid}/quiz?n=20">20 questions</a>${M.paAttempts(d).length ? `<a href="#/c/${cid}/quiz?source=pa">Pre-assessment only</a>` : ""}</div>
      ${row(`#/c/${cid}/quiz/missed`, "Review missed", `<b class="redcount">${missed}</b>`)}
      ${d.cards.length ? row(`#/c/${cid}/cards`, "Flashcards", `<b class="goldcount">${due} due</b>`) : ""}
      ${row(`#/c/${cid}/exam`, "Mock exam", `${d.course.exam.count} questions · ${d.course.exam.minutes} min`)}
      ${row(`#/c/${cid}/game/speed`, "Speed round", "60 seconds")}
      ${d.cards.length >= 4 ? row(`#/c/${cid}/game/match`, "Term match", "pair terms") : ""}
      ${row(`#/c/${cid}/progress`, "Progress", "by section")}
    </section>`;

  $app().innerHTML = `<div class="chead"><span class="chip plain">${esc(d.course.code ?? "")}</span><h1>${esc(d.course.title)}</h1></div>
    <div class="cols2"><div class="mainc">${nextCard}<h2 class="sh">Sections</h2><ol class="sections">${rows}</ol></div>
    <aside class="side">${paCard(d, state)}${readinessCard(d, state)}${actions}</aside></div>`;
}

export async function section(id, sid) {
  const d = await loadCourse(id);
  const state = getState();
  const cid = d.course.id;
  const row = M.sectionRows(d, state).find((r) => r.id === sid);
  if (!row) { $app().innerHTML = "<p>Section not found.</p>"; return; }
  const title = M.sectionTitle(d, sid);
  setCrumb([{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${cid}` }, { label: title }]);
  const lessons = M.lessonRows(d, state, sid);
  const overview = d.guides.find((g) => g.lesson === `${sid}-l0` && g.kind === "lesson");

  let body;
  if (lessons.length) {
    body = `<ol class="lessons">${lessons.map((l) => {
      const g = M.guideForLesson(d, l.id);
      return `<li class="lrow"><div class="lmain"><span class="ltitle">Lesson ${l.number}: ${esc(l.title)}</span><span class="lmeta">${l.total} questions</span></div>
        ${rowStat(l)}${chip(l.status)}
        <div class="lbtns">${g ? `<a class="btn ghost" href="#/c/${cid}/guide/${g.id}">Guide</a>` : ""}<a class="btn" href="#/c/${cid}/quiz?lesson=${l.id}">Drill</a></div></li>`;
    }).join("")}</ol>`;
  } else {
    const gs = d.guides.filter((g) => g.objectives.includes(sid));
    body = `<ol class="guidelist">${gs.map((g) => `<li><a href="#/c/${cid}/guide/${g.id}">${esc(g.title)}</a></li>`).join("")}</ol>`;
  }
  $app().innerHTML = `<div class="chead"><h1>${esc(title)}</h1></div>
    <div class="sstats card"><div><b>${row.coverage}%</b><span>of questions tried</span></div><div><b>${row.accuracy === null ? "n/a" : row.accuracy + "%"}</b><span>accuracy on last attempts</span></div><div>${chip(row.status)}</div></div>
    <div class="btns row"><a class="btn primary" href="#/c/${cid}/quiz?section=${sid}">Drill this section</a><a class="btn ghost" href="#/c/${cid}/quiz?section=${sid}&n=20">20 questions</a>${overview ? `<a class="btn ghost" href="#/c/${cid}/guide/${overview.id}">Section overview</a>` : ""}</div>
    <h2 class="sh">${lessons.length ? "Lessons" : "Study guides"}</h2>${body}`;
}

export async function guide(id, gid) {
  const d = await loadCourse(id);
  const cid = d.course.id;
  const k = d.guides.findIndex((x) => x.id === gid);
  const g = d.guides[k];
  if (!g) { $app().innerHTML = "<p>Guide not found.</p>"; return; }
  const sec = g.objectives[0];
  setCrumb([{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${cid}` }, { label: M.sectionTitle(d, sec).replace(/:.*/, ""), href: `#/c/${cid}/section/${sec}` }, { label: g.title }]);
  const prev = d.guides[k - 1], next = d.guides[k + 1];
  const drill = g.lesson && !g.lesson.endsWith("-l0") ? `#/c/${cid}/quiz?lesson=${g.lesson}` : `#/c/${cid}/quiz?section=${sec}`;
  $app().innerHTML = `<div class="guide-wrap"><div class="btns row top"><a class="btn primary" href="${drill}">${g.lesson && !g.lesson.endsWith("-l0") ? "Drill this lesson" : "Drill this section"}</a></div>
    <article class="guide">${g.html}</article>
    <nav class="guide-nav">${prev ? `<a class="btn ghost" href="#/c/${cid}/guide/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="btn" href="#/c/${cid}/guide/${next.id}">${esc(next.title)} →</a>` : `<a class="btn" href="${drill}">Practice</a>`}</nav></div>`;
  scrollTo(0, 0);
}

export async function progress(id) {
  const d = await loadCourse(id);
  const state = getState();
  const cid = d.course.id;
  setCrumb([{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${cid}` }, { label: "Progress" }]);
  const secs = M.sectionRows(d, state).map((r) => `
    <tr><td><a href="#/c/${cid}/section/${r.id}"><b>Section ${r.number}</b> ${esc(r.title)}</a><div class="muted">${r.seen} of ${r.total} tried</div></td>
    <td class="w">${rowStat(r)}</td><td>${chip(r.status)}</td><td><a class="btn small" href="#/c/${cid}/quiz?section=${r.id}">Drill</a></td></tr>`).join("");
  const exams = M.examsOf(state, cid).reverse();
  const games = Object.entries(state.games ?? {}).filter(([k]) => k.startsWith(`${cid}:`));
  $app().innerHTML = `<h1>Progress</h1>
    <div class="card tablecard"><table><thead><tr><th>Section</th><th>Coverage and accuracy</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${secs}</tbody></table></div>
    <h2 class="sh">Mock exams</h2>${exams.map((e) => `<div class="card line"><span>${new Date(e.t).toLocaleDateString()}${e.kind === "pa" ? " · pre-assessment retake" : ""}</span><b>${e.score}/${e.total} (${pct(e.score, e.total)}%)</b></div>`).join("") || "<p class='muted'>None taken yet.</p>"}
    ${games.length ? `<h2 class="sh">Game records</h2>${games.map(([k, v]) => `<div class="card line"><span>${k.endsWith("speed") ? "Speed round" : "Term match"}</span><b>${k.endsWith("speed") ? v.best + " points" : v.best + " s"}</b></div>`).join("")}` : ""}`;
}
