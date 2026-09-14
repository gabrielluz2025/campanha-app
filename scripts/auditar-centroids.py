# -*- coding: utf-8 -*-
import json, re, math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = (ROOT / "src/data/igrejasBase.js").read_text(encoding="utf-8")
items = []
for m in re.finditer(
    r"\{\s*id:(\d+)\s*,\s*lat:(-?[\d.]+)\s*,\s*lng:(-?[\d.]+)\s*,\s*nome:'((?:\\'|[^'])*)'\s*,\s*setor:'((?:\\'|[^'])*)'.*?endereco:'((?:\\'|[^'])*)'",
    text, re.S):
    items.append({
        "id": int(m.group(1)),
        "lat": float(m.group(2)),
        "lng": float(m.group(3)),
        "nome": m.group(4).replace("\\'", "'"),
        "setor": m.group(5).replace("\\'", "'"),
        "endereco": m.group(6).replace("\\'", "'"),
    })

# cluster by rounded coords (approx 11m)
clusters = defaultdict(list)
for i in items:
    key = (round(i["lat"], 4), round(i["lng"], 4))
    clusters[key].append(i)

print("catalogo", len(items))
print("clusters com 3+ pins no mesmo ponto:")
for k, vs in sorted(clusters.items(), key=lambda x: -len(x[1])):
    if len(vs) < 3:
        continue
    print(f"  {len(vs)} pins @ {k}  setor~{vs[0]['setor']}")
    for v in vs[:8]:
        print(f"    #{v['id']} {v['nome'][:40]} | {v['endereco'][:50]}")
