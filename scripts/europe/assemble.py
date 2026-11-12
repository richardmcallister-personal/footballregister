import json, re, os, collections
R = json.load(open('data/ties_raw.json')); CL = json.load(open('data/clubs.json'))
clubs = {c['espn_id']: c for c in CL['clubs']}
NAMES = {'UCL': 'European Cup / Champions League', 'UEL': 'UEFA Cup / Europa League', 'UECL': 'Conference League', 'CWC': "Cup Winners' Cup", 'ICFC': 'Inter-Cities Fairs Cup',
    'UIC': 'Intertoto Cup', 'USC': 'UEFA Super Cup', 'CWCup': 'Intercontinental Cup / Club World Cup', 'LIB': 'Copa Libertadores', 'SUD': 'Copa Sudamericana', 'RECOPA': 'Recopa Sudamericana',
    'CONM': 'Other CONMEBOL competitions', 'CCC': 'CONCACAF Champions Cup', 'LC': 'Leagues Cup', 'CONC': 'Other CONCACAF competitions', 'OTHER': 'Other international competitions'}
ORDER = ['UCL', 'UEL', 'UECL', 'CWC', 'ICFC', 'UIC', 'USC', 'CWCup', 'LIB', 'SUD', 'RECOPA', 'CONM', 'CCC', 'LC', 'CONC', 'OTHER']
ROUND = [  # (regex, short, rank)  rank: higher = further
    (r'winner|champion', 'W', 100), (r'^final|\bfinal$|^f$', 'F', 90), (r'runner', 'F', 90), (r'semi|^sf', 'SF', 80), (r'quarter|^qf', 'QF', 70),
    (r'round of 16|^r16|1/8|eighth|last 16', 'R16', 60), (r'round of 32|^r32|1/16|last 32', 'R32', 50), (r'knockout|play-?off|^kpo|^po\b', 'PO', 45),
    (r'league phase|^lge', 'LP', 42), (r'group|^grp|^g\d|^gs', 'GS', 40), (r'third|^r3|^3r|^3$|^3rd', 'R3', 35), (r'second|^r2|^2r|^2$|^2nd', 'R2', 30),
    (r'first|^r1|^1r|^1$|^1st', 'R1', 25), (r'prelim|qualif|^q|^pr|^p$', 'Q', 10)]
def rnd(r):
    s = (r or '').strip().lower()
    for rx, short, rank in ROUND:
        if re.search(rx, s): return short, rank
    return (r or '')[:12], 20
def yr(s):
    m = re.match(r'(\d{4})', s or ''); return int(m.group(1)) if m else 0

# reverse edges: ties recorded on another register club's page where this club is the opponent
rev = collections.defaultdict(list)
for cid, v in R.items():
    for t in v['ties']:
        oid = t.get('opp_id')
        if not oid: continue
        legs = [{'where': {'H': 'A', 'A': 'H'}.get(l['where'], 'N'), 'gf': l['ga'], 'ga': l['gf'], 'text': (f"{l['ga']}–{l['gf']}" if l['gf'] is not None else l['text'])} for l in t['legs']]
        agg = None
        if t.get('agg'):
            m = re.match(r'(\d+)\s*[–\-]\s*(\d+)', t['agg']); agg = f"{m.group(2)}–{m.group(1)}" if m else None
        rev[oid].append({'season': t['season'], 'comp': t['comp'], 'round': t['round'], 'opp': clubs[cid]['name'], 'opp_name': clubs[cid]['name'], 'opp_id': cid,
                         'country': CL['leagues'][clubs[cid]['league']]['country'], 'legs': legs, 'agg': agg, 'via': cid})

def outcome(t):
    """W/D/L of the tie for the club, from aggregate when numeric else from legs."""
    gf = ga = None
    if t.get('agg'):
        m = re.match(r'(\d+)\s*[–\-−]\s*(\d+)', t['agg'])
        if m: gf, ga = int(m.group(1)), int(m.group(2))
    if gf is None and t['legs'] and all(l['gf'] is not None for l in t['legs']):
        gf = sum(l['gf'] for l in t['legs']); ga = sum(l['ga'] for l in t['legs'])
    if gf is None: return None
    if gf == ga:
        txt = ' '.join([t.get('agg') or ''] + [l['text'] or '' for l in t['legs']])
        m = re.search(r'\((\d+)\s*[–\-]\s*(\d+)\s*(?:p|pen)', txt)
        if m: return 'W' if int(m.group(1)) > int(m.group(2)) else 'L'
        if re.search(r'\ba\)|away goals', txt): return None
    return 'W' if gf > ga else 'L' if gf < ga else 'D'

os.makedirs('out/europe', exist_ok=True)
index = {}
for cid, c in clubs.items():
    own = R.get(cid, {}).get('ties', [])
    ties = list(own); src = R.get(cid, {}).get('source')
    have = {(yr(t['season']), t['comp'], t.get('opp_id')) for t in own}
    extra = [t for t in rev.get(cid, []) if (yr(t['season']), t['comp'], t['opp_id']) not in have]
    ties += extra
    if not ties: continue
    ties.sort(key=lambda t: (yr(t['season']), t['season'], ORDER.index(t['comp']) if t['comp'] in ORDER else 99, rnd(t['round'])[1]))
    seasons = collections.OrderedDict()
    for t in ties:
        k = (t['season'], t['comp']); s = seasons.setdefault(k, {'s': t['season'], 'comp': t['comp'], 'ties': []})
        s['ties'].append(t)
    comps = {}; opps = {}; countries = collections.Counter(); legs_w = legs_d = legs_l = 0
    for (sea, ck), s in seasons.items():
        best = max((rnd(t['round']) for t in s['ties']), key=lambda x: x[1])
        if best[0] == 'F' and any(rnd(t['round'])[0] == 'F' and outcome(t) == 'W' for t in s['ties']): best = ('W', 100)
        s['exit'] = best[0]; s['rank'] = best[1]
        cm = comps.setdefault(ck, {'name': NAMES.get(ck, ck), 'seasons': 0, 'ties': 0, 'w': 0, 'd': 0, 'l': 0, 'best': ('', 0), 'from_register': 0})
        cm['seasons'] += 1
        for t in s['ties']:
            cm['ties'] += 1; o = outcome(t)
            if o: cm[o.lower()] += 1
            if t.get('via'): cm['from_register'] += 1
            if t.get('country'): countries[t['country']] += 1
            key = t.get('opp_id') or t['opp']
            op = opps.setdefault(key, {'name': clubs[t['opp_id']]['name'] if t.get('opp_id') else t['opp_name'], 'id': t.get('opp_id'), 'country': t.get('country'), 'ties': 0, 'w': 0, 'd': 0, 'l': 0, 'last': t['season']})
            op['ties'] += 1
            if o: op[o.lower()] += 1
            if yr(t['season']) >= yr(op['last']): op['last'] = t['season']
        if best[1] > cm['best'][1]: cm['best'] = (best[0], best[1])
    for cm in comps.values(): cm['best'] = cm['best'][0]
    # honours in the register settle the best finish where the tables don't mark the winner
    region = CL['leagues'][c['league']].get('region', 'eu')
    for key, field in (('UCL' if region == 'eu' else 'LIB' if region == 'sa' else 'CCC', 'ucl'), ('UEL' if region == 'eu' else 'SUD' if region == 'sa' else 'LC', 'uel'), ('UECL', 'uecl')):
        if c.get(field) and key in comps: comps[key]['best'] = 'W'; comps[key]['titles'] = c[field]
    top = sorted(opps.values(), key=lambda o: (-o['ties'], -yr(o['last'])))[:12]
    out = {'id': cid, 'source': src, 'register_only': not own,
           'seasons': [{'s': s['s'], 'comp': s['comp'], 'exit': s['exit'],
                        'ties': [{'r': t['round'], 'opp': t['opp_name'] or t['opp'], 'id': t.get('opp_id'), 'c': t.get('country'), 'h': next((l['text'] for l in t['legs'] if l['where'] == 'H'), None),
                                  'a': next((l['text'] for l in t['legs'] if l['where'] == 'A'), None), 'agg': t.get('agg'), 'o': outcome(t), 'via': t.get('via')} for t in s['ties']]} for s in seasons.values()],
           'comps': [dict(key=k, **comps[k]) for k in ORDER if k in comps] + [dict(key=k, **comps[k]) for k in comps if k not in ORDER],
           'opponents': top, 'countries': [{'c': k, 'n': n} for k, n in countries.most_common(40)],
           'grounds': sorted({t['opp_id'] for t in ties if t.get('opp_id')}, key=int)}
    json.dump(out, open(f'out/europe/{cid}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    index[cid] = {'seasons': len(seasons), 'ties': len(ties), 'opps': len(opps), 'reg': len(out['grounds']), 'own': bool(own), 'first': ties[0]['season'], 'last': ties[-1]['season']}
json.dump(index, open('out/europe_index.json', 'w'), separators=(',', ':'))
print(len(index), 'clubs;', sum(1 for v in index.values() if v['own']), 'with their own record;', sum(v['ties'] for v in index.values()), 'ties')
big = sorted(index.items(), key=lambda x: -x[1]['ties'])[:8]; print(big)
print('size', sum(os.path.getsize(f'out/europe/{f}') for f in os.listdir('out/europe')) // 1024, 'KB')
