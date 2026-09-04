import { createSessionCookie, json } from "./_auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "Server is not configured. Missing APP_PASSWORD or SESSION_SECRET." }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }

  const { password } = body || {};
  if (typeof password !== "string" || password.length === 0) {
    return json({ error: "Password is required." }, { status: 400 });
  }

  // Constant-time-ish comparison to avoid trivial timing leaks
  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(env.APP_PASSWORD);
  let mismatch = a.length !== b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch = mismatch || (a[i] ?? 0) !== (b[i] ?? 0);
  }

  if (mismatch) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookie = await createSessionCookie(env.SESSION_SECRET);
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
