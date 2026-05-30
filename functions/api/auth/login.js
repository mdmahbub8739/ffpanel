import { json, bad, verifyPassword, signSession, sessionCookie, validEmail, rateLimit, clientIp } from "../_utils.js";

export async function onRequestPost({ env, request }) {
  const ip = clientIp(request);
  if (!(await rateLimit(env, "login:" + ip, 12, 900))) return bad("Too many attempts. Try later.", 429);
  let b;
  try { b = await request.json(); } catch { return bad("Invalid body"); }
  const email = (b.email || "").toString().trim().toLowerCase();
  const password = (b.password || "").toString();
  if (!validEmail(email) || !password) return bad("Email and password required");

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user || user.status !== "active") {
    await verifyPassword(password, "AAAAAAAAAAAAAAAAAAAAAA", "x");
    return bad("Invalid credentials", 401);
  }
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) return bad("Invalid credentials", 401);

  const token = await signSession(env.SESSION_SECRET, { uid: user.id, role: user.role, exp: Date.now() + 7 * 86400000 });
  return json(
    { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, referral_code: user.referral_code } },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
