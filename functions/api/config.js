import { json } from "./_utils.js";

const PUBLIC_KEYS = [
  "site_name", "logo_text", "primary_color", "accent_color",
  "hero_tagline", "bkash_number", "nagad_number", "footer_text",
  "support_link", "referral_bonus_percent", "admin_panel_name",
];

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${PUBLIC_KEYS.map(() => "?").join(",")})`).bind(...PUBLIC_KEYS).all();
  const out = {};
  for (const r of rows.results || []) out[r.key] = r.value;
  return json({ settings: out });
}
