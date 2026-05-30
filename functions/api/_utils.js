const enc = new TextEncoder();
const dec = new TextDecoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function bad(message, status = 400) {
  return json({ error: message }, status);
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}
function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}

export function refCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function hashPassword(password, salt) {
  const s = salt || b64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64url(s), iterations: 150000, hash: "SHA-256" },
    key,
    256
  );
  return { hash: b64url(bits), salt: s };
}

export async function verifyPassword(password, salt, expected) {
  const { hash } = await hashPassword(password, salt);
  return timingSafeEqual(hash, expected);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacHex(secret, message) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

export async function signSession(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(secret, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64url(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 7) {
  return `ff_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
export function clearCookie() {
  return "ff_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function getSession(env, request) {
  const token = readCookie(request, "ff_session");
  if (!token) return null;
  return verifySession(env.SESSION_SECRET, token);
}

export async function requireUser(env, request) {
  const s = await getSession(env, request);
  if (!s || !s.uid) return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").bind(s.uid).first();
  return user || null;
}

export async function requireAdmin(env, request) {
  const user = await requireUser(env, request);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function rateLimit(env, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE bucket = ?").bind(key).first();
  if (!row || now - row.window_start >= windowSec) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = ?"
    ).bind(key, now, now).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket = ?").bind(key).run();
  return true;
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

export function validEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

export async function getSetting(env, key, fallback = "") {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : fallback;
}
