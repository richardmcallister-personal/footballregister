#!/usr/bin/env python3
"""Refresh public/data/snapshot.json, rosters.json, fixtures.json and nations_live.json from ESPN's
public soccer feed
(and the FIFA ranking as kept on Wikipedia).

Run daily by .github/workflows/refresh.yml. The League of Ireland is not carried by ESPN,
so its table/fixtures come from scripts/irl_static.json (edit by hand or extend this script).
No API key needed. Standard library only.
"""
import json, re, sys, time, datetime, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUB = ROOT / "public" / "data"
BASE = "https://site.api.espn.com/apis"
ESPN_LEAGUES = ["eng.1", "eng.2", "esp.1", "ita.1", "ger.1", "ger.2", "fra.1", "ned.1", "sco.1", "swe.1", "den.1", "por.1", "bel.1", "tur.1", "aut.1", "gre.1", "nor.1", "usa.1", "mex.1", "bra.1", "arg.1", "sco.2", "eng.3", "esp.2", "ita.2", "fra.2"]
POS = {"Goalkeeper": "GK", "Defender": "DF", "Midfielder": "MF", "Forward": "FW", "Attacker": "FW"}
FIXTURE_DAYS = 45   # how far ahead fixtures.json looks: enough weekends for "a match near me"


def now_z():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def home_fixtures(tid, sched, checked):
    """Every upcoming home fixture for this club, within the horizon, from its ESPN schedule.
    Read from the home club only, so each match is listed once and always has a ground we can place."""
    out = []
    if not sched:
        return out
    limit = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=FIXTURE_DAYS)
    for ev in sched.get("events", []):
        comp = ev["competitions"][0]
        if comp["status"]["type"]["state"] != "pre":
            continue
        try:
            when = datetime.datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if when > limit:
            continue
        home = next(x for x in comp["competitors"] if x["homeAway"] == "home")
        away = next(x for x in comp["competitors"] if x["homeAway"] == "away")
        if home["team"]["id"] != tid:
            continue
        out.append({"date": ev["date"], "home_id": tid, "away_id": away["team"]["id"],
                    "home": home["team"]["displayName"], "away": away["team"]["displayName"],
                    "comp": (ev.get("league") or {}).get("name"),
                    "venue": (comp.get("venue") or {}).get("fullName"), "checked": checked})
    return out


def write_fixtures(fix):
    """fixtures.json: upcoming home fixtures for the register's clubs, each with the time we last read it."""
    floor = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)).strftime("%Y-%m-%dT%H:%MZ")
    fix = [f for f in fix if f["date"] >= floor]     # a hand-kept feed can go stale; don't carry old matches
    fix.sort(key=lambda f: (f["date"], f["home"]))
    json.dump({"generated": now_z(), "days": FIXTURE_DAYS, "fixtures": fix},
              open(PUB / "fixtures.json", "w"), ensure_ascii=False)
    print("fixtures:", len(fix))


def irl_home_fixtures(checked):
    """League of Ireland is not on ESPN; its next matches come from the hand-kept file."""
    path = ROOT / "scripts" / "irl_static.json"
    if not path.exists():
        return []
    out = []
    for tid, c in json.load(open(path)).items():
        n = c.get("next")
        if n and n.get("home") == c["name"]:
            out.append({"date": n["date"], "home_id": tid, "away_id": None, "home": n["home"], "away": n["away"],
                        "comp": n.get("comp"), "venue": n.get("venue"), "checked": checked})
    return out


def fixtures_only():
    """Build fixtures.json on its own, leaving snapshot.json and rosters.json untouched."""
    clubs = json.load(open(PUB / "clubs.json"))["clubs"]
    fix = []
    for c in clubs:
        if c["league"] not in ESPN_LEAGUES:
            continue
        checked = now_z()
        fix += home_fixtures(c["espn_id"], get(f"{BASE}/site/v2/sports/soccer/all/teams/{c['espn_id']}/schedule?fixture=true"), checked)
        time.sleep(0.2)
    fix += irl_home_fixtures(now_z())
    write_fixtures(fix)


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print("retry", url, e, file=sys.stderr)
            time.sleep(3 * (i + 1))
    return None


RANK_ALIAS = {"USA": "United States", "IR Iran": "Iran", "Côte d'Ivoire": "Ivory Coast", "Korea Republic": "South Korea",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina", "Cabo Verde": "Cape Verde", "China PR": "China", "The Gambia": "Gambia",
    "Korea DPR": "North Korea", "St Kitts and Nevis": "St. Kitts and Nevis", "Hong Kong, China": "Hong Kong", "St Lucia": "St. Lucia",
    "St Vincent and the Grenadines": "St. Vincent and the Grenadines", "São Tomé and Príncipe": "Sao Tome and Principe"}


def fifa_ranking():
    """The FIFA men's ranking as transcribed on Wikipedia (Module:SportsRankings/data/FIFA World Rankings)."""
    url = ("https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2"
           "&titles=Module:SportsRankings/data/FIFA_World_Rankings")
    req = urllib.request.Request(url, headers={"User-Agent": "footballclubwiki-bot/1.0 (https://footballclub.wiki)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            lua = json.load(r)["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
    except Exception as e:  # noqa: BLE001
        print("ranking unavailable:", e, file=sys.stderr)
        return None
    m = re.search(r"data\.updated\s*=\s*\{[^}]*day\s*=\s*(\d+)[^}]*month\s*=\s*'(\w+)'[^}]*year\s*=\s*(\d+)", lua)
    updated = f"{m.group(1)} {m.group(2)} {m.group(3)}" if m else None
    rows = {}
    for name, rank, move, pts in re.findall(r'\{\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(-?\d+)\s*,\s*([\d.]+)\s*\}', lua):
        rows[RANK_ALIAS.get(name, name)] = [int(rank), int(move), float(pts)]
    return {"updated": updated, "rows": rows} if rows else None


def nations():
    """Next match and competitions for every national team in nations.json, plus the FIFA ranking."""
    path = PUB / "nations.json"
    if not path.exists():
        return
    old = json.load(open(PUB / "nations_live.json")) if (PUB / "nations_live.json").exists() else {}
    live = {"generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "ranking": old.get("ranking"), "teams": dict(old.get("teams", {}))}
    rk = fifa_ranking()
    if rk:
        live["ranking"] = rk
    for n in json.load(open(path))["nations"]:
        tid = n["espn_id"]
        s = get(f"{BASE}/site/v2/sports/soccer/all/teams/{tid}/schedule?fixture=true")
        if s is None:
            continue
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
        live["teams"][tid] = {"competitions": comps, "next": nxt}
        time.sleep(0.2)
    json.dump(live, open(PUB / "nations_live.json", "w"), ensure_ascii=False)
    print("nations refreshed:", len(live["teams"]), "ranking:", (live.get("ranking") or {}).get("updated"))


def main():
    clubs = json.load(open(PUB / "clubs.json"))["clubs"]
    old_snap = json.load(open(PUB / "snapshot.json"))
    old_rosters = json.load(open(PUB / "rosters.json"))
    snap = {"generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "standings": dict(old_snap.get("standings", {})), "teams": dict(old_snap.get("teams", {}))}
    rosters = dict(old_rosters)
    fix = []

    for lg in ESPN_LEAGUES:
        d = get(f"{BASE}/v2/sports/soccer/{lg}/standings")
        if not d or "children" not in d:
            print("standings unavailable, keeping previous:", lg, file=sys.stderr)
            continue
        rows = []
        for ch in d["children"]:
            conf = (ch.get("name") or "").replace(" Conference", "").replace("Group ", "Zone ") if len(d["children"]) > 1 else None
            for e in ch["standings"]["entries"]:
                st = {s["name"]: s.get("displayValue") for s in e["stats"]}
                rows.append({"id": e["team"]["id"], "name": e["team"]["displayName"], "rank": int(st.get("rank") or 0),
                             "pts": st.get("points"), "p": st.get("gamesPlayed"), "w": st.get("wins"), "d": st.get("ties"),
                             "l": st.get("losses"), "gd": st.get("pointDifferential"), "conf": conf or None})
        snap["standings"][lg] = rows

    for c in clubs:
        if c["league"] not in ESPN_LEAGUES:
            continue
        tid = c["espn_id"]
        checked = now_z()
        s = get(f"{BASE}/site/v2/sports/soccer/all/teams/{tid}/schedule?fixture=true")
        fix += home_fixtures(tid, s, checked)
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

    fix += irl_home_fixtures(now_z())
    write_fixtures(fix)
    json.dump(snap, open(PUB / "snapshot.json", "w"), ensure_ascii=False)
    json.dump(rosters, open(PUB / "rosters.json", "w"), ensure_ascii=False)
    print("refreshed", snap["generated"], "teams:", len(snap["teams"]), "rosters:", len(rosters))
    nations()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "fixtures":
        fixtures_only()
    else:
        main()
