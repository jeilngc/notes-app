import { isAuthenticated, json } from "./_auth.js";

// Applies to every request under /api/**. Only /api/login is public —
// everything else (including /api/session) requires a valid session cookie.
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/login") {
    return next();
  }

  if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "Server is not configured. Missing APP_PASSWORD or SESSION_SECRET." }, { status: 500 });
  }

  const ok = await isAuthenticated(request, env.SESSION_SECRET);
  if (!ok) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return next();
}
