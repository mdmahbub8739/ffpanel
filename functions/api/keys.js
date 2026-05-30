import { json, bad, requireUser } from "./_utils.js";

export async function onRequestGet({ env, request }) {
  const user = await requireUser(env, request);
  if (!user) return bad("Unauthorized", 401);
  const rows = await env.DB.prepare(
    "SELECT id, serial, product_name, package_name, amount, status, delivered_code, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100"
  ).bind(user.id).all();
  return json({ keys: rows.results || [] });
}
