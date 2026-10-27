import content from "../content/index.mjs";
import { isAuthed, json } from "../lib/session.mjs";

export default async (req) => {
  if (!isAuthed(req)) return json({ error: "unauthorized" }, 401);
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!Object.hasOwn(content, name)) return json({ error: "not found" }, 404);
  return json(content[name], 200, { "cache-control": "private, max-age=300" });
};
