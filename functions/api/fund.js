import { json, bad, requireUser, randomToken, rateLimit, clientIp } from "./_utils.js";
import { createSession } from "./_checkout.js";

export async function onRequestPost({ env, request }) {
  const user = await requireUser(env, request);
  if (!user) return bad("Unauthorized", 401);
  if (!(await rateLimit(env, "fund:" + clientIp(request), 20, 600))) return bad("Slow down", 429);

  let b;
  try { b = await request.json(); } catch { return bad("Invalid body"); }
  const amount = Math.floor(Number(b.amount));
  if (!amount || amount < 10 || amount > 100000) return bad("Amount must be between 10 and 100000");

  const merchantOrderId = `fund_${user.id}_${randomToken(6)}`;
  await env.DB.prepare("INSERT INTO checkout_sessions (merchant_order_id, user_id, purpose, ref_id, amount) VALUES (?, ?, 'fund', NULL, ?)")
    .bind(merchantOrderId, user.id, amount).run();
  try {
    const sess = await createSession(env, { amount, merchantOrderId, metadata: { type: "fund", user_id: user.id } });
    await env.DB.prepare("UPDATE checkout_sessions SET vt_session_id = ? WHERE merchant_order_id = ?").bind(sess.session_id || "", merchantOrderId).run();
    return json({ ok: true, checkout_url: sess.checkout_url });
  } catch (e) {
    return bad("Payment gateway error: " + e.message, 502);
  }
}
