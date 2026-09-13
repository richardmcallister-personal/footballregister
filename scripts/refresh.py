#!/usr/bin/env python3
"""Refresh public/data/snapshot.json and public/data/rosters.json from ESPN's public soccer feed.

Run daily by .github/workflows/refresh.yml. The League of Ireland is not carried by ESPN,
so its table/fixtures come from scripts/irl_static.json (edit by hand or extend this script).
No API key needed. Standard library only.
"""
import json, re, sys, time, datetime, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUB = ROOT / "public" / "data"
BASE = "https://site.api.espn.com/apis"
ESPN_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "sco.1", "swe.1"]
POS = {"Goalkeeper": "GK", "Defender": "DF", "Midfielder": "MF", "Forward": "FW", "Attacker": "FW"}


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print("retry", url, e, file=sys.stderr)
            time.sleep(3 * (i + 1))
    return None


def main():
    clubs = json.load(open(PUB / "clubs.json"))["clubs"]
    old_snap = json.load(open(PUB / "snapshot.json"))
    old_rosters = json.load(open(PUB / "rosters.json"))
    snap = {"generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "standings": dict(old_snap.get("standings", {})), "teams": dict(old_snap.get("teams", {}))}
    rosters = dict(old_rosters)

    for lg in ESPN_LEAGUES:
        d = get(f"{BASE}/v2/sports/soccer/{lg}/standings")
        if not d or "children" not in d:
            print("standings unavailable, keeping previous:", lg, file=sys.stderr)
            continue
        rows = []
        for e in d["children"][0]["standings"]["entries"]:
            st = {s["name"]: s.get("displayValue") for s in e["stats"]}
            rows.append({"id": e["team"]["id"], "name": e["team"]["displayName"], "rank": int(st.get("rank") or 0),
                         "pts": st.get("points"), "p": st.get("gamesPlayed"), "w": st.get("wins"), "d": st.get("ties"),
                         "l": st.get("losses"), "gd": st.get("pointDifferential")})
        snap["standings"][lg] = rows

    for c in clubs:
        if c["league"] not in ESPN_LEAGUES:
            continue
        tid = c["espn_id"]
        s = get(f"{BASE}/site/v2/sports/soccer/all/teams/{tid}/schedule?fixture=true")
        if s is not None:
            comps, nxt = [], None
            for ev in s.get("events", []):
                lg = (ev.get("league") or {}).get("name")
                if lg and lg not in comps:
                    comps.append(lg)
                comp = ev["competitions"][0]
                if nxt is None and comp["status"]["type"]["state"] == "pre":
                    home = next(x for x in comp["competitors"] if x["homeAway"] == "home")
                    away = next(x for x in comp["competitors"] if x["homeAway"] == "away")
                    nxt = {"date": ev["date"], "home": home["team"]["displayName"], "away": away["team"]["displayName"],
                           "home_id": home["team"]["id"], "away_id": away["team"]["id"], "comp": lg,
                           "venue": (comp.get("venue") or {}).get("fullName")}
            snap["teams"][tid] = {"competitions": comps, "next": nxt}
        r = get(f"{BASE}/site/v2/sports/soccer/{c['league']}/teams/{tid}/roster")
        if r and r.get("athletes"):
            pl = []
            for a in r["athletes"]:
                m = re.search(r"/countries/500/([a-z]+)\.png", (a.get("flag") or {}).get("href", ""))
                pl.append({"no": int(a["jersey"]) if str(a.get("jersey", "")).isdigit() else None,
                           "name": a.get("displayName"), "pos": POS.get((a.get("position") or {}).get("name"), "—"),
                           "nat": a.get("citizenship"), "code": m.group(1) if m else None, "age": a.get("age")})
            rosters[tid] = pl
        time.sleep(0.2)

    # League of Ireland: hand-maintained static feed
    irl_path = ROOT / "scripts" / "irl_static.json"
    if irl_path.exists():
        irl = json.load(open(irl_path))
        rows = []
        for tid, c in irl.items():
            t = c["table"]
            rows.append({"id": tid, "name": c["name"], "rank": t["rank"], "pts": str(t["pts"]), "p": str(t["p"]),
                         "w": str(t["w"]), "d": str(t["d"]), "l": str(t["l"]), "gd": str(t["gd"])})
            n = c.get("next")
            if n:
                n = {"date": n["date"], "home": n["home"], "away": n["away"],
                     "home_id": tid if n["home"] == c["name"] else None, "away_id": tid if n["away"] == c["name"] else None,
                     "comp": n["comp"], "venue": n.get("venue")}
            snap["teams"][tid] = {"competitions": c.get("competitions", []), "next": n}
        snap["standings"]["irl.1"] = sorted(rows, key=lambda r: r["rank"])

    json.dump(snap, open(PUB / "snapshot.json", "w"), ensure_ascii=False)
    json.dump(rosters, open(PUB / "rosters.json", "w"), ensure_ascii=False)
    print("refreshed", snap["generated"], "teams:", len(snap["teams"]), "rosters:", len(rosters))


if __name__ == "__main__":
    main()
