// Thin API client for the notes backend (Cloudflare Worker + D1).
// Adds a small offline layer: reads fall back to the last-known cache,
// writes made offline are queued in localStorage and flushed on reconnect.

const CACHE_KEY = "notes:cache:v1";
const FOLDERS_CACHE_KEY = "notes:folders:v1";
const QUEUE_KEY = "notes:queue:v1";
const OFFLINE_AUTH_KEY = "notes:offline-auth:v1";
const OFFLINE_AUTH_ITERATIONS = 150000;

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

export function getCachedFolders() {
  return readJSON(FOLDERS_CACHE_KEY, []);
}

function setCachedFolders(folders) {
  writeJSON(FOLDERS_CACHE_KEY, folders);
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

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

async function deriveOfflineVerifier(password, salt, iterations = OFFLINE_AUTH_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}

export async function rememberOfflinePassword(password) {
  const salt = randomSalt();
  const verifier = await deriveOfflineVerifier(password, salt);
  writeJSON(OFFLINE_AUTH_KEY, {
    version: 1,
    algorithm: "PBKDF2-SHA-256",
    iterations: OFFLINE_AUTH_ITERATIONS,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(verifier)
  });
}

export function hasOfflineAuth() {
  const stored = readJSON(OFFLINE_AUTH_KEY, null);
  return !!(
    stored &&
    stored.version === 1 &&
    stored.algorithm === "PBKDF2-SHA-256" &&
    stored.salt &&
    stored.verifier
  );
}

export async function verifyOfflinePassword(password) {
  const stored = readJSON(OFFLINE_AUTH_KEY, null);
  if (!stored || stored.version !== 1 || !stored.salt || !stored.verifier) {
    return false;
  }

  try {
    const salt = base64ToBytes(stored.salt);
    const expected = base64ToBytes(stored.verifier);
    const actual = await deriveOfflineVerifier(password, salt, stored.iterations || OFFLINE_AUTH_ITERATIONS);

    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function clearOfflineAuth() {
  try {
    localStorage.removeItem(OFFLINE_AUTH_KEY);
  } catch {
    // storage unavailable — nothing else to do
  }
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
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.code = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function login(password) {
  const result = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  await rememberOfflinePassword(password);
  return result;
}

export async function logout() {
  await request("/api/logout", { method: "POST" }).catch(() => {});
  clearOfflineAuth();
  setCachedNotes([]);
  setCachedFolders([]);
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

export async function fetchFolders() {
  try {
    const folders = await request("/api/folders");
    setCachedFolders(folders);
    return { folders, offline: false };
  } catch (err) {
    if (err.code === 401) throw err;
    return { folders: getCachedFolders(), offline: true };
  }
}

export async function createFolder(name) {
  const folder = await request("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  setCachedFolders([...getCachedFolders(), folder]);
  return folder;
}

export async function renameFolder(id, name) {
  const folder = await request(`/api/folders/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name })
  });
  setCachedFolders(getCachedFolders().map((f) => (f.id === id ? folder : f)));
  return folder;
}

export async function deleteFolder(id) {
  await request(`/api/folders/${id}`, { method: "DELETE" });
  setCachedFolders(getCachedFolders().filter((f) => f.id !== id));
  // Notes in this folder move to "no folder" server-side; mirror that locally.
  setCachedNotes(getCachedNotes().map((n) => (n.folderId === id ? { ...n, folderId: null } : n)));
}

// Optimistic create: assigns a temporary id immediately so the UI can
// navigate straight into the new note, then reconciles with the server id.
export async function createNote(note) {
  const tempId = `temp-${Date.now()}`;
  const optimistic = { id: tempId, title: "", body: "", folderId: null, updatedAt: Date.now(), ...note };
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