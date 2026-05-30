import { json, requireUser, getSetting } from "../_utils.js";

export async function onRequestGet({ env, request }) {
  const user = await requireUser(env, request);
  if (!user) return json({ user: null });
  const bonus = await env.DB.prepare("SELECT id, amount, reason, created_at FROM bonus_history WHERE user_id = ? ORDER BY id DESC LIMIT 20").bind(user.id).all();
  const refPercent = await getSetting(env, "referral_bonus_percent", "5");
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      balance: user.balance,
      total_spent: user.total_spent,
      referral_code: user.referral_code,
      role: user.role,
      created_at: user.created_at,
    },
    referral_bonus_percent: Number(refPercent),
    bonus_history: bonus.results || [],
  });
}
