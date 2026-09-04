import { isAuthenticated, createSessionCookie, clearSessionCookie, json } from "./server/auth.js";
import * as Notes from "./server/notes.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url.pathname);
    }

    // Static files matching dist/ are normally served directly by the
    // platform without ever invoking this Worker. This fallback only runs
    // for requests that reach the Worker without matching a static asset.
    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, pathname) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
    return json(
      { error: "Server is not configured. Missing APP_PASSWORD or SESSION_SECRET." },
      { status: 500 }
    );
  }

  if (pathname === "/api/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  // Every other /api route requires a valid session cookie.
  const authed = await isAuthenticated(request, env.SESSION_SECRET);
  if (!authed) return json({ error: "Unauthorized" }, { status: 401 });

  if (pathname === "/api/logout" && request.method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  }

  if (pathname === "/api/session" && request.method === "GET") {
    return json({ ok: true });
  }

  if (pathname === "/api/notes" && request.method === "GET") {
    return json(await Notes.listNotes(env));
  }

  if (pathname === "/api/notes" && request.method === "POST") {
    const body = await safeJson(request);
    if (!body) return json({ error: "Invalid request." }, { status: 400 });
    return json(await Notes.createNote(env, body), { status: 201 });
  }

  const noteMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (noteMatch) {
    const id = decodeURIComponent(noteMatch[1]);

    if (request.method === "GET") {
      const note = await Notes.getNote(env, id);
      return note ? json(note) : json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "PUT") {
      const body = await safeJson(request);
      if (!body) return json({ error: "Invalid request." }, { status: 400 });
      const updated = await Notes.updateNote(env, id, body);
      return updated ? json(updated) : json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "DELETE") {
      await Notes.deleteNote(env, id);
      return new Response(null, { status: 204 });
    }
  }

  if (pathname === "/api/folders" && request.method === "GET") {
    return json(await Notes.listFolders(env));
  }

  if (pathname === "/api/folders" && request.method === "POST") {
    const body = await safeJson(request);
    const folder = body ? await Notes.createFolder(env, body) : null;
    return folder ? json(folder, { status: 201 }) : json({ error: "A folder name is required." }, { status: 400 });
  }

  const folderMatch = pathname.match(/^\/api\/folders\/([^/]+)$/);
  if (folderMatch) {
    const id = decodeURIComponent(folderMatch[1]);

    if (request.method === "PUT") {
      const body = await safeJson(request);
      const updated = body ? await Notes.renameFolder(env, id, body.name) : null;
      return updated ? json(updated) : json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "DELETE") {
      await Notes.deleteFolder(env, id);
      return new Response(null, { status: 204 });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}

async function handleLogin(request, env) {
  const body = await safeJson(request);
  const password = body?.password;
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

  if (mismatch) return json({ error: "Unauthorized" }, { status: 401 });

  const cookie = await createSessionCookie(env.SESSION_SECRET);
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
