# Notes

A private, installable notes app — password-protected, syncs across devices, and works offline.

- **Frontend:** React + Vite, packaged as a PWA.
- **Backend:** Cloudflare Worker + static assets + D1.
- **Auth:** one shared password. Successful login sets a signed, HttpOnly session cookie.
- **Offline:** after a successful online login, a PBKDF2-SHA-256 verifier is stored locally so the same password can unlock cached notes when the network is unavailable. Offline edits are queued and synced when connectivity returns.

## Deployment

This project deploys as a **Cloudflare Worker with static assets**, not Cloudflare Pages Functions. The Worker entry point is `src/worker.js`, and `wrangler.toml` defines the Vite `dist/` assets and D1 binding.

### 1. Install and authenticate Wrangler

```bash
npm install
npx wrangler login
```

### 2. Configure D1

The repository already contains the D1 database ID in `wrangler.toml`. If deploying to a different Cloudflare account/database, create a D1 database and replace the ID there:

```bash
npx wrangler d1 create notes-db
npx wrangler d1 execute notes-db --remote --file=./schema.sql
```

The Worker expects the binding name `NOTES_DB`.

### 3. Configure required secrets

The Worker requires these **secrets**:

- `APP_PASSWORD` — the password used to unlock the app.
- `SESSION_SECRET` — a long random value used to sign session cookies.

The repository declares both names as required secrets in `wrangler.toml`. Wrangler will validate that they exist before deployment. Cloudflare documents this `secrets.required` configuration and recommends storing sensitive values with Worker secrets rather than plaintext config variables. urlCloudflare Worker secrets documentationhttps://developers.cloudflare.com/workers/configuration/secrets/

Set them interactively:

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Or add them in the Cloudflare dashboard under **Workers & Pages → your Worker → Settings → Variables and Secrets**, selecting **Secret** for both values.

Do **not** put either value in GitHub, `wrangler.toml`, `.env` committed to the repository, or frontend code.

### 4. Deploy

```bash
npm run deploy
```

The deploy command builds the Vite frontend and runs `wrangler deploy`.

### 5. Verify the Worker

The public diagnostic endpoint is:

```text
/api/health
```

A healthy deployment returns HTTP `200` with:

```json
{"ok":true,"authConfigured":true,"databaseBound":true}
```

If `authConfigured` is false, `APP_PASSWORD` or `SESSION_SECRET` is missing. If `databaseBound` is false, the `NOTES_DB` binding is missing.

The login endpoint is:

```text
POST /api/login
```

Once online login succeeds, the browser can unlock the locally cached notes with the same password while offline.

## Local development

Create a local `.dev.vars` file (it is ignored by Git) containing:

```text
APP_PASSWORD=your-local-password
SESSION_SECRET=your-local-random-secret
```

Then initialize the local D1 database and run the Worker:

```bash
npm run db:init:local
npm run dev:worker
```

## Project structure

```text
notes-app/
  src/
    worker.js             Worker entry point: /api/* + asset fallback
    server/
      auth.js             Signed session cookie helpers
      notes.js            D1 note/folder queries
    App.jsx               React application and auth/offline flow
    lib/api.js            API client, local cache, offline auth, sync queue
  public/                 PWA/static assets
  schema.sql              D1 schema
  wrangler.toml           Worker, assets, secrets, and D1 configuration
```

## Authentication and offline behavior

- Online login is always checked against the server-side `APP_PASSWORD`.
- The server signs a 30-day HttpOnly session cookie with `SESSION_SECRET`.
- After a successful online login, the frontend stores only a salted PBKDF2-SHA-256 verifier, never the plaintext password.
- If the network request itself fails, the frontend may use that local verifier to unlock cached notes.
- A real server response such as `401 Unauthorized` or `500 Server is not configured` is **not** bypassed by offline authentication.
- Explicit logout clears the local verifier, cached notes/folders, and queued writes.

## Changing the password

Update the `APP_PASSWORD` Worker secret and redeploy. Because offline authentication is based on the verifier saved after a successful login, users should log in online with the new password before relying on offline access.
