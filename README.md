# TouchTrace

Switchboard field scan tool for licensed electricians, referencing AS/NZS 3000.
Static app (`index.html`) + a serverless proxy (`api/scan.js`) that keeps your
real Anthropic API key on the server, never in the browser.

## Features

- **Scan** — photograph a board (external + internal), get an AS/NZS
  3000-referenced hazard read with editable test-result fields (EFLI, IR, RCD
  trip time).
- **Schedule** — photograph the breaker layout, get a draft circuit schedule
  you can correct and download.
- **Log** — every saved scan persists to a Postgres database (see setup
  below) so it survives browser resets and syncs across every device using
  the same access token. Includes an "Open Defects Only" filter, a
  Mark Resolved/Open toggle, and a one-tap "Customer Note" that rewrites
  findings into plain-English language for a non-electrician client.
- **Offline-tolerant** — installable as a home-screen app; photos and job
  details autosave locally and survive a refresh or lost signal; saves and
  deletes queue locally and sync automatically once you're back online.
  (The AI analysis itself still needs a live connection — there's no way
  around that part requiring the API.)

## Install as a home-screen app

Once deployed, open the live URL on your phone and use "Add to Home Screen"
(iOS Safari: Share → Add to Home Screen; Android Chrome: menu → Install app).
It'll behave like a native app — its own icon, opens without browser chrome,
and the app shell loads even with no signal.

## 1. Push this to GitHub

From this folder:

```bash
git init
git add .
git commit -m "TouchTrace initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo on github.com first — "New repository", don't
initialize it with a README so this push isn't rejected for unrelated history.)

## 2. Connect the repo to Vercel

1. Go to vercel.com → sign in with GitHub.
2. "Add New Project" → pick this repo → Import.
3. Vercel auto-detects `index.html` as static and `api/scan.js` as a serverless
   function — no build configuration needed, just click Deploy.
4. Before or after the first deploy, go to Project Settings → Environment
   Variables and add:
   - `ANTHROPIC_API_KEY` — your real key from console.anthropic.com
   - `APP_ACCESS_TOKEN` — a password you make up yourself (NOT your Anthropic
     key — this just gates who can call your proxy). Redeploy after adding env
     vars so the function picks them up.
5. Your app is now live at `https://<your-project>.vercel.app`, and the proxy
   endpoint is `https://<your-project>.vercel.app/api/scan`.

From here, every `git push` to `main` auto-redeploys both the app and the proxy.

## 2b. Or: connect the repo to Railway instead

Railway runs a persistent process rather than on-demand functions, so it uses
`server.js` (an Express server that serves the app and the `/api/scan` route
together) instead of the `api/scan.js` Vercel function. You don't need both —
pick one platform.

1. Go to railway.app → sign in with GitHub.
2. "New Project" → "Deploy from GitHub repo" → pick this repo.
3. Railway detects `package.json`, runs `npm install` then `npm start`
   (which runs `node server.js`) automatically.
4. In the project's Variables tab, add the same two env vars:
   - `ANTHROPIC_API_KEY`
   - `APP_ACCESS_TOKEN`
5. **Add a database** (needed for the inspection log to persist and sync across
   devices): in the same Railway project, click **"New"** → **"Database"** →
   **"Add PostgreSQL"**. Railway automatically sets a `DATABASE_URL` variable
   on your app service — no manual config needed. The app creates its table
   on first startup after that.
6. Under Settings → Networking, click "Generate Domain" to get a public URL
   like `https://touchtrace-production.up.railway.app`.
7. The app is served at that root URL, and the proxy endpoint is
   `https://touchtrace-production.up.railway.app/api/scan`.

Every `git push` to `main` auto-redeploys here too.

**Without step 5**, the app still runs — scanning, schedules, and reports all
work — but the inspection log falls back to a local queue that never confirms
a save (you'll see "Offline — queued" even when connected). Add the database
whenever you're ready for the log to actually persist.

## 3. First-run setup in the app

Open the live URL. It'll ask for:
- **Proxy URL** → `https://<your-app>.vercel.app/api/scan` (Vercel) or
  `https://<your-app>.up.railway.app/api/scan` (Railway) — whichever you used
- **Access token** → the `APP_ACCESS_TOKEN` value you set above

Anyone you share the URL + access token with can use the app; none of them
ever see your real Anthropic key. Stored in their browser's local storage
only, so each teammate enters it once.

## Cost control

- Set a monthly spend limit on the API key in console.anthropic.com.
- Rotate `APP_ACCESS_TOKEN` any time it leaks — change the env var in Vercel
  and redeploy, no code changes needed.
- The proxy caps `max_tokens` server-side and rejects oversized requests as a
  basic guardrail, but it's not full rate-limiting — keep an eye on usage if
  the access token gets shared more widely than intended.

## Notes

- The inspection log is stored in each user's own browser (`localStorage`),
  not shared across devices. A shared/synced log would need a real database —
  ask if you want that added later.
- `icon.svg` is the app mark, handy for a favicon or home-screen icon later.
