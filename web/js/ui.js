import { pct } from "./model.js";

export const $app = () => document.getElementById("app");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const LETTERS = "ABCDEFGH";

export function setCrumb(parts = []) {
  const el = document.getElementById("crumb");
  el.innerHTML = parts.map((p, i) => (p.href && i < parts.length - 1 ? `<a href="${p.href}">${esc(p.label)}</a>` : `<span aria-current="${i === parts.length - 1 ? "page" : "false"}">${esc(p.label)}</span>`)).join('<i aria-hidden="true">/</i>');
}

/** Coverage bar coloured by accuracy tone. */
export const bar = (value, tone = "blue", label = "") => `<div class="bar ${tone}" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`;

export const chip = (status) => `<span class="chip s-${status.toLowerCase().replace(/\s+/g, "-")}">${esc(status)}</span>`;

/** One segment per question: green right, red wrong, grey not yet; the current one is outlined. */
export function segments(results, total, current, neutral = false) {
  return `<div class="segs" aria-hidden="true">${Array.from({ length: total }, (_, i) => {
    const r = results[i];
    const cls = r ? (neutral ? "done" : r.correct ? "right" : "wrong") : "";
    return `<i class="${cls}${i === current ? " now" : ""}"></i>`;
  }).join("")}</div>`;
}

/** Truncate on a word boundary. */
export function shortText(t, n = 150) {
  const s = String(t).replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

export const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
export { pct };

/** Views register teardown here (keyboard handlers, timers); the router calls it on every route change. */
let teardown = [];
export const onLeave = (fn) => { teardown.push(fn); };
export const runTeardown = () => { const t = teardown; teardown = []; t.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); };
