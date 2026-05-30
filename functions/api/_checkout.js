const VT_BASE = "https://api.verifytaka.com/v1";

export async function createSession(env, { amount, merchantOrderId, metadata }) {
  const base = (env.SITE_URL || "").replace(/\/$/, "");
  const res = await fetch(`${VT_BASE}/checkout/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": env.VT_SECRET_KEY },
    body: JSON.stringify({
      amount,
      merchant_order_id: merchantOrderId,
      success_url: `${base}/api/checkout/return`,
      cancel_url: `${base}/account.html?pay=cancelled`,
      metadata: metadata || {},
      expires_in_seconds: 1800,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.checkout_url) {
    throw new Error(data.message || data.error || "Checkout session failed");
  }
  return data;
}

export async function fulfillByMerchantOrder(env, merchantOrderId, txnId, mfsType, sender) {
  const sess = await env.DB.prepare("SELECT * FROM checkout_sessions WHERE merchant_order_id = ?").bind(merchantOrderId).first();
  if (!sess) return { ok: false, reason: "session_not_found" };
  if (sess.status === "paid") return { ok: true, already: true };

  if (txnId) {
    const dup = await env.DB.prepare("SELECT id FROM transactions WHERE txn_id = ?").bind(txnId).first();
    if (dup) {
      await env.DB.prepare("UPDATE checkout_sessions SET status = 'paid' WHERE id = ?").bind(sess.id).run();
      return { ok: true, already: true };
    }
  }

  await env.DB.prepare(
    "INSERT INTO transactions (user_id, kind, amount, status, txn_id, mfs_type, sender, ref_order, meta) VALUES (?, ?, ?, 'success', ?, ?, ?, ?, ?)"
  ).bind(sess.user_id, sess.purpose, sess.amount, txnId || null, mfsType || null, sender || null, sess.purpose === "order" ? sess.ref_id : null, merchantOrderId).run();

  if (sess.purpose === "fund") {
    await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").bind(sess.amount, sess.user_id).run();
    await creditReferral(env, sess.user_id, sess.amount);
  } else if (sess.purpose === "order" && sess.ref_id) {
    await deliverOrder(env, sess.ref_id, txnId, mfsType);
    await creditReferral(env, sess.user_id, sess.amount);
  }

  await env.DB.prepare("UPDATE checkout_sessions SET status = 'paid' WHERE id = ?").bind(sess.id).run();
  return { ok: true };
}

export async function deliverOrder(env, orderId, txnId, mfsType) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order || order.status === "completed") return;
  const key = await env.DB.prepare("SELECT id, content FROM stock_keys WHERE package_id = ? AND used = 0 ORDER BY id LIMIT 1").bind(order.package_id).first();
  if (key) {
    await env.DB.prepare("UPDATE stock_keys SET used = 1, order_id = ? WHERE id = ?").bind(orderId, key.id).run();
    await env.DB.prepare("UPDATE orders SET status = 'completed', delivered_code = ?, txn_id = ?, payment_method = ? WHERE id = ?")
      .bind(key.content, txnId || order.txn_id, mfsType || order.payment_method, orderId).run();
  } else {
    await env.DB.prepare("UPDATE orders SET status = 'processing', txn_id = ?, payment_method = ? WHERE id = ?")
      .bind(txnId || order.txn_id, mfsType || order.payment_method, orderId).run();
  }
  await env.DB.prepare("UPDATE users SET total_spent = total_spent + ? WHERE id = ?").bind(order.amount, order.user_id).run();
}

async function creditReferral(env, userId, amount) {
  const u = await env.DB.prepare("SELECT referred_by FROM users WHERE id = ?").bind(userId).first();
  if (!u || !u.referred_by) return;
  const pct = await env.DB.prepare("SELECT value FROM settings WHERE key = 'referral_bonus_percent'").first();
  const percent = Number(pct ? pct.value : 0);
  if (percent <= 0) return;
  const bonus = Math.floor((amount * percent) / 100);
  if (bonus <= 0) return;
  await env.DB.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").bind(bonus, u.referred_by).run();
  await env.DB.prepare("INSERT INTO bonus_history (user_id, amount, reason) VALUES (?, ?, ?)")
    .bind(u.referred_by, bonus, `Referral ${percent}% bonus`).run();
}
