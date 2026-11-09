#!/usr/bin/env python3
"""python3 wikifetch_mac.py titles.txt out.json [lang] — wikitext + coordinates + lead image for each title (run on the Mac)."""
import json,sys,time,urllib.request,urllib.parse,ssl
UA={"User-Agent":"footballclubwiki-bot/1.0 (https://footballclub.wiki)"}
ctx=ssl.create_default_context()
try:
    import certifi; ctx=ssl.create_default_context(cafile=certifi.where())
except Exception: pass
titles=[t.strip() for t in open(sys.argv[1],encoding='utf-8') if t.strip()]; lang=sys.argv[3] if len(sys.argv)>3 else 'en'
out={}
for i in range(0,len(titles),15):
    b=titles[i:i+15]
    q=urllib.parse.urlencode({"action":"query","format":"json","formatversion":2,"redirects":1,"titles":"|".join(b),"prop":"revisions|coordinates|pageimages","rvprop":"content","rvslots":"main","colimit":"max","piprop":"original|name","pilicense":"any"})
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request("https://"+lang+".wikipedia.org/w/api.php?"+q,headers=UA),timeout=60,context=ctx) as r: d=json.load(r); break
        except Exception as e: print('retry',e,file=sys.stderr); time.sleep(5*(a+1)); d=None
    if not d: continue
    back={}
    for r in d["query"].get("redirects",[])+d["query"].get("normalized",[]): back[r["to"]]=back.get(r["from"],r["from"])
    for p in d["query"]["pages"]:
        if p.get("missing"): out[back.get(p["title"],p["title"])]=None; continue
        co=(p.get("coordinates") or [{}])[0]
        out[back.get(p["title"],p["title"])]={"title":p["title"],"wikitext":(p.get("revisions") or [{}])[0].get("slots",{}).get("main",{}).get("content",""),"lat":co.get("lat"),"lon":co.get("lon"),"image":p.get("pageimage"),"image_url":(p.get("original") or {}).get("source")}
    time.sleep(1)
json.dump(out,open(sys.argv[2],"w"),ensure_ascii=False)
print(len(out),"pages;",[k for k,v in out.items() if v is None])
