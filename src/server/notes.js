// D1 queries for notes. Shared by the Worker's /api/notes routes.

function toClient(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    folderId: row.folder_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listNotes(env) {
  const { results } = await env.NOTES_DB.prepare(
    "SELECT id, title, body, folder_id, created_at, updated_at FROM notes ORDER BY updated_at DESC"
  ).all();
  return results.map(toClient);
}

export async function createNote(env, body) {
  const title = typeof body?.title === "string" ? body.title : "";
  const text = typeof body?.body === "string" ? body.body : "";
  const folderId = typeof body?.folderId === "string" ? body.folderId : null;
  const id = crypto.randomUUID();
  const now = Date.now();

  await env.NOTES_DB.prepare(
    "INSERT INTO notes (id, title, body, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(id, title, text, folderId, now, now)
    .run();

  return { id, title, body: text, folderId, createdAt: now, updatedAt: now };
}

export async function getNote(env, id) {
  const row = await env.NOTES_DB.prepare(
    "SELECT id, title, body, folder_id, created_at, updated_at FROM notes WHERE id = ?"
  )
    .bind(id)
    .first();
  return row ? toClient(row) : null;
}

export async function updateNote(env, id, patch) {
  const existing = await env.NOTES_DB.prepare("SELECT id FROM notes WHERE id = ?").bind(id).first();
  if (!existing) return null;

  const now = Date.now();
  const fields = [];
  const values = [];

  if (typeof patch?.title === "string") {
    fields.push("title = ?");
    values.push(patch.title);
  }
  if (typeof patch?.body === "string") {
    fields.push("body = ?");
    values.push(patch.body);
  }
  if (patch && "folderId" in patch) {
    fields.push("folder_id = ?");
    values.push(typeof patch.folderId === "string" ? patch.folderId : null);
  }
  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  await env.NOTES_DB.prepare(`UPDATE notes SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return getNote(env, id);
}

export async function deleteNote(env, id) {
  await env.NOTES_DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
}

// ---------- Folders ----------

function folderToClient(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listFolders(env) {
  const { results } = await env.NOTES_DB.prepare(
    "SELECT id, name, created_at, updated_at FROM folders ORDER BY name COLLATE NOCASE ASC"
  ).all();
  return results.map(folderToClient);
}

export async function createFolder(env, body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return null;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.NOTES_DB.prepare(
    "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
  )
    .bind(id, name, now, now)
    .run();
  return { id, name, createdAt: now, updatedAt: now };
}

export async function renameFolder(env, id, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  const existing = await env.NOTES_DB.prepare("SELECT id FROM folders WHERE id = ?").bind(id).first();
  if (!existing) return null;
  const now = Date.now();
  await env.NOTES_DB.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?")
    .bind(trimmed, now, id)
    .run();
  return { id, name: trimmed, updatedAt: now };
}

export async function deleteFolder(env, id) {
  // Notes in this folder are freed up to "no folder" rather than deleted.
  await env.NOTES_DB.prepare("UPDATE notes SET folder_id = NULL WHERE folder_id = ?").bind(id).run();
  await env.NOTES_DB.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
}
