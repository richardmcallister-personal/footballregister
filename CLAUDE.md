# footballclub.wiki

Static site: 236 clubs across thirteen leagues in Europe and North America on an interactive globe. See README.md for the
file layout and data model. This file covers how the site is run and how to work on it.

## Where things live

- Repo (this folder): `~/Documents/Projects/footballclub.wiki`
  — GitHub `richardmcallister-personal/footballregister`, branch `main`. This is the only local clone.
- Design assets are **not** in the repo and currently sit in `~/Downloads`: `footballclub-wiki-logo/`
  (logo marks and lockups, light/dark, SVG + PNG) and the earlier single-file drafts
  `european-club-register_*.html`. Copy an asset into `public/` before referencing it.

## Hosting and deploys

- Cloudflare **Worker** `footballregister` with Git builds (not a Pages project).
  - Build command: empty. Deploy command: `npx wrangler deploy`. Root directory: `/`. Production branch: `main`.
  - `wrangler.jsonc` publishes `./public` as static assets; nothing outside `public/` is served.
  - `public/_headers` sets caching (`/data/*` 5 min, `/img/*` 7 days) and is honoured by Workers.
- Live at https://footballclub.wiki and https://footballregister.richardmcallister.workers.dev.
- **Every push to `main` deploys**, usually within a minute.
- If a push doesn't produce a build: the Cloudflare ↔ GitHub connection has dropped. Fix in the
  Cloudflare dashboard → Workers & Pages → footballregister → Settings → Builds → Manage (the user
  re-authorizes; don't do it for them).

## Daily data refresh

- `.github/workflows/refresh.yml` runs `scripts/refresh.py` at 04:15 UTC (and on manual dispatch),
  then commits `public/data/snapshot.json` and `public/data/rosters.json` as `footballclub-bot`.
  Repo Settings → Actions → Workflow permissions is "Read and write" so this push works.
- `refresh.py` is standard-library Python, no API key. It pulls standings, next fixtures and squads
  from ESPN's public soccer API; if a feed fails it keeps the previous data.
- League of Ireland isn't on ESPN: edit `scripts/irl_static.json` by hand.
- The page also calls ESPN live in the browser; the committed snapshot is the fallback and first paint.
- Run locally with `python3 scripts/refresh.py` — it rewrites the two data files, so don't commit
  them alongside unrelated changes unless intended.

## Installable app (PWA)

- `public/manifest.webmanifest` + `public/icons/` and `public/apple-touch-icon.png` (from logo mark A),
  iOS home-screen tags in `index.html`, and `public/sw.js` for offline use.
- `sw.js` caches the page, cdnjs libraries, Google Fonts CSS, `data/*.json` and all crests/ground photos.
  Page and data are network-first, images stale-while-revalidate; ESPN and map tiles aren't cached.
- **Bump `VERSION` in `sw.js` whenever a library URL/version in `index.html` changes** (and update
  `LIB_URLS` to match), or installed copies keep the old library. Content edits need no bump.
- Offline, `index.html` picks the canvas globe (`navigator.onLine` false) since map tiles can't load.
- `_headers` serves `sw.js` with `no-cache` so updates reach users on their next visit.

## Working rules

- `git pull` before editing — the bot commits to `main` every day.
- Show the diff and get approval before committing. Commit and push to `main` only when asked.
- After pushing, confirm the deploy: fetch the changed page/file on https://footballclub.wiki and
  check the status and content.
- Preview locally with `python3 -m http.server -d public 8000`.
- Club facts (founded, capacity, honours, manager, captain, records, links) are in
  `public/data/clubs.json`. Photos are Wikimedia Commons with credit links; keep the credits.
- `gh` is logged in as `richardmcallister-personal`. Chrome is signed in to Cloudflare if the
  dashboard is needed.
