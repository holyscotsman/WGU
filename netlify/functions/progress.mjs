import { getStore } from "@netlify/blobs";
import { isAuthed, json } from "../lib/session.mjs";

const KEY = "state";
const MAX_BYTES = 1_000_000;

// Per-item last-write-wins on `t` (ms epoch) so two devices don't clobber each other.
function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v?.t ?? 0) >= (out[k].t ?? 0)) out[k] = v;
  return out;
}

export function merge(server, client) {
  const exams = new Map();
  for (const e of [...(server.exams ?? []), ...(client.exams ?? [])]) exams.set(`${e.course}:${e.t}`, e);
  return {
    questions: mergeMap(server.questions, client.questions),
    cards: mergeMap(server.cards, client.cards),
    games: mergeMap(server.games, client.games),
    exams: [...exams.values()].sort((x, y) => x.t - y.t),
  };
}

export default async (req) => {
  if (!isAuthed(req)) return json({ error: "unauthorized" }, 401);
  const store = getStore("progress");
  const current = (await store.get(KEY, { type: "json" })) ?? {};

  if (req.method === "GET") return json(merge(current, {}));
  if (req.method !== "PUT") return json({ error: "method not allowed" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ error: "payload too large" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const merged = merge(current, body);
  await store.setJSON(KEY, merged);
  return json(merged);
};
