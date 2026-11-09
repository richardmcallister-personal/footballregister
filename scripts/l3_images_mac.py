#!/usr/bin/env python3
"""Crests (ESPN) and ground photos (Wikimedia) for a list of clubs; run on the Mac from the repo root."""
import json,io,re,os,sys,time,urllib.request,urllib.parse,urllib.error,ssl
from PIL import Image
UA={"User-Agent":"footballclubwiki-bot/1.0 (https://footballclub.wiki)"}
ctx=ssl.create_default_context()
try:
    import certifi; ctx=ssl.create_default_context(cafile=certifi.where())
except Exception: pass
def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60,context=ctx) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400,404): return None
            time.sleep(10*(i+1))
        except Exception: time.sleep(5)
    return None
def crop(im):
    w,h=im.size; target=16/9; th=int(w/target)
    if h>th: top=(h-th)//2; im=im.crop((0,top,w,top+th))
    else: tw=int(h*target); left=(w-tw)//2; im=im.crop((left,0,left+tw,h))
    im.thumbnail((960,540)); return im
jobs=json.load(open(sys.argv[1])); credits={}
for j in jobs:
    cid=j['id']
    if not os.path.exists(f'public/img/crests/{cid}.png'):
        b=get(j['crest'])
        if b: im=Image.open(io.BytesIO(b)).convert('RGBA'); im.thumbnail((96,96)); im.save(f'public/img/crests/{cid}.png',optimize=True)
    if j.get('img') and not os.path.exists(f'public/img/grounds/{cid}.jpg') and re.search(r'\.(jpe?g|png)$',j['img'].split('?')[0],re.I) and not re.search(r'logo|crest|badge|emblem',j['img'],re.I):
        u=j['img'].split('?')[0]; m=re.match(r'(https://upload\.wikimedia\.org/wikipedia/\w+)/(\w/\w\w)/(.+)$',u)
        if m: u=f"{m.group(1)}/thumb/{m.group(2)}/{m.group(3)}/1280px-{m.group(3)}"+('.jpg' if m.group(3).lower().endswith('.png') else '')
        b=get(u) or get(j['img'])
        if b:
            try:
                im=Image.open(io.BytesIO(b)).convert('RGB')
                if im.size[0]>=400: crop(im).save(f'public/img/grounds/{cid}.jpg',quality=68,optimize=True,progressive=True); credits[cid]='https://commons.wikimedia.org/wiki/File:'+j['image'].replace(' ','_')
            except Exception as e: print('bad image',cid,e)
        time.sleep(1.5)
json.dump(credits,open('_tmp/l3_credits.json','w'))
print('crests',sum(os.path.exists(f"public/img/crests/{j['id']}.png") for j in jobs),'photos',len(credits),'of',len(jobs))
