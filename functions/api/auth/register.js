import { json, bad, hashPassword, signSession, sessionCookie, refCode, validEmail, rateLimit, clientIp, getSetting } from "../_utils.js";

export async function onRequestPost({ env, request }) {
  if (!(await rateLimit(env, "reg:" + clientIp(request), 10, 3600))) return bad("Too many attempts. Try later.", 429);
  let b;
  try { b = await request.json(); } catch { return bad("Invalid body"); }
  const name = (b.name || "").toString().trim().slice(0, 60);
  const email = (b.email || "").toString().trim().toLowerCase();
  const phone = (b.phone || "").toString().trim().slice(0, 20);
  const password = (b.password || "").toString();
  const ref = (b.ref || "").toString().trim().slice(0, 10);

  if (name.length < 2) return bad("Name is required");
  if (!validEmail(email)) return bad("Valid email required");
  if (password.length < 6) return bad("Password must be at least 6 characters");

  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return bad("Email already registered", 409);

  let referredBy = null;
  if (ref) {
    const r = await env.DB.prepare("SELECT id FROM users WHERE referral_code = ?").bind(ref).first();
    if (r) referredBy = r.id;
  }

  const { hash, salt } = await hashPassword(password);
  let myCode;
  for (let i = 0; i < 6; i++) {
    myCode = refCode();
    const c = await env.DB.prepare("SELECT id FROM users WHERE referral_code = ?").bind(myCode).first();
    if (!c) break;
  }

  const res = await env.DB.prepare(
    "INSERT INTO users (name, email, phone, password_hash, salt, referral_code, referred_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(name, email, phone, hash, salt, myCode, referredBy).run();

  const uid = res.meta.last_row_id;
  const token = await signSession(env.SESSION_SECRET, { uid, role: "user", exp: Date.now() + 7 * 86400000 });
  return json({ ok: true, user: { id: uid, name, email, referral_code: myCode } }, 201, { "Set-Cookie": sessionCookie(token) });
}
