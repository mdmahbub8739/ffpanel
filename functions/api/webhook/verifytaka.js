import { json, hmacHex, timingSafeEqual } from "../_utils.js";
import { fulfillByMerchantOrder } from "../_checkout.js";

export async function onRequestPost({ env, request }) {
  const raw = await request.text();
  const sig = (request.headers.get("X-VerifyTaka-Signature") || "").toLowerCase().replace(/^sha256=/, "");
  const secret = env.VT_WEBHOOK_SECRET || env.VT_SECRET_KEY;
  if (!secret) return json({ error: "not configured" }, 503);

  const expected = await hmacHex(secret, raw);
  if (!sig || !timingSafeEqual(expected, sig)) return json({ error: "invalid signature" }, 401);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

  if (payload.event !== "payment.verified") return json({ ok: true, ignored: payload.event });

  const merchantOrderId = payload.merchant_order_id;
  if (!merchantOrderId) return json({ ok: true, ignored: "no_order" });

  try {
    await fulfillByMerchantOrder(env, merchantOrderId, payload.txn_id, payload.mfs_type, payload.sender);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
  return json({ ok: true });
}
