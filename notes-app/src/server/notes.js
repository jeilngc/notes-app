// D1 queries for notes. Shared by the Worker's /api/notes routes.

function toClient(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listNotes(env) {
  const { results } = await env.NOTES_DB.prepare(
    "SELECT id, title, body, created_at, updated_at FROM notes ORDER BY updated_at DESC"
  ).all();
  return results.map(toClient);
}

export async function createNote(env, body) {
  const title = typeof body?.title === "string" ? body.title : "";
  const text = typeof body?.body === "string" ? body.body : "";
  const id = crypto.randomUUID();
  const now = Date.now();

  await env.NOTES_DB.prepare(
    "INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, title, text, now, now)
    .run();

  return { id, title, body: text, createdAt: now, updatedAt: now };
}

export async function getNote(env, id) {
  const row = await env.NOTES_DB.prepare(
    "SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?"
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
