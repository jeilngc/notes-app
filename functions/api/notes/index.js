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
  const { env } = context;
  const { results } = await env.NOTES_DB.prepare(
    "SELECT id, title, body, created_at, updated_at FROM notes ORDER BY updated_at DESC"
  ).all();
  return json(results.map(toClient));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, { status: 400 });
  }

  const title = typeof body?.title === "string" ? body.title : "";
  const text = typeof body?.body === "string" ? body.body : "";
  const id = crypto.randomUUID();
  const now = Date.now();

  await env.NOTES_DB.prepare(
    "INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(id, title, text, now, now)
    .run();

  return json({ id, title, body: text, createdAt: now, updatedAt: now }, { status: 201 });
}
