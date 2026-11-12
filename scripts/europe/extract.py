import json, re, sys, collections
sys.path.insert(0, '/home/claude/eu'); from wikitable import parse_tables, clean_head
W = {}
for i in range(5): W.update(json.load(open(f'data/eu_wiki_{i}.json')))
CW = json.load(open('data/club_wiki.json')); EA = json.load(open('data/euro_articles.json')); EA.update(json.load(open('data/euro_articles2.json'))); CL = json.load(open('data/clubs.json'))
by_title = {}
for cid, t in CW.items(): by_title.setdefault(t, cid)
# also map redirect/normalised titles in W back: W keys are the requested titles
clubs = {c['espn_id']: c for c in CL['clubs']}

COMP = [  # (regex on competition text, key, display)
    (r'champions league|european cup|european champion clubs', 'UCL', 'European Cup / Champions League'),
    (r'europa league|uefa cup\b', 'UEL', 'UEFA Cup / Europa League'),
    (r'conference league', 'UECL', 'Conference League'),
    (r"cup winners'? cup|cup winners cup", 'CWC', "Cup Winners' Cup"),
    (r'fairs cup', 'ICFC', 'Inter-Cities Fairs Cup'),
    (r'intertoto', 'UIC', 'Intertoto Cup'),
    (r'uefa super cup|european super cup', 'USC', 'UEFA Super Cup'),
    (r'intercontinental|club world cup|world club', 'CWCup', 'Intercontinental / Club World Cup'),
    (r'libertadores', 'LIB', 'Copa Libertadores'),
    (r'sudamericana', 'SUD', 'Copa Sudamericana'),
    (r'recopa', 'RECOPA', 'Recopa Sudamericana'),
    (r'conmebol|merconorte|mercosur|supercopa', 'CONM', 'Other CONMEBOL'),
    (r'concacaf champions|concachampions|concacaf champion', 'CCC', 'CONCACAF Champions Cup'),
    (r'leagues cup', 'LC', 'Leagues Cup'),
    (r'concacaf', 'CONC', 'Other CONCACAF'),
    (r'mitropa|latin cup|anglo-italian|texaco|cup of the alps|rappan|balkans', 'OTHER', 'Other international'),
]
def comp_key(s):
    s = (s or '').lower()
    for rx, k, d in COMP:
        if re.search(rx, s): return k, d
    return None, None

def strip(s):
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>', '', s, flags=re.S); s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'\{\{(?:flagicon|flag|fb|fbaicon|flagu|flagcountry|flagathlete)\|[^}]*\}\}', '', s, flags=re.I)
    s = re.sub(r'\{\{(?:nowrap|center|nobr|small|abbr)\|([^{}|]*)(?:\|[^{}]*)?\}\}', r'\1', s, flags=re.I)
    s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', s); s = re.sub(r"'''?", '', s); s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', s).strip(' ,;')
def firstlink(s):
    for m in re.finditer(r'\[\[([^\]|#]+)(?:[^\]]*)\]\]', s or ''):
        t = m.group(1).strip()
        if not re.match(r'(File|Image|Category):', t, re.I) and not re.match(r'\d{4}', t): return t
    return None
def flag(s):
    m = re.search(r'\{\{(?:flagicon|flag|fb|fbaicon|flagu|flagcountry)\|([^}|]+)', s or '', re.I); return m.group(1).strip() if m else None
def score(s):
    s = strip(s); m = re.search(r'(\d+)\s*[–\-−:]\s*(\d+)', s)
    return (int(m.group(1)), int(m.group(2)), s) if m else (None, None, s or None)
def season_of(s):
    s = strip(s); m = re.search(r'((?:18|19|20)\d\d)(?:[–\-/](\d{2,4}))?', s)
    if not m: return None
    y = int(m.group(1)); return f"{y}–{str(y+1)[2:]}" if m.group(2) else str(y)
def col(H, *names):
    for n in names:
        for i, h in enumerate(H):
            if h.lower().startswith(n): return i
    return None

def ties_from_page(title, text, default_comp=None):
    """Return a list of ties from a page's wikitext. Both tie-row and match-row tables."""
    out = []
    # section headings with positions, to supply the competition when a table lacks the column
    heads = [(m.start(), clean_head(m.group(1))) for m in re.finditer(r'\n==+\s*([^=\n]+?)\s*==+', text)]
    for m in re.finditer(r'\{\|(.*?)\n\|\}', text, re.S):
        tbs = parse_tables(m.group(0))
        if not tbs: continue
        t = tbs[0]; H = t['header']
        iopp = col(H, 'opponent', 'opposition', 'opposing team'); iseason = col(H, 'season', 'year', 'edition'); icomp = col(H, 'competition', 'comp.', 'tournament')
        if iopp is None and col(H, 'club') is not None and (col(H, 'round') is not None) and iseason is not None: iopp = col(H, 'club')
        iround = col(H, 'round', 'stage', 'group'); ihome = col(H, 'home', '1st leg', 'first leg'); iaway = col(H, 'away', '2nd leg', 'second leg'); iagg = col(H, 'agg', 'total', 'result')
        icountry = col(H, 'country', 'nation'); iscore = col(H, 'score'); idate = col(H, 'date'); ivenue = col(H, 'venue')
        if iopp is None or (iseason is None and icomp is None): continue
        sec = next((h for p, h in reversed(heads) if p < m.start()), None)
        secck, secdn = comp_key(sec)
        last_season = None
        # second 'Opponent' column (flag | name): use the one containing a link
        opp_cols = [i for i, h in enumerate(H) if re.match(r'opponent|opposition|opposing', h.lower())] or [iopp]
        for r in t['rows']:
            if len(r) <= max(iopp, iseason or 0): continue
            get = lambda i: r[i] if i is not None and i < len(r) else ''
            oppcell = next((r[i] for i in opp_cols if i < len(r) and '[[' in r[i]), get(iopp))
            opp = firstlink(oppcell) or strip(oppcell)
            if not opp or re.search(r'^(bye|walkover|w/o|—|-)$', strip(oppcell).lower()): continue
            season = season_of(get(iseason)) if iseason is not None else None
            if season is None and iseason is not None: season = last_season
            if iseason is None: season = season_of(get(icomp)) if icomp is not None else None
            if iseason is None and not season: season = season_of(sec or '')
            last_season = season
            comptxt = strip(get(icomp)) if icomp is not None else None
            ck, cd = comp_key(comptxt) if comptxt else (secck, secdn)
            if not ck and default_comp: ck, cd = default_comp
            if not ck: continue
            country = flag(get(icountry)) or flag(oppcell) or next((flag(r[i]) for i in opp_cols if i < len(r) and flag(r[i])), None)
            rnd = strip(get(iround)) if iround is not None else ''
            if iscore is not None and ihome is None and (idate is not None or ivenue is not None):  # match-row format
                gf, ga, sc = score(get(iscore)); venue = strip(get(ivenue)) if ivenue is not None else ''
                out.append({'season': season, 'comp': ck, 'round': rnd, 'opp': opp, 'opp_name': strip(oppcell), 'country': country,
                            'legs': [{'where': 'H' if re.search(r'\(h\)|home', venue, re.I) else ('A' if re.search(r'\(a\)|away', venue, re.I) else 'N'), 'gf': gf, 'ga': ga, 'text': sc}]})
                continue
            h = score(get(ihome)) if ihome is not None else (None, None, None); a = score(get(iaway)) if iaway is not None else (None, None, None)
            agg = score(get(iagg)) if iagg is not None else (None, None, None)
            if ihome is None and iscore is not None:
                sc = strip(get(iscore)); parts = re.findall(r'(\d+)\s*[–\-−]\s*(\d+)', sc)
                if len(parts) >= 2: h = (int(parts[0][0]), int(parts[0][1]), f'{parts[0][0]}–{parts[0][1]}'); a = (int(parts[1][0]), int(parts[1][1]), f'{parts[1][0]}–{parts[1][1]}')
                agg = (None, None, sc or None)
            legs = []
            if h[2]: legs.append({'where': 'H', 'gf': h[0], 'ga': h[1], 'text': h[2]})
            if a[2]: legs.append({'where': 'A', 'gf': a[0], 'ga': a[1], 'text': a[2]})
            aggtxt = agg[2] if agg[2] and re.search(r'\d+\s*[–\-−:]\s*\d+', agg[2]) else None
            out.append({'season': season, 'comp': ck, 'round': rnd, 'opp': opp, 'opp_name': strip(oppcell), 'country': country, 'legs': legs, 'agg': aggtxt})
    return out

def norm_opp(t):
    return re.sub(r'\s+', ' ', t).strip()
title_to_id = {}
for cid, t in CW.items():
    if t: title_to_id[t] = cid
# the W keys may be the redirect source; add the resolved titles too
for k, v in W.items():
    if v and k in title_to_id and v['title'] != k: title_to_id[v['title']] = title_to_id[k]

result = {}
for cid, c in clubs.items():
    pages = []
    if cid in EA: pages.append(EA[cid])
    if CW.get(cid): pages.append(CW[cid])
    ties = []; src = None
    for p in pages:
        v = W.get(p)
        if not v: continue
        t = ties_from_page(p, v['wikitext'])
        t = [x for x in t if x['season']]
        if len(t) > len(ties): ties, src = t, p
    if not ties: continue
    # dedupe (same season, comp, opp, round)
    seen = set(); uniq = []
    for x in ties:
        k = (x['season'], x['comp'], x['opp'], tuple(l['text'] for l in x['legs']), x.get('agg'))
        if k in seen: continue
        seen.add(k); uniq.append(x)
    for x in uniq:
        oid = title_to_id.get(x['opp'])
        if oid and oid != cid: x['opp_id'] = oid
    result[cid] = {'source': 'https://en.wikipedia.org/wiki/' + src.replace(' ', '_'), 'ties': uniq}
json.dump(result, open('data/ties_raw.json', 'w'), ensure_ascii=False)
n = len(result); nt = sum(len(v['ties']) for v in result.values()); linked = sum(1 for v in result.values() for x in v['ties'] if x.get('opp_id'))
print(f'{n} clubs with ties, {nt} ties, {linked} opponents linked to the register')
by = collections.Counter(clubs[c]['league'] for c in result); print(by)
missing = [clubs[c]['name'] for c in clubs if c not in result and (clubs[c].get('ucl') or clubs[c].get('uel') or clubs[c].get('uecl'))]
print('winners without ties:', missing)
