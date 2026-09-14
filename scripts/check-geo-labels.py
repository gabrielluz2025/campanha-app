# -*- coding: utf-8 -*-
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
cache = json.loads((ROOT / "tmp-geocode-cache.json").read_text(encoding="utf-8"))
corr = json.loads((ROOT / "tmp-pins-corrigir.json").read_text(encoding="utf-8"))

def norm(s):
    import re, unicodedata
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()

# print cache entries that match corrected churches
for c in corr:
    key_bits = norm(c["endereco"])[:40]
    hits = []
    for k, v in cache.items():
        if not v or "lat" not in v:
            continue
        if abs(v["lat"] - c["lat"]) < 0.0002 and abs(v["lng"] - c["lng"]) < 0.0002:
            hits.append((k, v.get("label")))
    print(f"#{c['id']} {c['nome'][:36]}")
    print(f"  ficha: {c['endereco']}")
    for k, lab in hits[:2]:
        print(f"  nominatim: {lab}")
    print()
