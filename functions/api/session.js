import { json } from "./_auth.js";

// If we get here, _middleware.js has already verified the session cookie.
export async function onRequestGet() {
  return json({ ok: true });
}
