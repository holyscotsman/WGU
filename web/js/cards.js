// Flashcards (Leitner boxes) and the two games.
import * as M from "./model.js";
import { getState, loadCourse, recordCard, recordQ, recordGame, newSession, touch } from "./store.js";
import { $app, esc, setCrumb, bar, LETTERS, shortText, onLeave, pct } from "./ui.js";

const crumbs = (d, last) => [{ label: "Courses", href: "#/" }, { label: `${d.course.code ?? ""} ${d.course.title}`.trim(), href: `#/c/${d.course.id}` }, { label: last }];
const definitionOf = (c) => (c.back.split("\n").find((l) => !/^(Example|Formula):/.test(l)) ?? "");
const hasDefinition = (c) => definitionOf(c) !== "";

export async function cards(id) {
  const d = await loadCourse(id);
  setCrumb(crumbs(d, "Flashcards"));
  const state = getState();
  const queue = M.shuffle(d.cards.filter((c) => (state.cards[c.id]?.due ?? 0) <= Date.now()));
  let i = 0, flipped = false;
  const key = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!flipped) { flipped = true; render(); } }
    else if (flipped && e.key === "1") rate(false);
    else if (flipped && e.key === "2") rate(true);
  };
  document.addEventListener("keydown", key);
  onLeave(() => document.removeEventListener("keydown", key));
  function rate(good) { recordCard(queue[i].id, good); i++; flipped = false; render(); }
  function render() {
    if (i >= queue.length) {
      $app().innerHTML = `<section class="done"><h1>${queue.length ? "Session complete" : "Nothing due"}</h1><p class="muted">${queue.length ? `${queue.length} cards reviewed.` : "Come back when cards are due."}</p><a class="btn" href="#/c/${d.course.id}">Back to course</a></section>`;
      return;
    }
    const c = queue[i], box = getState().cards[c.id]?.box;
    $app().innerHTML = `<section class="cardsess"><h1 class="sr">Flashcards</h1><div class="qtop"><span><b>Card ${i + 1} of ${queue.length}</b></span><span class="qwhere">${box ? `Box ${box} of 5` : "New card"}</span></div>
      ${bar(pct(i + 1, queue.length), "blue", "cards reviewed")}
      <button type="button" class="card flash${flipped ? " back" : ""}" id="f" aria-label="${flipped ? "Answer side. Press to flip back" : "Question side. Press to flip"}">${esc(flipped ? c.back : c.front)}</button>
      <p class="muted center">${flipped ? "How did you do? 1 = missed it · 2 = got it" : "Tap the card or press Space to flip"}</p>
      <div class="btns row center">${flipped ? '<button class="ghost" id="bad">Missed it</button><button class="primary" id="good">Got it</button>' : '<button class="primary" id="flip">Flip</button>'}</div></section>`;
    $app().querySelector("#f").onclick = () => { flipped = !flipped; render(); };
    const on = (s, fn) => { const el = $app().querySelector(s); if (el) el.onclick = fn; };
    on("#flip", () => { flipped = true; render(); });
    on("#good", () => rate(true));
    on("#bad", () => rate(false));
  }
  render();
}

// ---------- Speed round ----------
export async function speed(id) {
  const d = await loadCourse(id);
  setCrumb(crumbs(d, "Speed round"));
  const LIMIT = 60, sid = newSession();
  const pool = M.pickPractice(d, getState(), { n: 9999 });
  let i = 0, score = 0, streak = 0, best = 0, picked = new Set(), locked = false;
  const end = Date.now() + LIMIT * 1000;
  let timer;
  const finish = () => {
    clearInterval(timer); document.removeEventListener("keydown", key);
    const record = recordGame(`${d.course.id}:speed`, score, (a, b) => a > b);
    $app().innerHTML = `<section class="done"><p class="eyebrow">Time</p><h1>${score} points</h1><p>Best streak ${best}. ${record ? "New personal best." : `Personal best ${getState().games[`${d.course.id}:speed`].best}.`}</p>
      <div class="btns row"><button class="primary" id="again">Play again</button><a class="btn ghost" href="#/c/${d.course.id}">Back to course</a></div></section>`;
    $app().querySelector("#again").onclick = () => speed(id);
  };
  function submit() {
    if (locked || !picked.size) return;
    const q = pool[i % pool.length], want = new Set(M.asArr(q.answer));
    const ok = picked.size === want.size && [...picked].every((k) => want.has(k));
    recordQ(q.id, ok); M.noteAnswer(getState(), q, ok, sid); touch();
    if (ok) { streak++; best = Math.max(best, streak); score += 1 + Math.floor(streak / 3); i++; return render(); }
    streak = 0; locked = true;
    $app().querySelectorAll(".choice").forEach((b) => { const k = +b.dataset.k; b.disabled = true; if (want.has(k)) b.classList.add("right"); else if (picked.has(k)) b.classList.add("wrong"); else b.classList.add("dim"); });
    $app().querySelector("#fb").innerHTML = `<div class="why bad"><h3>Why ${[...want].map((k) => LETTERS[k]).join(", ")}</h3><p>${esc(q.explanation)}</p></div>`;
    const go = $app().querySelector("#go"); go.textContent = "Next"; go.disabled = false;
    go.onclick = () => { i++; render(); };
  }
  function pick(k) {
    if (locked) return;
    const q = pool[i % pool.length];
    if (k >= q.choices.length) return;
    if (M.asArr(q.answer).length > 1) { picked.has(k) ? picked.delete(k) : picked.add(k); paint(); }
    else { picked = new Set([k]); submit(); }
  }
  const paint = () => { $app().querySelectorAll(".choice").forEach((b) => b.classList.toggle("picked", picked.has(+b.dataset.k))); const go = $app().querySelector("#go"); if (go) go.disabled = !picked.size; };
  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) pick(+e.key - 1);
    else if (e.key === "Enter") { e.preventDefault(); if (locked) $app().querySelector("#go")?.click(); else submit(); }
  }
  function tick() { const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const el = document.getElementById("t"); if (el) el.textContent = `${left}s`; if (left <= 0) finish(); }
  function render() {
    locked = false; picked = new Set();
    const q = pool[i % pool.length], multi = M.asArr(q.answer).length > 1;
    $app().innerHTML = `<section class="quiz"><h1 class="sr">Speed round</h1><div class="qtop"><span class="clock" id="t" role="timer"></span><span><b>${score} points</b> · streak ${streak}</span></div>
      <article class="qcard"><h2 class="stem">${esc(q.q)}</h2>${multi ? '<p class="hint">Select all that apply, then lock in.</p>' : ""}
      <div class="choices">${q.choices.map((c, k) => `<button type="button" class="choice" data-k="${k}"><span class="k">${LETTERS[k]}</span><span class="txt">${esc(c)}</span><span class="tag"></span></button>`).join("")}</div><div id="fb"></div></article>
      <footer class="qfoot"><span class="keys" aria-hidden="true">${multi ? "1–" + Math.min(q.choices.length, 9) + " to pick · Enter to lock in" : "1–" + Math.min(q.choices.length, 9) + " answers at once"}</span><span class="qbtns"><button type="button" class="primary" id="go" disabled>${multi ? "Lock in" : "Answer"}</button></span></footer></section>`;
    $app().querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => pick(+b.dataset.k)));
    $app().querySelector("#go").onclick = submit;
    tick();
  }
  document.addEventListener("keydown", key);
  timer = setInterval(tick, 250);
  onLeave(() => { clearInterval(timer); document.removeEventListener("keydown", key); });
  if (!pool.length) { $app().innerHTML = "<p>No questions.</p>"; return; }
  render();
}

// ---------- Term match ----------
export async function match(id) {
  const d = await loadCourse(id);
  setCrumb(crumbs(d, "Term match"));
  let pool = d.cards.filter((c) => hasDefinition(c) && definitionOf(c).length > 12);
  if (pool.length < 4) pool = d.cards;
  if (pool.length < 4) { $app().innerHTML = "<p>Not enough flashcards for this game yet.</p>"; return; }
  const ROUND = Math.min(6, pool.length);
  const set = M.shuffle(pool).slice(0, ROUND), defs = M.shuffle(set);
  const text = (c) => shortText(hasDefinition(c) ? definitionOf(c) : c.back.replace(/\n.*/s, ""), 130);
  const start = Date.now();
  let left = ROUND, misses = 0, pickT = null, pickD = null;
  $app().innerHTML = `<section class="match"><h1 class="sr">Term match</h1><div class="qtop"><span class="clock" id="t">0.0 s</span><span id="m" class="muted">Misses 0</span></div><p class="muted">Pick a term, then its definition.</p>
    <div class="cols"><div>${set.map((c) => `<button type="button" class="tile" data-t="${esc(c.id)}">${esc(c.front)}</button>`).join("")}</div>
    <div>${defs.map((c) => `<button type="button" class="tile" data-d="${esc(c.id)}">${esc(text(c))}</button>`).join("")}</div></div></section>`;
  const timer = setInterval(() => { const el = document.getElementById("t"); if (el) el.textContent = `${((Date.now() - start) / 1000).toFixed(1)} s`; }, 100);
  onLeave(() => clearInterval(timer));
  const check = () => {
    if (!pickT || !pickD) return;
    const t = pickT, df = pickD; pickT = pickD = null;
    if (t.dataset.t === df.dataset.d) {
      t.classList.add("done"); df.classList.add("done"); t.disabled = df.disabled = true; left--;
      if (!left) {
        clearInterval(timer);
        const secs = Math.round(((Date.now() - start) / 1000 + misses * 5) * 10) / 10;
        const record = recordGame(`${d.course.id}:match`, secs, (a, b) => a < b);
        $app().innerHTML = `<section class="done"><p class="eyebrow">Done</p><h1>${secs} s</h1><p>Time plus 5 s per miss (${misses}). ${record ? "New personal best." : `Personal best ${getState().games[`${d.course.id}:match`].best} s.`}</p>
          <div class="btns row"><button class="primary" id="again">Play again</button><a class="btn ghost" href="#/c/${d.course.id}">Back to course</a></div></section>`;
        $app().querySelector("#again").onclick = () => match(id);
      }
    } else {
      misses++; document.getElementById("m").textContent = `Misses ${misses}`;
      for (const el of [t, df]) { el.classList.remove("sel"); el.classList.add("bad"); setTimeout(() => el.classList.remove("bad"), 500); }
    }
  };
  $app().querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => {
    const isT = "t" in b.dataset, prev = isT ? pickT : pickD;
    if (prev) prev.classList.remove("sel");
    b.classList.add("sel");
    if (isT) pickT = b; else pickD = b;
    check();
  }));
}
