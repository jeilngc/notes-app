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
- A domain added to Cloudflare (optional at first — you get a free `*.pages.dev` URL either way). If you want `personal.com`, its nameservers need to point at Cloudflare — see step 7.

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

## 4. Connect the repo to Cloudflare Pages

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick your `notes` repository.
3. Build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Deploy. You'll get a URL like `https://notes-xyz.pages.dev` — the site will load, but the password gate won't work yet (next step).

### Bind the D1 database to Pages

In your Pages project: **Settings → Functions → D1 database bindings → Add binding**.
- Variable name: `NOTES_DB`
- D1 database: `notes-db`

### Set your secrets

Still in **Settings**, under **Environment variables** (mark both as **Encrypted**):
- `APP_PASSWORD` — the password you'll type to unlock the app.
- `SESSION_SECRET` — a long random string used to sign session cookies. Generate one with:
  ```bash
  openssl rand -base64 32
  ```

Add both for the **Production** environment (and **Preview** too, if you want preview deployments to work).

Redeploy (Settings → Deployments → retry latest, or push a new commit) so the bindings take effect.

Your app is now live and password-protected at your `.pages.dev` URL. Every push to `main` auto-deploys.

---

## 5. Try it locally before you deploy (optional)

```bash
npm run build
npx wrangler pages dev dist --d1 NOTES_DB=notes-db --compatibility-date=2024-09-23
```

Wrangler will prompt you to set `APP_PASSWORD` / `SESSION_SECRET` for local dev — or create a `.dev.vars` file (already gitignored):

```
APP_PASSWORD=whatever-you-want-locally
SESSION_SECRET=any-long-random-string
```

Initialize the local D1 copy first: `npm run db:init:local`.

For day-to-day frontend work with hot reload, run `npm run dev` in one terminal and `npm run pages:dev` in another (the Vite dev server proxies `/api` to Wrangler on port 8788).

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
Point `notes.personal.com` at this Pages project (Pages project → **Custom domains** → add `notes.personal.com`, then add the CNAME Cloudflare suggests). This works immediately with zero extra code.

**Path-based — `personal.com/notes`:**
Cloudflare Pages serves from a domain/subdomain root, not a subpath of a domain that hosts other things. To get `personal.com/notes` pointing at *this* project while `personal.com/` hosts something else later, you'll add a small Cloudflare Worker in front of `personal.com` that routes `/notes*` to this Pages project (via a [service binding](https://developers.cloudflare.com/workers/configuration/bindings/service-bindings/) or `fetch()` proxy) and routes everything else to your future main site. This is worth doing once you're building the second thing on `personal.com` — happy to set that routing Worker up with you when you get there, since it'll be shaped by whatever else lives on the domain.

---

## Project structure

```
notes-app/
  src/                    React app (UI, design system styles, API client)
  functions/api/          Cloudflare Pages Functions (login, session, notes CRUD)
  schema.sql              D1 table definition
  wrangler.toml           D1 binding config
  public/                 PWA icons, manifest assets, robots.txt
```

## How the pieces fit together

- **Password check**: `POST /api/login` compares your password to `APP_PASSWORD` and, on success, sets a signed cookie. `functions/api/_middleware.js` requires that cookie on every other `/api/*` route.
- **Notes storage**: `functions/api/notes/` reads/writes the `notes` table in D1 via the `NOTES_DB` binding.
- **Offline sync**: `src/lib/api.js` caches the notes list in `localStorage` and queues any writes made while offline; they replay automatically when the browser comes back online or the tab regains focus.
- **PWA**: `vite-plugin-pwa` generates the manifest and service worker at build time; API requests are always network-only so you never see stale data or a stale password gate.

## Changing the password later

Update `APP_PASSWORD` in Pages → Settings → Environment variables, then redeploy. Existing sessions stay valid until they expire (30 days) or the cookie is cleared — log out on your devices if you want the change to take effect immediately everywhere.
