import re
ATTR = re.compile(r'^\s*((?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s|]+)[;\s]*)+)\|(?!\|)')

def split_cells(line):
    body = line[1:]
    parts = re.split(r'\|\||!!', body)
    out = []
    for p in parts:
        rs = 1; cs = 1
        m = ATTR.match(p)
        if m:
            a = m.group(1)
            r = re.search(r'rowspan\s*=\s*"?(\d+)', a); c = re.search(r'colspan\s*=\s*"?(\d+)', a)
            if r: rs = int(r.group(1))
            if c: cs = int(c.group(1))
            p = p[m.end():]
        out.append((p.strip(), rs, cs))
    return out

def clean_head(c):
    c = re.sub(r'<br\s*/?>', ' ', c); c = re.sub(r"'''", '', c); c = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', c)
    c = re.sub(r'\{\{[^}]*\}\}', '', c); c = re.sub(r'<[^>]+>', '', c)
    return re.sub(r'\s+', ' ', c).strip()

def parse_tables(text):
    """Each table → {'header': [...], 'rows': [[cell,...], ...]} with rowspan/colspan expanded like HTML."""
    out = []
    for m in re.finditer(r'\{\|(.*?)\n\|\}', text, re.S):
        tb = m.group(1)
        raw_rows = re.split(r'\n\|-[^\n]*', tb)
        header = None; rows = []; pending = {}  # col -> (value, remaining)
        for rr in raw_rows:
            cells = []; is_head = False
            for line in rr.split('\n'):
                if not line.strip() or line.startswith('|+'): continue
                if line.startswith('!'):
                    is_head = True; cells += split_cells(line)
                elif line.startswith('|'):
                    cells += split_cells(line)
                elif cells:
                    v, rs, cs = cells[-1]; cells[-1] = (v + ' ' + line.strip(), rs, cs)
            if not cells: continue
            if is_head and header is None:
                header = []
                for v, rs, cs in cells: header += [clean_head(v)] * cs
                continue
            # a later all-header row is a repeated/total heading; a row mixing '!' (scope=row) and '|' cells is data
            if is_head and not any(l.startswith('|') for l in rr.split('\n') if l.strip()): continue
            # lay out with pending rowspans
            row = []; col = 0; it = iter(cells)
            ncols = len(header) if header else 0
            while col < max(ncols, len(cells)) or col in pending:
                if col in pending:
                    v, rem = pending[col]; row.append(v)
                    if rem > 1: pending[col] = (v, rem - 1)
                    else: del pending[col]
                    col += 1; continue
                try: v, rs, cs = next(it)
                except StopIteration: break
                for k in range(cs):
                    row.append(v)
                    if rs > 1: pending[col] = (v, rs - 1)
                    col += 1
            rows.append(row)
        if header: out.append({'header': header, 'rows': rows})
    return out
