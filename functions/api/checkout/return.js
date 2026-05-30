import { hmacHex, timingSafeEqual } from "../_utils.js";
import { fulfillByMerchantOrder } from "../_checkout.js";

function redirect(to) {
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const amount = q.get("amount");
  const merchantOrderId = q.get("merchant_order_id");
  const sessionId = q.get("session_id");
  const timestamp = q.get("timestamp");
  const txnId = q.get("txn_id");
  const signature = (q.get("signature") || "").toLowerCase();

  if (!amount || !merchantOrderId || !sessionId || !timestamp || !txnId || !signature) {
    return redirect("/account.html?pay=invalid");
  }

  const ts = Number(timestamp);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 900) return redirect("/account.html?pay=expired");

  const secret = env.VT_WEBHOOK_SECRET || env.VT_SECRET_KEY;
  const canonical = `amount=${amount}&merchant_order_id=${merchantOrderId}&session_id=${sessionId}&timestamp=${timestamp}&txn_id=${txnId}`;
  const expected = await hmacHex(secret, canonical);
  if (!timingSafeEqual(expected, signature)) return redirect("/account.html?pay=badsig");

  let dest = "/account.html?pay=success";
  try {
    const r = await fulfillByMerchantOrder(env, merchantOrderId, txnId, null, null);
    if (r.ok) {
      const sess = await env.DB.prepare("SELECT purpose FROM checkout_sessions WHERE merchant_order_id = ?").bind(merchantOrderId).first();
      dest = sess && sess.purpose === "order" ? "/keys.html?pay=success" : "/account.html?pay=success";
    }
  } catch {
    dest = "/account.html?pay=pending";
  }
  return redirect(dest);
}
