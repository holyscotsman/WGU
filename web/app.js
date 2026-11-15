const $app = document.getElementById("app");
const $sync = document.getElementById("sync");
const $logout = document.getElementById("logout");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DAY = 864e5;
const BOX_DAYS = [0, 1, 3, 7, 14, 30];
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const tone = (p) => (p >= 80 ? "ok" : p >= 60 ? "mid" : "low");
const explain = (t) => t.replace(/^(That's right|Correct)[!.]\s*/i, "");
const choiceHTML = (c, k, multi) => `<label class="choice" data-k="${k}"><input type="${multi ? "checkbox" : "radio"}" name="a" value="${k}"><span class="k">${"ABCDEFGH"[k]}</span><span>${esc(c)}</span></label>`;
const asArr = (a) => (Array.isArray(a) ? a : [a]);
const ICON = {
  quiz: '<path d="M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14"/><circle cx="12" cy="17.5" r=".6"/><circle cx="12" cy="12" r="9"/>',
  missed: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l2.5 2"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  exam: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  speed: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  match: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M14 6.5h3.5a2 2 0 0 1 2 2V11M10 17.5H6.5a2 2 0 0 1-2-2V13"/>',
};
const icon = (k) => `<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span>`;
const empty = (title, msg, href, label = "Back") => `<div class="empty"><h2>${title}</h2><p>${msg}</p>${href ? `<a class="btn" href="${href}">${label}</a>` : ""}</div>`;
const setSync = (text, s = "ok") => { $sync.textContent = text; $sync.dataset.s = s; };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- progress state (localStorage cache + server sync) ----------
const LS = "wgu-progress-v1";
let state = (() => { try { return JSON.parse(localStorage.getItem(LS)) ?? { questions: {}, cards: {}, exams: [], games: {} }; } catch { return { questions: {}, cards: {}, exams: [], games: {} }; } })();
let pushTimer;
const persist = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch {} };

async function api(path, opts) {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}
async function pull() {
  state = await api("/api/progress");
  persist();
}
function push() {
  persist();
  clearTimeout(pushTimer);
  setSync("Saving…", "pending");
  pushTimer = setTimeout(async () => {
    try {
      state = await api("/api/progress", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
      persist();
      setSync("Saved");
    } catch (e) {
      if (e.status === 401) return showLogin();
      setSync("Sync failed, will retry", "error");
    }
  }, 800);
}
const recordQ = (id, correct) => { const p = state.questions[id] ?? { n: 0, c: 0 }; state.questions[id] = { n: p.n + 1, c: p.c + (correct ? 1 : 0), last: correct, t: Date.now() }; push(); };
const recordGame = (key, score, better) => { const p = state.games?.[key]; if (!state.games) state.games = {}; if (!p || better(score, p.best)) { state.games[key] = { best: score, t: Date.now() }; push(); return true; } return false; };
const recordCard = (id, good) => {
  const box = good ? Math.min((state.cards[id]?.box ?? 0) + 1, BOX_DAYS.length - 1) : 1;
  state.cards[id] = { box, due: Date.now() + BOX_DAYS[box] * DAY, t: Date.now() };
  push();
};

// ---------- data ----------
const cache = {};
const loadCourse = (id) => (cache[id] ??= api(`/api/data?name=${encodeURIComponent(id)}`));

// ---------- views ----------
async function home() {
  const courses = await api("/api/data?name=courses");
  const cardHTML = (c) => {
    const seen = Object.keys(state.questions).filter((k) => k.startsWith(`${c.id}-`)).length;
    const p = pct(seen, c.counts.questions);
    return `<a class="card course" href="#/c/${c.id}"><div class="bar-top"></div><span class="go" aria-hidden="true">→</span><div class="body">
      <span class="chip">${esc(c.code ?? c.id.toUpperCase())}</span><span class="t">${esc(c.title)}</span>
      <div class="meta"><span><b>${c.counts.guides}</b> guides</span><span><b>${c.counts.questions}</b> questions</span>${c.counts.cards ? `<span><b>${c.counts.cards}</b> cards</span>` : ""}</div>
      <div class="prog"><div class="bar ${tone(p)}"><i style="width:${p}%"></i></div><span class="muted"><span>Questions attempted</span><span>${p}%</span></span></div></div></a>`;
  };
  $app.innerHTML = `<div class="page-head"><div><span class="eyebrow">Dashboard</span><h1>Your courses</h1><p>Pick up where you left off. Progress syncs across your devices.</p></div></div>
    ${courses.length ? `<div class="grid">${courses.map(cardHTML).join("")}</div>` : empty("No courses yet", "Ingest a course and rebuild the site to see it here.")}`;
}

function objStats(d) {
  return d.course.objectives.map((o) => {
    const qs = d.questions.filter((q) => q.objective === o.id);
    const seen = qs.filter((q) => state.questions[q.id]);
    const n = seen.reduce((s, q) => s + state.questions[q.id].n, 0);
    const c = seen.reduce((s, q) => s + state.questions[q.id].c, 0);
    return { ...o, total: qs.length, seen: seen.length, acc: n ? c / n : null };
  });
}

async function course(id) {
  const d = await loadCourse(id);
  const now = Date.now();
  const due = d.cards.filter((c) => (state.cards[c.id]?.due ?? 0) <= now).length;
  const mine = d.questions.filter((q) => state.questions[q.id]);
  const n = mine.reduce((a, q) => a + state.questions[q.id].n, 0), c = mine.reduce((a, q) => a + state.questions[q.id].c, 0);
  const missed = mine.filter((q) => !state.questions[q.id].last).length;
  const act = (href, ic, title, sub, cls = "") => `<a class="act ${cls}" href="#/c/${id}/${href}">${icon(ic)}<b>${title}</b><small>${sub}</small></a>`;
  const byObj = d.course.objectives.map((o) => ({ o, gs: d.guides.filter((g) => g.objectives.includes(o.id)) })).filter((x) => x.gs.length);
  $app.innerHTML = `<a class="crumb" href="#/">← All courses</a>
    <section class="hero"><div><span class="chip">${esc(d.course.code ?? "")}</span><h1>${esc(d.course.title)}</h1><p class="sub">${d.guides.length} guides · ${d.questions.length} questions${d.cards.length ? ` · ${d.cards.length} flashcards` : ""}</p></div>
      <div class="stats"><div><b>${n ? pct(c, n) + "%" : "n/a"}</b><span>accuracy</span></div><div><b>${mine.length}/${d.questions.length}</b><span>questions seen</span></div><div><b>${d.cards.length ? due : "n/a"}</b><span>cards due</span></div></div></section>
    <div class="sec-title"><h2>Study</h2></div><div class="actions${d.cards.length ? " feature" : ""}">
      ${act("quiz", "quiz", "Practice quiz", "20 questions, unseen first")}
      ${act("quiz/missed", "missed", "Missed questions", missed ? `${missed} to review` : "Nothing missed yet", missed ? "red" : "")}
      ${d.cards.length ? act("cards", "cards", "Flashcards", `${due} due now`, "gold") : ""}
      ${act("exam", "exam", "Mock exam", `${d.course.exam?.count ?? 50} questions, timed`, "green")}
      ${act("progress", "progress", "Progress", "Accuracy by objective")}
    </div>
    <div class="sec-title"><h2>Games</h2></div><div class="actions">
      ${act("game/speed", "speed", "Speed round", "60 seconds, build a streak", "gold")}
      ${d.cards.length >= 4 ? act("game/match", "match", "Term match", "Pair terms and definitions", "gold") : ""}
    </div>
    <div class="sec-title"><h2>Study guides</h2></div>${byObj.map(({ o, gs }, k) => `<details class="sec"${byObj.length === 1 || k === 0 ? " open" : ""}><summary><span>${esc(o.title)}</span><span class="muted">${gs.length}</span></summary><div class="glist">${gs.map((g) => `<a href="#/c/${id}/guide/${g.id}">${esc(g.title)}</a>`).join("")}</div></details>`).join("") || empty("No guides yet", "Study guides for this course haven't been added.")}`;
}

async function guide(id, gid) {
  const d = await loadCourse(id);
  const k = d.guides.findIndex((x) => x.id === gid), g = d.guides[k];
  if (!g) { $app.innerHTML = empty("Guide not found", "This guide may have been moved or renamed.", `#/c/${id}`, "Back to course"); return; }
  const prev = d.guides[k - 1], next = d.guides[k + 1];
  $app.innerHTML = `<div class="guide-wrap"><a class="crumb" href="#/c/${id}">← ${esc(d.course.title)}</a><article class="guide">${g.html}</article>
    <nav class="guide-nav">${prev ? `<a class="btn secondary" href="#/c/${id}/guide/${prev.id}">← Previous</a>` : "<span></span>"}${next ? `<a class="btn" href="#/c/${id}/guide/${next.id}">Next →</a>` : `<a class="btn" href="#/c/${id}/quiz">Practice quiz</a>`}</nav></div>`;
  scrollTo(0, 0);
}

// Generic quiz runner used by practice + exam.
function runQuiz(questions, { exam = false, onDone, results = [] }) {
  let i = 0;
  const render = () => {
    if (i >= questions.length) return onDone(results);
    const q = questions[i], multi = asArr(q.answer).length > 1, sel = new Set();
    $app.innerHTML = `<div class="qhead"><span>${exam ? "Exam" : "Practice"} · Question ${i + 1} of ${questions.length}</span><span>Objective ${esc(q.objective)}</span></div>
      <div class="bar"><i style="width:${pct(i + 1, questions.length)}%"></i></div>
      <div class="card qcard"><p class="stem">${esc(q.q)}</p>${multi ? '<p class="muted">Select all that apply.</p>' : ""}
      ${q.choices.map((c, k) => choiceHTML(c, k, multi)).join("")}
      <div id="fb"></div><button id="go">${exam ? "Next" : "Check"}</button></div>`;
    const go = document.getElementById("go");
    $app.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => { inp.checked ? sel.add(+inp.value) : sel.delete(+inp.value); }));
    let checked = false;
    go.onclick = () => {
      if (checked) { i++; return render(); }
      if (!sel.size) return;
      const want = new Set(asArr(q.answer));
      const correct = sel.size === want.size && [...sel].every((k) => want.has(k));
      results.push({ q, correct });
      if (!exam) recordQ(q.id, correct);
      if (exam) { i++; return render(); }
      checked = true; go.textContent = i + 1 < questions.length ? "Next" : "Finish";
      $app.querySelectorAll(".choice").forEach((el) => { const k = +el.dataset.k; el.querySelector("input").disabled = true; if (want.has(k)) el.classList.add("ok"); else if (sel.has(k)) el.classList.add("bad"); });
      document.getElementById("fb").innerHTML = `<div class="fb ${correct ? "ok" : "bad"}"><b>${correct ? "Correct" : "Not quite"}</b>${esc(explain(q.explanation))}</div>`;
    };
  };
  render();
}

async function quiz(id, mode, params) {
  const d = await loadCourse(id);
  const obj = params.get("obj");
  let pool = d.questions.filter((q) => !obj || q.objective === obj);
  if (mode === "missed") pool = pool.filter((q) => state.questions[q.id] && !state.questions[q.id].last);
  else pool = shuffle(pool).sort((a, b) => (state.questions[a.id]?.n ?? 0) - (state.questions[b.id]?.n ?? 0)); // unseen first
  pool = pool.slice(0, 20);
  if (!pool.length) { $app.innerHTML = mode === "missed" ? empty("Nothing to review", "You haven't missed any questions yet. Take a practice quiz to find weak spots.", `#/c/${id}/quiz`, "Start practice quiz") : empty("No questions available", "There are no questions for this selection.", `#/c/${id}`); return; }
  runQuiz(shuffle(pool), { onDone: (r) => {
    const c = r.filter((x) => x.correct).length, p = pct(c, r.length);
    $app.innerHTML = `<div class="card result"><span class="eyebrow">${mode === "missed" ? "Review" : "Practice"} complete</span><div class="ring ${tone(p)}" style="--p:${p}"><b>${p}%</b></div><h1>${c} of ${r.length} correct</h1><p class="muted">${p >= 80 ? "Strong work. Keep the streak going." : p >= 60 ? "Getting there. Review the misses and try again." : "Worth another pass. Missed questions are saved for review."}</p>
      <div class="row"><a class="btn" href="#/c/${id}/quiz">Another quiz</a><a class="btn secondary" href="#/c/${id}">Back to course</a></div></div>`;
  } });
}

async function exam(id) {
  const d = await loadCourse(id);
  const cfg = { count: 50, minutes: 90, passPercent: 70, ...d.course.exam };
  const qs = shuffle(d.questions).slice(0, cfg.count);
  if (!qs.length) { $app.innerHTML = empty("No questions", "This course has no questions for a mock exam yet.", `#/c/${id}`); return; }
  const deadline = Date.now() + cfg.minutes * 60000;
  let finished = false;
  const finish = (results) => {
    if (finished) return; finished = true;
    clearInterval(timer);
    // Unanswered questions (timeout) count as wrong.
    const answered = new Set(results.map((r) => r.q.id));
    for (const q of qs) if (!answered.has(q.id)) results.push({ q, correct: false });
    const score = results.filter((r) => r.correct).length, pct = Math.round((score / qs.length) * 100);
    const byObj = {};
    for (const r of results) { const o = (byObj[r.q.objective] ??= { n: 0, c: 0 }); o.n++; o.c += r.correct; recordQ(r.q.id, r.correct); }
    state.exams.push({ course: id, t: Date.now(), score, total: qs.length, byObj }); push();
    const pass = pct >= cfg.passPercent, names = Object.fromEntries(d.course.objectives.map((o) => [o.id, o.title]));
    $app.innerHTML = `<div class="card result ${pass ? "pass" : "fail"}"><span class="eyebrow">Mock exam · ${pass ? "Pass" : "Not yet"}</span><div class="ring ${pass ? "ok" : tone(pct)}" style="--p:${pct}"><b>${pct}%</b></div><h1>${score} of ${qs.length} correct</h1><p class="muted">Pass mark ${cfg.passPercent}%.</p></div>
      <div class="sec-title"><h2>By objective</h2></div>
      <div class="card"><table><tr><th>Objective</th><th>Score</th></tr>${Object.entries(byObj).map(([o, v]) => { const p = Math.round((v.c / v.n) * 100); return `<tr><td><b>${esc(names[o] ?? o)}</b></td><td style="min-width:9rem"><div class="bar ${tone(p)}"><i style="width:${p}%"></i></div><span class="muted">${v.c}/${v.n} · ${p}%</span></td></tr>`; }).join("")}</table></div>
      <div class="sec-title"><h2>Missed</h2></div>${results.filter((r) => !r.correct).map((r) => `<div class="card missed"><strong>${esc(r.q.q)}</strong><p class="muted">${esc(explain(r.q.explanation))}</p></div>`).join("") || "<p class='muted'>None. Perfect score.</p>"}
      <div class="row" style="margin-top:2rem"><a class="btn" href="#/c/${id}">Back to course</a></div>`;
  };
  const results = [];
  const timer = setInterval(() => {
    if (Date.now() >= deadline || !location.hash.includes("/exam")) { clearInterval(timer); if (location.hash.includes("/exam")) finish(results); }
  }, 1000);
  runQuiz(qs, { exam: true, results, onDone: (r) => finish(r) });
}

async function cards(id) {
  const d = await loadCourse(id);
  const queue = shuffle(d.cards.filter((c) => (state.cards[c.id]?.due ?? 0) <= Date.now()));
  let i = 0, flipped = false;
  const render = () => {
    if (i >= queue.length) { $app.innerHTML = queue.length ? `<div class="card result"><span class="eyebrow">Flashcards</span><h1>Session complete</h1><p class="muted">You reviewed ${queue.length} card${queue.length === 1 ? "" : "s"}. They'll come back when they're due.</p><div class="row"><a class="btn" href="#/c/${id}">Back to course</a></div></div>` : empty("Nothing due", "All caught up. Cards return on a spaced schedule, so check back later.", `#/c/${id}`, "Back to course"); return; }
    const c = queue[i];
    const box = state.cards[c.id]?.box;
    $app.innerHTML = `<div class="qhead"><span>Card ${i + 1} of ${queue.length}</span><span>${box ? `Box ${box} of 5` : "New card"}</span></div><div class="bar"><i style="width:${pct(i + 1, queue.length)}%"></i></div><div class="card flash${flipped ? " back" : ""}" id="f">${esc(flipped ? c.back : c.front)}</div><p class="muted" style="text-align:center">${flipped ? "How did you do?" : "Tap the card to flip"}</p>
      <div class="row">${flipped ? '<button id="bad" class="secondary">Missed it</button><button id="good">Got it</button>' : '<button id="flip">Flip</button>'}</div>`;
    document.getElementById("f").onclick = () => { flipped = !flipped; render(); };
    const on = (sel, fn) => { const el = document.querySelector(sel); if (el) el.onclick = fn; };
    on("#flip", () => { flipped = true; render(); });
    on("#good", () => { recordCard(c.id, true); i++; flipped = false; render(); });
    on("#bad", () => { recordCard(c.id, false); i++; flipped = false; render(); });
  };
  render();
}

async function progress(id) {
  const d = await loadCourse(id);
  const exams = state.exams.filter((e) => e.course === id).sort((a, b) => b.t - a.t);
  const games = Object.entries(state.games ?? {}).filter(([k]) => k.startsWith(`${id}:`));
  const rows = objStats(d).filter((o) => o.total).map((o) => { const p = o.acc === null ? null : Math.round(o.acc * 100);
    return `<tr><td><b>${esc(o.title)}</b><div class="muted">${o.seen}/${o.total} seen</div></td>
    <td style="min-width:8rem">${p === null ? '<span class="muted">not started</span>' : `<div class="bar ${tone(p)}"><i style="width:${p}%"></i></div><span class="muted">${p}%</span>`}</td>
    <td style="text-align:right"><a class="drill" href="#/c/${id}/quiz?obj=${encodeURIComponent(o.id)}">Drill</a></td></tr>`; }).join("");
  $app.innerHTML = `<a class="crumb" href="#/c/${id}">← ${esc(d.course.title)}</a><div class="page-head"><div><span class="eyebrow">${esc(d.course.code ?? "")}</span><h1>Progress</h1><p>Accuracy by objective. Drill any area to focus on it.</p></div></div>
    <div class="card"><table><tr><th>Objective</th><th>Accuracy</th><th></th></tr>${rows}</table></div>
    <div class="sec-title"><h2>Mock exams</h2></div>${exams.length ? `<div class="card" style="padding:0">${exams.map((e) => `<div class="list-row" style="border-bottom:1px solid var(--line)"><span>${new Date(e.t).toLocaleDateString(undefined, { dateStyle: "medium" })}</span><b>${e.score}/${e.total} · ${pct(e.score, e.total)}%</b></div>`).join("")}</div>` : empty("No mock exams yet", "Take a timed mock exam to see how you'd score.", `#/c/${id}/exam`, "Start mock exam")}
    ${games.length ? `<div class="sec-title"><h2>Game records</h2></div><div class="card" style="padding:0">${games.map(([k, v]) => `<div class="list-row"><span>${k.endsWith("speed") ? "Speed round" : "Term match"}</span><b>${k.endsWith("speed") ? v.best + " pts" : v.best + "s"}</b></div>`).join("")}</div>` : ""}`;
}

// ---------- games ----------
async function speed(id) {
  const d = await loadCourse(id);
  if (!d.questions.length) { $app.innerHTML = empty("No questions", "This course has no questions for the speed round.", `#/c/${id}`); return; }
  const LIMIT = 60;
  const pool = shuffle(d.questions);
  let i = 0, score = 0, streak = 0, best = 0, end = Date.now() + LIMIT * 1000, timer;
  const finish = () => {
    clearInterval(timer);
    const record = recordGame(`${id}:speed`, score, (a, b) => a > b);
    $app.innerHTML = `<div class="card result"><span class="eyebrow">Speed round · Time</span><p class="stat">${score}</p><p class="muted">points · best streak ${best}</p><p><b>${record ? "New personal best." : `Personal best ${state.games[`${id}:speed`].best}.`}</b></p>
      <div class="row"><button id="again">Play again</button><a class="btn secondary" href="#/c/${id}">Back to course</a></div></div>`;
    document.getElementById("again").onclick = () => speed(id);
  };
  const render = () => {
    const q = pool[i % pool.length], multi = asArr(q.answer).length > 1, sel = new Set();
    $app.innerHTML = `<div class="hud"><span class="timer" id="t"></span><span class="muted">Score ${score} · Streak ${streak}</span></div>
      <div class="card qcard"><p class="stem">${esc(q.q)}</p>${multi ? '<p class="muted">Select all that apply.</p>' : ""}
      ${q.choices.map((c, k) => choiceHTML(c, k, multi)).join("")}
      <div id="fb"></div><button id="go">${multi ? "Lock in" : "Answer"}</button></div>`;
    const tick = () => { const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const el = document.getElementById("t"); if (el) el.textContent = `${left}s`; if (left <= 0) finish(); };
    tick();
    let locked = false;
    const submit = () => {
      if (locked || !sel.size) return; locked = true;
      const want = new Set(asArr(q.answer)), ok = sel.size === want.size && [...sel].every((k) => want.has(k));
      recordQ(q.id, ok);
      if (ok) { streak++; best = Math.max(best, streak); score += 1 + Math.floor(streak / 3); i++; return render(); }
      streak = 0; i++;
      $app.querySelectorAll(".choice").forEach((el) => { const k = +el.dataset.k; el.querySelector("input").disabled = true; if (want.has(k)) el.classList.add("ok"); else if (sel.has(k)) el.classList.add("bad"); });
      document.getElementById("fb").innerHTML = `<div class="fb bad"><b>Missed</b>${esc(explain(q.explanation))}</div>`;
      const go = document.getElementById("go"); go.textContent = "Next"; go.onclick = render; locked = false; go.dataset.next = "1";
    };
    $app.querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      inp.checked ? sel.add(+inp.value) : sel.delete(+inp.value);
      if (!multi) submit(); // single-choice answers lock in immediately for speed
    }));
    document.getElementById("go").onclick = () => { if (document.getElementById("go").dataset.next) return render(); submit(); };
    clearInterval(timer); timer = setInterval(tick, 250);
  };
  window.addEventListener("hashchange", () => clearInterval(timer), { once: true });
  render();
}

async function match(id) {
  const d = await loadCourse(id);
  const short = (t) => { const first = t.split(/(?<=[.!?])\s/)[0]; return first.length > 150 ? first.slice(0, 147) + "…" : first; };
  const cards = d.cards.filter((c) => c.back.length > 20);
  if (cards.length < 4) { $app.innerHTML = empty("Not enough flashcards", "Term match needs at least four flashcards with definitions.", `#/c/${id}`); return; }
  const ROUND = Math.min(6, cards.length);
  const set = shuffle(cards).slice(0, ROUND);
  const start = Date.now(); let left = ROUND, misses = 0, pickT = null, pickD = null, timer;
  const defs = shuffle(set);
  $app.innerHTML = `<div class="hud"><span class="timer" id="t">0.0s</span><span class="muted" id="m">Misses 0</span></div><p class="muted">Pick a term, then its definition.</p>
    <div class="cols"><div>${set.map((c) => `<button class="tile" data-t="${c.id}">${esc(c.front)}</button>`).join("<br>")}</div>
    <div>${defs.map((c) => `<button class="tile" data-d="${c.id}">${esc(short(c.back))}</button>`).join("<br>")}</div></div>`;
  timer = setInterval(() => { document.getElementById("t").textContent = `${((Date.now() - start) / 1000).toFixed(1)}s`; }, 100);
  window.addEventListener("hashchange", () => clearInterval(timer), { once: true });
  const check = () => {
    if (!pickT || !pickD) return;
    const t = pickT, dd = pickD; pickT = pickD = null;
    if (t.dataset.t === dd.dataset.d) {
      t.classList.add("done"); dd.classList.add("done"); left--;
      if (!left) {
        clearInterval(timer);
        const secs = Math.round(((Date.now() - start) / 1000 + misses * 5) * 10) / 10;
        const record = recordGame(`${id}:match`, secs, (a, b) => a < b);
        $app.innerHTML = `<div class="card result"><span class="eyebrow">Term match · Done</span><p class="stat">${secs}s</p><p class="muted">Time plus 5s per miss (${misses})</p><p><b>${record ? "New personal best." : `Personal best ${state.games[`${id}:match`].best}s.`}</b></p>
          <div class="row"><button id="again">Play again</button><a class="btn secondary" href="#/c/${id}">Back to course</a></div></div>`;
        document.getElementById("again").onclick = () => match(id);
      }
    } else {
      misses++; document.getElementById("m").textContent = `Misses ${misses}`;
      for (const el of [t, dd]) { el.classList.remove("sel"); el.classList.add("wrong"); setTimeout(() => el.classList.remove("wrong"), 500); }
    }
  };
  $app.querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => {
    const isT = "t" in b.dataset;
    const prev = isT ? pickT : pickD;
    if (prev) prev.classList.remove("sel");
    b.classList.add("sel");
    if (isT) pickT = b; else pickD = b;
    check();
  }));
}

// ---------- auth + router ----------
function showLogin(msg = "") {
  $logout.hidden = true;
  $sync.textContent = "";
  $app.innerHTML = `<div class="login-wrap"><form class="card login" id="lf"><span class="eyebrow">Private study space</span><h1>WGU <em>Study</em></h1><p class="muted${msg ? " err" : ""}" role="${msg ? "alert" : ""}">${esc(msg) || "Enter your password to continue."}</p><label for="pw">Password</label><input type="password" id="pw" autocomplete="current-password" autofocus required><button>Log in</button><p class="fine">Guides, quizzes, flashcards and progress tracking.</p></form></div>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: document.getElementById("pw").value }) }); await start(); }
    catch { showLogin("Invalid password."); }
  };
}
$logout.onclick = async () => { await fetch("/api/auth", { method: "DELETE" }); showLogin(); };

async function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const p = path.split("/").filter(Boolean), params = new URLSearchParams(qs);
  if (!$app.querySelector(".skel")) $app.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
  try {
    if (!p.length) return await home();
    if (p[0] === "c") {
      const [, id, view, arg] = p;
      if (!view) return await course(id);
      if (view === "guide") return await guide(id, arg);
      if (view === "quiz") return await quiz(id, arg, params);
      if (view === "cards") return await cards(id);
      if (view === "exam") return await exam(id);
      if (view === "progress") return await progress(id);
      if (view === "game" && arg === "speed") return await speed(id);
      if (view === "game" && arg === "match") return await match(id);
    }
    $app.innerHTML = empty("Page not found", "That link doesn't match anything here.", "#/", "Go to dashboard");
  } catch (e) { if (e.status === 401) return showLogin(); $app.innerHTML = `<div class="empty err"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Go to dashboard</a></div>`; }
}

async function start() {
  try { await pull(); setSync("Synced"); } catch (e) { if (e.status === 401) return showLogin(); setSync("Offline, using local copy", "error"); }
  $logout.hidden = false;
  route();
}
addEventListener("hashchange", () => { if (!$logout.hidden) route(); });
api("/api/auth").then((r) => (r.authed ? start() : showLogin())).catch(() => showLogin("Cannot reach server."));
