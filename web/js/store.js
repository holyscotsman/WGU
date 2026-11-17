// Progress state: localStorage cache (key "wgu-progress-v1", shape unchanged) plus server sync.
import { DAY } from "./model.js";

export const KEY = "wgu-progress-v1";
const BOX_DAYS = [0, 1, 3, 7, 14, 30];
const blank = () => ({ questions: {}, cards: {}, exams: [], games: {}, pa: { q: {}, c: {} } });
const withDefaults = (s) => ({ ...blank(), ...s, pa: { q: {}, c: {}, ...(s?.pa ?? {}) } });

let state = (() => { try { return withDefaults(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } })();
let timer;
const listeners = new Set();
let status = "saved";

export const getState = () => state;
export const onStatus = (fn) => { listeners.add(fn); fn(status); return () => listeners.delete(fn); };
const setStatus = (s) => { status = s; listeners.forEach((fn) => fn(s)); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: server copy still works */ } };

export async function api(path, opts) {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  if (r.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

/** Send what this device has and adopt the merged result, so offline progress is never overwritten. */
export async function sync() {
  const merged = await api("/api/progress", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
  state = withDefaults(merged);
  persist();
  setStatus("saved");
}

let authLost = () => {};
export const onAuthLost = (fn) => { authLost = fn; };

function save() {
  persist();
  clearTimeout(timer);
  setStatus("saving");
  timer = setTimeout(async () => {
    try { await sync(); } catch (e) {
      if (e.status === 401) return authLost();
      setStatus("failed");
    }
  }, 700);
}
export const saveNow = save;

export function recordQ(id, correct) {
  const p = state.questions[id] ?? { n: 0, c: 0 };
  state.questions[id] = { n: p.n + 1, c: p.c + (correct ? 1 : 0), last: correct, t: Date.now() };
  save();
}
export function recordCard(id, good) {
  const box = good ? Math.min((state.cards[id]?.box ?? 0) + 1, BOX_DAYS.length - 1) : 1;
  state.cards[id] = { box, due: Date.now() + BOX_DAYS[box] * DAY, t: Date.now() };
  save();
}
export function recordGame(key, score, better) {
  const p = state.games?.[key];
  state.games ??= {};
  if (p && !better(score, p.best)) return false;
  state.games[key] = { best: score, t: Date.now() };
  save();
  return true;
}
export function recordExam(entry) { state.exams.push(entry); save(); }
export const touch = save;

export const newSession = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const cache = new Map();
export const loadCourse = (id) => { if (!cache.has(id)) cache.set(id, api(`/api/data?name=${encodeURIComponent(id)}`).catch((e) => { cache.delete(id); throw e; })); return cache.get(id); };
export const loadCourses = () => api("/api/data?name=courses");
