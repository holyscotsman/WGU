const $app = document.getElementById("app");
const $sync = document.getElementById("sync");
const $logout = document.getElementById("logout");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DAY = 864e5;
const BOX_DAYS = [0, 1, 3, 7, 14, 30];
const asArr = (a) => (Array.isArray(a) ? a : [a]);
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
  $sync.textContent = "unsaved…";
  pushTimer = setTimeout(async () => {
    try {
      state = await api("/api/progress", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
      persist();
      $sync.textContent = "saved";
    } catch (e) {
      if (e.status === 401) return showLogin();
      $sync.textContent = "sync failed — will retry on next answer";
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
  $app.innerHTML = `<h1>Courses</h1><div class="grid">${courses.map((c) => `
    <a class="card" href="#/c/${c.id}" style="text-decoration:none;color:inherit"><strong>${esc(c.code ?? "")}</strong><br>${esc(c.title)}
    <p class="muted">${c.counts.guides} guides · ${c.counts.questions} questions · ${c.counts.cards} cards</p></a>`).join("") || "<p>No courses yet.</p>"}</div>`;
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
  const due = d.cards.filter((c) => (state.cards[c.id]?.due ?? 0) <= Date.now()).length;
  $app.innerHTML = `<p><a href="#/">← Courses</a></p><h1>${esc(d.course.title)}</h1>
    <div class="row"><a class="btn" href="#/c/${id}/quiz">Practice quiz</a><a class="btn" href="#/c/${id}/quiz/missed">Missed questions</a>
    ${d.cards.length ? `<a class="btn" href="#/c/${id}/cards">Flashcards (${due} due)</a>` : ""}<a class="btn secondary" href="#/c/${id}/exam">Mock exam</a><a class="btn secondary" href="#/c/${id}/game/speed">Speed round</a>${d.cards.length >= 4 ? `<a class="btn secondary" href="#/c/${id}/game/match">Term match</a>` : ""}<a class="btn secondary" href="#/c/${id}/progress">Progress</a></div>
    <h2>Study guides</h2>${d.guides.map((g) => `<div class="card"><a href="#/c/${id}/guide/${g.id}">${esc(g.title)}</a> <span class="muted">${g.objectives.join(", ")}</span></div>`).join("") || "<p class='muted'>None yet.</p>"}`;
}

async function guide(id, gid) {
  const d = await loadCourse(id);
  const g = d.guides.find((x) => x.id === gid);
  $app.innerHTML = g ? `<p><a href="#/c/${id}">← ${esc(d.course.title)}</a></p><article class="guide">${g.html}</article>` : "<p>Guide not found.</p>";
}

// Generic quiz runner used by practice + exam.
function runQuiz(questions, { exam = false, onDone, results = [] }) {
  let i = 0;
  const render = () => {
    if (i >= questions.length) return onDone(results);
    const q = questions[i], multi = asArr(q.answer).length > 1, sel = new Set();
    $app.innerHTML = `<p class="muted">${exam ? "Exam" : "Practice"} · ${i + 1} / ${questions.length} · objective ${esc(q.objective)}</p>
      <div class="card"><p><strong>${esc(q.q)}</strong></p>${multi ? '<p class="muted">Select all that apply.</p>' : ""}
      ${q.choices.map((c, k) => `<label class="choice" data-k="${k}"><input type="${multi ? "checkbox" : "radio"}" name="a" value="${k}"><span>${esc(c)}</span></label>`).join("")}
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
      document.getElementById("fb").innerHTML = `<p><strong style="color:var(--${correct ? "ok" : "bad"})">${correct ? "Correct" : "Incorrect"}</strong> — ${esc(q.explanation)}</p>`;
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
  if (!pool.length) { $app.innerHTML = `<p>No questions available. <a href="#/c/${id}">Back</a></p>`; return; }
  runQuiz(shuffle(pool), { onDone: (r) => { $app.innerHTML = `<h1>Done</h1><p>${r.filter((x) => x.correct).length} / ${r.length} correct.</p><a class="btn" href="#/c/${id}">Back</a>`; } });
}

async function exam(id) {
  const d = await loadCourse(id);
  const cfg = { count: 50, minutes: 90, passPercent: 70, ...d.course.exam };
  const qs = shuffle(d.questions).slice(0, cfg.count);
  if (!qs.length) { $app.innerHTML = "<p>No questions.</p>"; return; }
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
    $app.innerHTML = `<h1>${pct >= cfg.passPercent ? "Pass" : "Not yet"} — ${pct}%</h1><p>${score} / ${qs.length}. Pass mark ${cfg.passPercent}%.</p>
      <table><tr><th>Objective</th><th>Score</th></tr>${Object.entries(byObj).map(([o, v]) => `<tr><td>${esc(o)}</td><td>${v.c}/${v.n}</td></tr>`).join("")}</table>
      <h2>Missed</h2>${results.filter((r) => !r.correct).map((r) => `<div class="card"><strong>${esc(r.q.q)}</strong><p class="muted">${esc(r.q.explanation)}</p></div>`).join("") || "<p>None.</p>"}
      <a class="btn" href="#/c/${id}">Back</a>`;
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
    if (i >= queue.length) { $app.innerHTML = `<h1>${queue.length ? "Session complete" : "Nothing due"}</h1><a class="btn" href="#/c/${id}">Back</a>`; return; }
    const c = queue[i];
    $app.innerHTML = `<p class="muted">${i + 1} / ${queue.length} · box ${state.cards[c.id]?.box ?? 0}</p><div class="card flash" id="f">${esc(flipped ? c.back : c.front)}</div>
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
  const exams = state.exams.filter((e) => e.course === id);
  $app.innerHTML = `<p><a href="#/c/${id}">← ${esc(d.course.title)}</a></p><h1>Progress</h1>
    <table><tr><th>Objective</th><th>Seen</th><th>Accuracy</th><th></th></tr>${objStats(d).map((o) => `<tr><td>${esc(o.id)} ${esc(o.title)}</td><td>${o.seen}/${o.total}</td>
    <td>${o.acc === null ? "—" : `<div class="bar"><i style="width:${Math.round(o.acc * 100)}%"></i></div>${Math.round(o.acc * 100)}%`}</td><td><a href="#/c/${id}/quiz?obj=${encodeURIComponent(o.id)}">Drill</a></td></tr>`).join("")}</table>
    <h2>Mock exams</h2>${exams.map((e) => `<div class="card">${new Date(e.t).toLocaleString()} — ${e.score}/${e.total}</div>`).join("") || "<p class='muted'>None taken.</p>"}`;
}


// ---------- games ----------
async function speed(id) {
  const d = await loadCourse(id);
  if (!d.questions.length) { $app.innerHTML = "<p>No questions.</p>"; return; }
  const LIMIT = 60;
  const pool = shuffle(d.questions);
  let i = 0, score = 0, streak = 0, best = 0, end = Date.now() + LIMIT * 1000, timer;
  const finish = () => {
    clearInterval(timer);
    const record = recordGame(`${id}:speed`, score, (a, b) => a > b);
    $app.innerHTML = `<h1>Time</h1><p class="stat">${score}</p><p>Best streak ${best}. ${record ? "New personal best." : `Personal best ${state.games[`${id}:speed`].best}.`}</p>
      <div class="row"><button id="again">Play again</button><a class="btn secondary" href="#/c/${id}">Back</a></div>`;
    document.getElementById("again").onclick = () => speed(id);
  };
  const render = () => {
    const q = pool[i % pool.length], multi = asArr(q.answer).length > 1, sel = new Set();
    $app.innerHTML = `<div class="row"><span class="timer" id="t"></span><span class="muted">Score ${score} · Streak ${streak}</span></div>
      <div class="card"><p><strong>${esc(q.q)}</strong></p>${multi ? '<p class="muted">Select all that apply.</p>' : ""}
      ${q.choices.map((c, k) => `<label class="choice" data-k="${k}"><input type="${multi ? "checkbox" : "radio"}" name="a" value="${k}"><span>${esc(c)}</span></label>`).join("")}
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
      document.getElementById("fb").innerHTML = `<p><strong style="color:var(--bad)">Missed</strong> ${esc(q.explanation)}</p>`;
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
  if (cards.length < 4) { $app.innerHTML = "<p>Not enough flashcards for this game.</p>"; return; }
  const ROUND = Math.min(6, cards.length);
  const set = shuffle(cards).slice(0, ROUND);
  const start = Date.now(); let left = ROUND, misses = 0, pickT = null, pickD = null, timer;
  const defs = shuffle(set);
  $app.innerHTML = `<div class="row"><span class="timer" id="t">0.0s</span><span class="muted" id="m">Misses 0</span></div><p class="muted">Pick a term, then its definition.</p>
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
        $app.innerHTML = `<h1>Done</h1><p class="stat">${secs}s</p><p>Time plus 5s per miss (${misses}). ${record ? "New personal best." : `Personal best ${state.games[`${id}:match`].best}s.`}</p>
          <div class="row"><button id="again">Play again</button><a class="btn secondary" href="#/c/${id}">Back</a></div>`;
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
  $app.innerHTML = `<form class="card" id="lf"><h1>Log in</h1><p class="muted">${esc(msg)}</p><input type="password" id="pw" placeholder="Password" autocomplete="current-password" autofocus> <button>Log in</button></form>`;
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
    $app.innerHTML = "<p>Not found.</p>";
  } catch (e) { $app.innerHTML = `<p>Error: ${esc(e.message)}</p>`; }
}

async function start() {
  try { await pull(); $sync.textContent = "synced"; } catch (e) { if (e.status === 401) return showLogin(); $sync.textContent = "offline — using local cache"; }
  $logout.hidden = false;
  route();
}
addEventListener("hashchange", () => { if (!$logout.hidden) route(); });
api("/api/auth").then((r) => (r.authed ? start() : showLogin())).catch(() => showLogin("Cannot reach server."));
