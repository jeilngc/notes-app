# Notes

A private, installable notes app — password-protected, syncs across devices, works offline.

- **Frontend**: React + Vite, styled with the Minimalist Dark design system, packaged as a PWA (installable, offline-capable, works on mobile home screens).
- **Backend**: Cloudflare Pages Functions (serverless, no separate server to run) + a Cloudflare D1 database (SQLite at the edge) for your notes.
- **Auth**: one shared password. On success the server sets a signed, HttpOnly session cookie — no accounts, no third-party auth.
- **Offline**: notes are cached locally; edits made offline are queued and synced automatically when you're back online.

This README walks through everything from an empty GitHub account to a live site, assuming no prior Cloudflare/GitHub setup.

---

## 1. Prerequisites

- A free [GitHub](https://github.com) account.
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
- [Node.js](https://nodejs.org) 18+ installed on your computer.
- A domain added to Cloudflare (optional at first — you get a free `*.workers.dev` URL either way). If you want `personal.com`, its nameservers need to point at Cloudflare — see step 7.

> **Note on project type**: this app deploys as a Cloudflare **Worker with static assets** (one `src/worker.js` script that serves the built frontend and handles `/api/*` itself), not the older "Pages" product. Some Cloudflare accounts now only offer this path when connecting a Git repo, which is what these steps assume. If your dashboard does offer a separate classic "Pages" project type and you'd rather use that, ask and this project can be adapted back to Pages Functions — but Workers-with-assets works identically and is the newer, actively-developed path.

---

## 2. Push this project to GitHub

```bash
cd notes-app
git add -A
git commit -m "Initial commit"
```

Then on GitHub: create a new **empty** repository (no README/license, so it doesn't conflict), and push:

```bash
git remote add origin https://github.com/<your-username>/notes.git
git branch -M main
git push -u origin main
```

---

## 3. Create the D1 database

D1 is Cloudflare's SQLite database — this is where your notes live, and it's what makes them sync across devices.

Install Wrangler (Cloudflare's CLI) and log in:

```bash
npm install
npx wrangler login
```

Create the database:

```bash
npx wrangler d1 create notes-db
```

This prints a `database_id`. Copy it into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Create the `notes` table:

```bash
npx wrangler d1 execute notes-db --remote --file=./schema.sql
```

---

## 4. Connect the repo to Cloudflare

1. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository** (or **Connect to Git**, wording varies).
2. Pick your `notes` repository.
3. On the "Set up your application" screen:
   - **Project name**: whatever you like (this becomes part of your `*.workers.dev` URL).
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy` (this is the default — leave it as-is).
4. Deploy. You'll get a URL like `https://notes-app.<your-subdomain>.workers.dev` — the site will load, but the password gate won't work yet (next step).

### Bind the D1 database

In the project's **Settings → Bindings → Add binding → D1 database**:
- Variable name: `NOTES_DB`
- D1 database: `notes-db`

### Set your secrets

Still in **Settings**, under **Variables and Secrets** (mark both as **Secret**, not plain text):
- `APP_PASSWORD` — the password you'll type to unlock the app.
- `SESSION_SECRET` — a long random string used to sign session cookies. Generate one with:
  ```bash
  openssl rand -base64 32
  ```

Redeploy (Settings → Deployments → retry latest, or push a new commit) so the bindings take effect.

Your app is now live and password-protected at your `.workers.dev` URL. Every push to `main` auto-deploys.

---

## 5. Try it locally before you deploy (optional)

```bash
npm run db:init:local
npm run dev:worker
```

`dev:worker` builds the frontend and runs `wrangler dev` — a local copy of the Worker, assets, and D1 all together. It uses `--local-protocol https` so session cookies (which require a secure context) work the same way they will in production; your browser will warn about the self-signed local certificate the first time — that's expected, just proceed.

Wrangler will prompt you to set `APP_PASSWORD` / `SESSION_SECRET` for local dev — or create a `.dev.vars` file (already gitignored):

```
APP_PASSWORD=whatever-you-want-locally
SESSION_SECRET=any-long-random-string
```

For day-to-day frontend work with hot reload, run `npm run dev` in one terminal and `npm run dev:worker` in another (the Vite dev server proxies `/api` to Wrangler on port 8787).

---

## 6. Install it as an app

Once deployed, open the site on your phone or desktop:
- **iOS Safari**: Share → Add to Home Screen.
- **Android Chrome**: menu → Install app.
- **Desktop Chrome/Edge**: install icon in the address bar.

It'll behave like a native app — its own window/icon, and it opens instantly (and works offline) once installed.

---

## 7. Using your own domain (`personal.com`)

You mentioned wanting `personal.com/notes` as part of a larger multi-purpose site. Two honest options here:

**Easiest — a subdomain (recommended for now):**
Point `notes.personal.com` at this Worker (project → **Settings → Domains & Routes → Add → Custom domain**, add `notes.personal.com`, then add the CNAME/DNS record Cloudflare suggests — it can usually do this automatically since your domain is already on Cloudflare). This works immediately with zero extra code.

**Path-based — `personal.com/notes`:**
Cloudflare Workers serve from a domain/subdomain root, not a subpath of a domain that hosts other things. To get `personal.com/notes` pointing at *this* Worker while `personal.com/` hosts something else later, you'll add a small routing Worker in front of `personal.com` that forwards `/notes*` to this Worker (via a [service binding](https://developers.cloudflare.com/workers/configuration/bindings/service-bindings/)) and routes everything else to your future main site. This is worth doing once you're building the second thing on `personal.com` — happy to set that routing Worker up with you when you get there, since it'll be shaped by whatever else lives on the domain.

---

## Project structure

```
notes-app/
  src/
    worker.js             Worker entry point: routes /api/* and serves the built frontend
    server/                auth.js (session cookies), notes.js (D1 queries)
    App.jsx, components/  React UI
    lib/api.js            Frontend API client (with offline cache + queue)
    styles/                Design system CSS
  schema.sql              D1 table definition
  wrangler.toml           Worker config: entry point, assets, D1 binding
  public/                 PWA icons, manifest assets, robots.txt
```

## How the pieces fit together

- **Password check**: `POST /api/login` compares your password to `APP_PASSWORD` and, on success, sets a signed cookie. `src/worker.js` requires that cookie on every other `/api/*` route.
- **Notes storage**: `src/server/notes.js` reads/writes the `notes` table in D1 via the `NOTES_DB` binding.
- **Static frontend**: the built `dist/` output is served directly by Cloudflare via the `[assets]` binding in `wrangler.toml`; the Worker only runs for `/api/*` requests (or as a fallback).
- **Offline sync**: `src/lib/api.js` caches the notes list in `localStorage` and queues any writes made while offline; they replay automatically when the browser comes back online or the tab regains focus.
- **PWA**: `vite-plugin-pwa` generates the manifest and service worker at build time; API requests are always network-only so you never see stale data or a stale password gate.

## Changing the password later

Update `APP_PASSWORD` in the Worker's Settings → Variables and Secrets, then redeploy. Existing sessions stay valid until they expire (30 days) or the cookie is cleared — log out on your devices if you want the change to take effect immediately everywhere.
