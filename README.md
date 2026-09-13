# footballclub.wiki

Every club, every ground. A static site: 134 clubs across eight European leagues on an
interactive globe, with honours, stadiums, managers, captains, record holders, squads,
standings and next fixtures.

## Layout

```
public/            the site — deploy this folder as-is
  index.html       page, styles and script (D3 + TopoJSON from cdnjs)
  data/clubs.json  static club data, links, coordinates
  data/snapshot.json  standings, next fixtures, competitions (refreshed daily)
  data/rosters.json   squads (refreshed daily)
  data/flags.json     nationality → flag emoji
  data/world.json     1:50m basemap (TopoJSON)
  img/crests/  img/grounds/
scripts/refresh.py      re-snapshots ESPN; League of Ireland from scripts/irl_static.json
.github/workflows/refresh.yml   runs the refresh daily and commits
```

## Deploy on Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo.
3. Framework preset **None**, build command **empty**, build output directory **`public`**. Deploy.
4. Custom domains → add `footballclub.wiki` (and `www.footballclub.wiki`). DNS is created automatically.

Every push to `main` — including the bot's daily data commit — redeploys in under a minute.

## Live data

In the browser the page calls ESPN's public soccer feed directly for standings, fixtures and
squads; the committed snapshot is the fallback and the initial paint. Nothing needs a key.
The League of Ireland is not on that feed: edit `scripts/irl_static.json` to update its table.

## Editing club facts

`public/data/clubs.json` holds founded year, capacity, honours, manager, captain, record holders,
website and Instagram per club. Edit and push. Photos are Wikimedia Commons (credit link on each
card); crests belong to the clubs.
