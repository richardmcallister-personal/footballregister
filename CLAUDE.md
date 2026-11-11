# footballclub.wiki

Static site: 494 clubs across twenty-seven leagues in Europe and the Americas, plus all 211 FIFA national teams.
Pages: Leagues (`index.html`), Club (`club/`, `#c<espn_id>`), Grounds (`grounds/`), Nations (`nations/`, `#uefa` etc.),
Nation (`nation/`, `#n<espn_id>`), World Cup 2026 (`worldcup/`) and A match near me (`near/`, `#<city-country>`),
sharing `annual.css` and `annual.js` (theme, data, live ESPN layer, maps, nation helpers, the near-me search).
See README.md for the file layout and data model. This file covers how the site is run and how to work on it.

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
  then commits `public/data/snapshot.json`, `public/data/rosters.json`, `public/data/fixtures.json` and
  `public/data/nations_live.json` as `footballclub-bot`.
  Repo Settings → Actions → Workflow permissions is "Read and write" so this push works.
- `fixtures.json` is every upcoming **home** fixture in the register for the next 45 days, read from the home
  club only so each match appears once with a ground we can place, and stamped with the time it was read
  (`checked`). `python3 scripts/refresh.py fixtures` rebuilds just that file. Each club carries an IANA `tz`
  in `clubs.json`, so `near/` can show kickoff in the ground's own time zone.
- `refresh.py` is standard-library Python, no API key. It pulls standings, next fixtures and squads
  from ESPN's public soccer API; if a feed fails it keeps the previous data. It also writes
  `public/data/nations_live.json`: next match and competitions for every nation in `nations.json`
  (ESPN schedule by national-team id) and the FIFA ranking read from Wikipedia's
  `Module:SportsRankings/data/FIFA World Rankings` (updated there within a day of each FIFA release).
  Commit `nations_live.json` with the others in the workflow.
- National-team facts (`nations.json`: honours, coach, captain, records, grounds, coordinates), squads
  (`nation_squads.json`, latest call-up from Wikipedia with `club_id` where the club is in the register),
  `h2h.json` (all-time head-to-head among FIFA members, computed from the martj42 international results
  dataset) and `worldcup2026.json` are static research files; rebuild them by hand when needed.
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
- Offline, the tables and club entries work from the cached snapshot; map tiles can't load.
- When `annual.css` or `annual.js` changes, bump the `?v=` stamp on their tags in every HTML file.
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
