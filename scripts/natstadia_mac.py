#!/usr/bin/env python3
"""Run on the Mac (Wikipedia rate-limits the sandbox). For every national home ground named in
public/data/nations.json: capacity, coordinates and the lead image from its Wikipedia article.
  python3 natstadia_mac.py meta   -> _tmp/natstadia.json
  python3 natstadia_mac.py images -> public/img/grounds/n<id>.jpg (skips files already there)
"""
import json, re, sys, time, urllib.request, urllib.parse, urllib.error, os, ssl
UA = {"User-Agent": "footballclubwiki-bot/1.0 (https://footballclub.wiki)"}
ROOT = os.path.dirname(os.path.abspath(__file__)) + "/.."
N = json.load(open(f"{ROOT}/public/data/nations.json"))["nations"]
targets = [n for n in N if n.get("stadium_wiki") and not str(n.get("stadium", "")).startswith("Various")]
ctx = ssl.create_default_context()
try:
    import certifi; ctx = ssl.create_default_context(cafile=certifi.where())
except Exception: pass

def get(url, binary=False):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40, context=ctx) as r:
                return r.read() if binary else json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404): return None
            print("retry", e, file=sys.stderr); time.sleep(2 + 2 * i)
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(2 + 2 * i)
    return None

def capacity(wt):
    m = re.search(r"\|\s*(?:seating_)?capacity\s*=\s*(.*)", wt or "")
    if not m: return None
    line = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|\{\{[^{}]*\}\}", " ", m.group(1))
    nums = [int(x.replace(",", "").replace(".", "")) for x in re.findall(r"\b\d{1,3}(?:[,.]\d{3})+\b|\b\d{4,6}\b", line)]
    nums = [x for x in nums if 1000 <= x <= 200000]
    return nums[0] if nums else None

if sys.argv[1] == "meta":
    out = {}
    titles = sorted({n["stadium_wiki"].replace("_", " ") for n in targets})
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, "redirects": 1, "titles": "|".join(batch),
            "prop": "revisions|coordinates|pageimages", "rvprop": "content", "rvslots": "main", "colimit": "max", "piprop": "original|name|thumbnail", "pithumbsize": 1400, "pilicense": "any"})
        d = get("https://en.wikipedia.org/w/api.php?" + q)
        if not d: continue
        back = {}
        for r in d["query"].get("redirects", []) + d["query"].get("normalized", []): back[r["to"]] = back.get(r["from"], r["from"])
        for p in d["query"]["pages"]:
            if p.get("missing"): continue
            wt = (p.get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            co = (p.get("coordinates") or [{}])[0]
            key = back.get(p["title"], p["title"])
            out[key] = {"title": p["title"], "capacity": capacity(wt), "lat": co.get("lat"), "lon": co.get("lon"),
                        "image": p.get("pageimage"), "image_url": (p.get("original") or {}).get("source"), "thumb": (p.get("thumbnail") or {}).get("source")}
        time.sleep(0.5)
    os.makedirs(f"{ROOT}/_tmp", exist_ok=True)
    json.dump(out, open(f"{ROOT}/_tmp/natstadia.json", "w"), ensure_ascii=False, indent=0)
    print(len(out), "grounds;", sum(1 for v in out.values() if v["capacity"]), "with capacity;", sum(1 for v in out.values() if v["lat"]), "with coords;", sum(1 for v in out.values() if v["image"]), "with image")
else:
    START = time.time()
    meta = json.load(open(f"{ROOT}/_tmp/natstadia.json"))
    done = 0; todo = 0
    for n in targets:
        m = meta.get(n["stadium_wiki"].replace("_", " "))
        if not m or not m.get("image") or not re.search(r"\.(jpe?g|png)$", m["image"], re.I): continue
        path = f"{ROOT}/public/img/grounds/{n['id']}.jpg"
        if os.path.exists(path): continue
        todo += 1
        if time.time() - START > 100: break
        url = m.get("thumb") or m.get("image_url")
        if not url: continue
        url = url.split("?")[0]
        mm = re.match(r"(https://upload\.wikimedia\.org/wikipedia/\w+)/(\w/\w\w)/(.+)$", url)
        if mm and "/thumb/" not in url: url = f"{mm.group(1)}/thumb/{mm.group(2)}/{mm.group(3)}/1280px-{mm.group(3)}" + (".png" if mm.group(3).lower().endswith(".svg") else "")
        b = get(url, binary=True)
        if b and len(b) > 5000:
            open(path, "wb").write(b); done += 1
        time.sleep(0.3)
    print("downloaded", done, "remaining", todo - done)
