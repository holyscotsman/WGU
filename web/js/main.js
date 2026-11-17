import { api, sync, onStatus, onAuthLost } from "./store.js";
import { $app, esc, runTeardown, setCrumb } from "./ui.js";
import * as V from "./views.js";
import * as S from "./sessions.js";
import * as C from "./cards.js";
import * as P from "./pa.js";

const $logout = document.getElementById("logout");
const $save = document.getElementById("save");
const $courses = document.getElementById("courses-link");
let authed = false;

onStatus((s) => {
  const dot = $save.querySelector(".dot"), label = $save.querySelector("span");
  dot.className = `dot ${{ saved: "ok", saving: "busy", failed: "bad" }[s]}`;
  label.textContent = { saved: "Saved", saving: "Saving", failed: "Not saved" }[s];
  $save.title = s === "failed" ? "Could not reach the server. Progress is kept on this device and will sync on the next answer." : "";
});

function showLogin(msg = "") {
  authed = false; runTeardown();
  $logout.hidden = $save.hidden = $courses.hidden = true;
  setCrumb([]);
  $app().innerHTML = `<form class="card login" id="lf"><h1>WGU Study</h1><p class="muted">${esc(msg) || "Enter your password to continue."}</p>
    <p><label class="sr" for="pw">Password</label><input type="password" id="pw" placeholder="Password" autocomplete="current-password" autofocus></p><button class="primary wide">Log in</button></form>`;
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: document.getElementById("pw").value }) }); await start(); }
    catch { showLogin("That password did not work."); }
  };
}
onAuthLost(() => showLogin("Your session ended. Log in again."));
$logout.onclick = async () => { await fetch("/api/auth", { method: "DELETE" }); showLogin(); };

async function route() {
  if (!authed) return;
  runTeardown();
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const p = path.split("/").filter(Boolean), params = new URLSearchParams(qs ?? "");
  window.scrollTo(0, 0);
  try {
    if (!p.length) return await V.home();
    if (p[0] === "c") {
      const [, id, view, a, b] = p;
      if (!view) return await V.course(id);
      switch (view) {
        case "section": return await V.section(id, a);
        case "guide": return await V.guide(id, a);
        case "progress": return await V.progress(id);
        case "quiz": return await S.practice(id, params, a === "missed");
        case "exam": return await S.exam(id);
        case "cards": return await C.cards(id);
        case "game": return await (a === "match" ? C.match(id) : C.speed(id));
        case "pa": return await (a === "retake" ? P.retake(id) : P.review(id));
        case "fix": return await (b === "drill" ? P.drill(id, a) : P.fix(id, a ?? null));
      }
    }
    $app().innerHTML = `<p>Page not found. <a href="#/">Back to courses</a></p>`;
  } catch (e) {
    if (e.status === 401) return showLogin("Your session ended. Log in again.");
    $app().innerHTML = `<div class="card"><h1>Something went wrong</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back to courses</a></div>`;
  }
}

async function start() {
  authed = true;
  $logout.hidden = $save.hidden = $courses.hidden = false;
  try { await sync(); } catch (e) { if (e.status === 401) return showLogin(); /* offline: keep the local copy */ }
  route();
}
addEventListener("hashchange", route);
api("/api/auth").then((r) => (r.authed ? start() : showLogin())).catch(() => showLogin("Cannot reach the server."));
