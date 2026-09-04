import { json } from "../_auth.js";

function toClient(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const row = await env.NOTES_DB.prepare(
    "SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?"
  )
    .bind(params.id)
    .first();

  if (!row) return json({ error: "Not found" }, { status: 404 });
  return json(toClient(row));
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }

  const existing = await env.NOTES_DB.prepare("SELECT id FROM notes WHERE id = ?")
    .bind(params.id)
    .first();
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const now = Date.now();
  const fields = [];
  const values = [];

  if (typeof body?.title === "string") {
    fields.push("title = ?");
    values.push(body.title);
  }
  if (typeof body?.body === "string") {
    fields.push("body = ?");
    values.push(body.body);
  }
  fields.push("updated_at = ?");
  values.push(now);
  values.push(params.id);

  await env.NOTES_DB.prepare(`UPDATE notes SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const row = await env.NOTES_DB.prepare(
    "SELECT id, title, body, created_at, updated_at FROM notes WHERE id = ?"
  )
    .bind(params.id)
    .first();

  return json(toClient(row));
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  await env.NOTES_DB.prepare("DELETE FROM notes WHERE id = ?").bind(params.id).run();
  return new Response(null, { status: 204 });
}
