import { safeEqual, issueCookie, clearCookie, isAuthed, json } from "../lib/session.mjs";

export default async (req) => {
  if (req.method === "GET") return json({ authed: isAuthed(req) });
  if (req.method === "DELETE") return json({ authed: false }, 200, { "set-cookie": clearCookie() });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const expected = process.env.APP_PASSWORD;
  if (!expected) return json({ error: "APP_PASSWORD not configured" }, 500);
  const body = await req.json().catch(() => ({}));
  if (typeof body.password !== "string" || !safeEqual(body.password, expected))
    return json({ error: "invalid password" }, 401);
  return json({ authed: true }, 200, { "set-cookie": issueCookie() });
};
