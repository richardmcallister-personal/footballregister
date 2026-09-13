# footballclub.wiki

Every club, every ground. A static site: 236 clubs across thirteen leagues in Europe and North America on an
interactive globe, with honours, stadiums, managers, captains, record holders, squads,
standings and next fixtures.

## Layout

```
public/            the site — deploy this folder as-is
  index.html       page, styles and script. Map: MapLibre GL globe on OpenFreeMap vector tiles
                   (dark / positron styles); falls back to a D3 + TopoJSON canvas globe if
                   MapLibre doesn't load. Libraries from cdnjs, no API keys.
  data/clubs.json  static club data, links, coordinates
  data/snapshot.json  standings, next fixtures, competitions (refreshed daily)
  data/rosters.json   squads (refreshed daily)
  data/flags.json     nationality → flag emoji
  data/world.json     1:50m basemap (TopoJSON), used only by the canvas fallback
  img/crests/  img/grounds/
scripts/refresh.py      re-snapshots ESPN; League of Ireland from scripts/irl_static.json
.github/workflows/refresh.yml   runs the refresh daily and commits
```

## Deploy

Hosted as a Cloudflare Worker (`footballregister`) with static assets, built from this repo by
Workers Builds. Live at https://footballclub.wiki and
https://footballregister.richardmcallister.workers.dev.

Build settings (Workers & Pages → footballregister → Settings → Builds):

- Build command: **empty**
- Deploy command: `npx wrangler deploy`
- Root directory: `/`, production branch: `main`

`wrangler.jsonc` points the Worker at `./public`, so only that folder is served. `public/_headers`
sets cache lifetimes for `/data/*` and `/img/*`. The custom domain is added under the Worker's
**Domains** tab.

Every push to `main` — including the bot's daily data commit — redeploys in under a minute. If a
push doesn't start a build, the Cloudflare ↔ GitHub connection has dropped: reconnect it from
Settings → Builds → Manage.

To deploy by hand instead: `npx wrangler deploy` from the repo root.

## Live data

In the browser the page calls ESPN's public soccer feed directly for standings, fixtures and
squads; the committed snapshot is the fallback and the initial paint. Nothing needs a key.
The League of Ireland is not on that feed: edit `scripts/irl_static.json` to update its table.

## Editing club facts

`public/data/clubs.json` holds founded year, capacity, honours, manager, captain, record holders,
website and Instagram per club. Edit and push. Photos are Wikimedia Commons (credit link on each
card); crests belong to the clubs.
