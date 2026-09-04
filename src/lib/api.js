// Thin API client for the notes backend (Cloudflare Pages Functions + D1).
// Adds a small offline layer: reads fall back to the last-known cache,
// writes made offline are queued in localStorage and flushed on reconnect.

const CACHE_KEY = "notes:cache:v1";
const QUEUE_KEY = "notes:queue:v1";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — degrade silently, network stays source of truth
  }
}

export function getCachedNotes() {
  return readJSON(CACHE_KEY, []);
}

function setCachedNotes(notes) {
  writeJSON(CACHE_KEY, notes);
}

function getQueue() {
  return readJSON(QUEUE_KEY, []);
}

function setQueue(queue) {
  writeJSON(QUEUE_KEY, queue);
}

export function pendingCount() {
  return getQueue().length;
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (res.status === 401) {
    const err = new Error("unauthorized");
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function login(password) {
  return request("/api/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export async function logout() {
  await request("/api/logout", { method: "POST" }).catch(() => {});
  setCachedNotes([]);
  setQueue([]);
}

export async function checkSession() {
  return request("/api/session");
}

export async function fetchNotes() {
  try {
    const notes = await request("/api/notes");
    setCachedNotes(notes);
    return { notes, offline: false };
  } catch (err) {
    if (err.code === 401) throw err;
    return { notes: getCachedNotes(), offline: true };
  }
}

function queueMutation(mutation) {
  const queue = getQueue();
  queue.push(mutation);
  setQueue(queue);
}

// Optimistic create: assigns a temporary id immediately so the UI can
// navigate straight into the new note, then reconciles with the server id.
export async function createNote(note) {
  const tempId = `temp-${Date.now()}`;
  const optimistic = { id: tempId, title: "", body: "", updatedAt: Date.now(), ...note };
  const cached = getCachedNotes();
  setCachedNotes([optimistic, ...cached]);

  try {
    const saved = await request("/api/notes", {
      method: "POST",
      body: JSON.stringify(note)
    });
    const merged = getCachedNotes().map((n) => (n.id === tempId ? saved : n));
    setCachedNotes(merged);
    return saved;
  } catch (err) {
    if (err.code === 401) throw err;
    queueMutation({ type: "create", tempId, note });
    return optimistic;
  }
}

export async function updateNote(id, patch) {
  const cached = getCachedNotes().map((n) =>
    n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
  );
  setCachedNotes(cached);

  try {
    return await request(`/api/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch)
    });
  } catch (err) {
    if (err.code === 401) throw err;
    if (id.startsWith("temp-")) {
      // still-unsynced note: fold the patch into the queued create
      const queue = getQueue().map((m) =>
        m.type === "create" && m.tempId === id ? { ...m, note: { ...m.note, ...patch } } : m
      );
      setQueue(queue);
    } else {
      queueMutation({ type: "update", id, patch });
    }
    return null;
  }
}

export async function deleteNote(id) {
  setCachedNotes(getCachedNotes().filter((n) => n.id !== id));

  if (id.startsWith("temp-")) {
    setQueue(getQueue().filter((m) => !(m.type === "create" && m.tempId === id)));
    return;
  }

  try {
    await request(`/api/notes/${id}`, { method: "DELETE" });
  } catch (err) {
    if (err.code === 401) throw err;
    queueMutation({ type: "delete", id });
  }
}

// Replays queued offline writes in order. Call on reconnect / app focus.
export async function flushQueue() {
  const queue = getQueue();
  if (!queue.length) return { flushed: 0 };

  const remaining = [];
  let flushed = 0;

  for (const m of queue) {
    try {
      if (m.type === "create") {
        const saved = await request("/api/notes", {
          method: "POST",
          body: JSON.stringify(m.note)
        });
        setCachedNotes(getCachedNotes().map((n) => (n.id === m.tempId ? saved : n)));
      } else if (m.type === "update") {
        await request(`/api/notes/${m.id}`, { method: "PUT", body: JSON.stringify(m.patch) });
      } else if (m.type === "delete") {
        await request(`/api/notes/${m.id}`, { method: "DELETE" });
      }
      flushed++;
    } catch (err) {
      if (err.code === 401) throw err;
      remaining.push(m);
    }
  }

  setQueue(remaining);
  return { flushed, remaining: remaining.length };
}
