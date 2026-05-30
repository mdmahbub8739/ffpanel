import { json, bad, requireUser, randomToken, rateLimit, clientIp } from "../_utils.js";
import { createSession, deliverOrder } from "../_checkout.js";

export async function onRequestGet({ env, request }) {
  const user = await requireUser(env, request);
  if (!user) return bad("Unauthorized", 401);
  const rows = await env.DB.prepare(
    "SELECT id, serial, product_name, package_name, qty, amount, status, payment_method, delivered_code, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100"
  ).bind(user.id).all();
  return json({ orders: rows.results || [] });
}

export async function onRequestPost({ env, request }) {
  const user = await requireUser(env, request);
  if (!user) return bad("Unauthorized", 401);
  if (!(await rateLimit(env, "order:" + clientIp(request), 30, 600))) return bad("Slow down", 429);

  let b;
  try { b = await request.json(); } catch { return bad("Invalid body"); }
  const packageId = parseInt(b.package_id, 10);
  const qty = Math.max(1, Math.min(50, parseInt(b.qty, 10) || 1));
  const method = b.payment_method === "wallet" ? "wallet" : "online";
  const promoCode = (b.promo || "").toString().trim().toUpperCase().slice(0, 32);
  if (!packageId) return bad("Package required");

  const pkg = await env.DB.prepare(
    "SELECT pk.id, pk.name, pk.price, pk.product_id, p.name AS product_name FROM packages pk JOIN products p ON p.id = pk.product_id WHERE pk.id = ? AND pk.active = 1 AND p.active = 1"
  ).bind(packageId).first();
  if (!pkg) return bad("Package not available", 404);

  let amount = pkg.price * qty;
  let promo = null;
  if (promoCode) {
    promo = await env.DB.prepare("SELECT * FROM promos WHERE code = ? AND active = 1").bind(promoCode).first();
    if (!promo) return bad("Invalid promo code");
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return bad("Promo expired");
    if (promo.usage_limit > 0 && promo.used >= promo.usage_limit) return bad("Promo limit reached");
    const off = promo.kind === "flat" ? promo.value : Math.floor((amount * promo.value) / 100);
    amount = Math.max(0, amount - off);
  }

  const serial = Math.floor(10000 + Math.random() * 89999).toString();
  const ins = await env.DB.prepare(
    "INSERT INTO orders (serial, user_id, product_id, package_id, product_name, package_name, qty, amount, status, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
  ).bind(serial, user.id, pkg.product_id, pkg.id, pkg.product_name, pkg.name, qty, amount, method).run();
  const orderId = ins.meta.last_row_id;
  if (promo) await env.DB.prepare("UPDATE promos SET used = used + 1 WHERE id = ?").bind(promo.id).run();

  if (method === "wallet") {
    if (user.balance < amount) {
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      return bad("Insufficient balance", 402);
    }
    await env.DB.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").bind(amount, user.id).run();
    await env.DB.prepare("INSERT INTO transactions (user_id, kind, amount, status, ref_order, meta) VALUES (?, 'order', ?, 'success', ?, 'wallet')").bind(user.id, amount, orderId).run();
    await deliverOrder(env, orderId, "WALLET", "WALLET");
    const fresh = await env.DB.prepare("SELECT status, delivered_code FROM orders WHERE id = ?").bind(orderId).first();
    return json({ ok: true, mode: "wallet", order_id: orderId, status: fresh.status, code: fresh.delivered_code });
  }

  const merchantOrderId = `ord_${orderId}_${randomToken(6)}`;
  await env.DB.prepare("INSERT INTO checkout_sessions (merchant_order_id, user_id, purpose, ref_id, amount) VALUES (?, ?, 'order', ?, ?)")
    .bind(merchantOrderId, user.id, orderId, amount).run();
  try {
    const sess = await createSession(env, { amount, merchantOrderId, metadata: { type: "order", order_id: orderId, user_id: user.id } });
    await env.DB.prepare("UPDATE checkout_sessions SET vt_session_id = ? WHERE merchant_order_id = ?").bind(sess.session_id || "", merchantOrderId).run();
    return json({ ok: true, mode: "online", order_id: orderId, checkout_url: sess.checkout_url });
  } catch (e) {
    return bad("Payment gateway error: " + e.message, 502);
  }
}
