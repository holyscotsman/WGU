import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "wgu_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
};
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function safeEqual(a, b) {
  const ha = createHmac("sha256", "cmp").update(String(a)).digest();
  const hb = createHmac("sha256", "cmp").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function issueCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${COOKIE}=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export function isAuthed(req) {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, sign(exp));
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
