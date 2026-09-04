import { clearSessionCookie, json } from "./_auth.js";

export async function onRequestPost() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
