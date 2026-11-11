# footballclub.wiki

Every club, every ground, every nation. A static site: 494 clubs across twenty-seven leagues in Europe and the
Americas and all 211 FIFA national teams, with honours, stadiums, managers, captains, record holders, squads,
standings, the FIFA ranking, head-to-head records, next fixtures, the 2026 World Cup, and a search for
a match being played near you.

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
  data/nations.json   211 national teams: ranking, honours, coach, captain, records, ground, coordinates
  data/nations_live.json  national next matches/competitions + FIFA ranking (refreshed daily)
  data/nation_squads.json latest squads from Wikipedia, with club_id links into the club register
  data/h2h.json       head-to-head among FIFA members [P,W,D,L,GF,GA,last date,last score,tournament]
  data/worldcup2026.json  groups, bracket and results of the 2026 World Cup
  data/fixtures.json  every upcoming home fixture in the register (45 days), each with the time it
                      was last read from ESPN; used by near/ (refreshed daily)
  nations/ nation/ worldcup/  the national-team pages (#uefa…, #n<espn_id>)
  near/            a match near me: a city or your location, a weekend, every club at home within
                   25/50/100 km, with kickoff in the ground's own time zone (#<city-country>)
  img/flags/          n<espn_id>.png flags (ESPN)
  data/world.json     1:50m basemap (TopoJSON), used only by the canvas fallback
  img/crests/  img/grounds/  img/flags/
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
