import { json, clearCookie } from "../_utils.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}
