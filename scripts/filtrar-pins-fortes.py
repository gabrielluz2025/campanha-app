# -*- coding: utf-8 -*-
import json
from collections import defaultdict
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "tmp-pins-audit.json"
d = json.loads(p.read_text(encoding="utf-8"))
pins = d["pin_longe_do_endereco"]

g = defaultdict(list)
for i in pins:
    geo = i.get("endereco_geo")
    if not geo:
        continue
    key = (round(geo[0], 4), round(geo[1], 4))
    g[key].append(i)

print("geocodes unicos", len(g), "de", len(pins))
print("Nominatim reutilizou o mesmo ponto (centro de rua, pouco confiavel):")
shared = 0
for k, vs in sorted(g.items(), key=lambda x: -len(x[1])):
    if len(vs) < 2:
        continue
    shared += len(vs)
    print(f"  {len(vs)}x {k}  {vs[0]['endereco'][:50]}")
print("compartilhados", shared)

print("\n=== SUSPEITOS FORTES (geo unico, >=800m, dentro de Blumenau) ===")
fortes = []
for i in pins:
    geo = i.get("endereco_geo")
    if not geo:
        continue
    key = (round(geo[0], 4), round(geo[1], 4))
    if len(g[key]) > 1:
        continue
    if (i.get("km") or 0) < 0.8:
        continue
    if not (-27.05 < geo[0] < -26.78 and -49.20 < geo[1] < -48.98):
        continue
    fortes.append(i)
    print(f"{i['km']:5.2f} km  #{i['id']} {i['nome']}")
    print(f"         ficha: {i['endereco']}")
    print(f"         pin={i['pin']} gpsBairro={i.get('bairro_gps')}  geo={geo}")

out = Path(__file__).resolve().parents[1] / "tmp-pins-fortes.json"
out.write_text(json.dumps(fortes, ensure_ascii=False, indent=2), encoding="utf-8")
print("\nfortes", len(fortes), "salvo", out)
