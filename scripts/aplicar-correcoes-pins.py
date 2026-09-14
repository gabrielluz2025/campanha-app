# -*- coding: utf-8 -*-
"""Move pins dumped at downtown / wrong neighborhood to the geocoded address."""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORTES = json.loads((ROOT / "tmp-pins-fortes.json").read_text(encoding="utf-8"))
JSX = ROOT / "src" / "data" / "igrejasBase.js"

CENTRO = (-26.9194, -49.0661)


def hav(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def is_centro_dump(ig):
    pin = tuple(ig["pin"])
    if hav(pin, CENTRO) <= 0.85:
        setor = (ig.get("setor") or "").upper()
        if setor not in ("CENTRO", "VICTOR KONDER", "SEDE"):
            return True
    gps = (ig.get("bairro_gps") or "").upper()
    setor = (ig.get("setor") or "").upper()
    if gps == "CENTRO" and setor not in ("CENTRO", "VICTOR KONDER", "SEDE", ""):
        return True
    return False


# Cases like Universal (Itoupava Norte ficha, pin in Garcia)
def bairro_muito_errado(ig):
    gps = (ig.get("bairro_gps") or "")
    setor = (ig.get("setor") or "")
    if not gps or not setor:
        return False
    if setor.upper() in ("CENTRO", "VICTOR KONDER"):
        return False
    # adjacent pairs we ignore
    vizinhos = {
        ("ITOUPAVA CENTRAL", "TRIBESS"),
        ("TRIBESS", "ITOUPAVA CENTRAL"),
        ("VELHA", "RIBEIRAO FRESCO"),
        ("VELHA", "RIBEIRÃO FRESCO"),
        ("FORTALEZA", "BOA VISTA"),
        ("FORTALEZA", "PONTA AGUDA"),
        ("ITOUPAVA NORTE", "FORTALEZA ALTA"),
        ("ITOUPAVA NORTE", "TRIBESS"),
        ("ITOUPAVA SECA", "FIDELIS"),
        ("ITOUPAVA SECA", "FIDÉLIS"),
        ("SALTO", "ITOUPAVAZINHA"),
        ("SALTO", "TESTO SALTO"),
        ("BADENFURT", "DO SALTO"),
        ("GARCIA", "GARCIA"),
    }
    a = setor.upper().replace("Á", "A").replace("É", "E").replace("Í", "I")
    b = gps.upper().replace("Á", "A").replace("É", "E").replace("Í", "I")
    if (a, b) in vizinhos:
        return False
    return a != b and ig.get("km", 0) >= 3.0


escolhidos = []
for ig in FORTES:
    if ig.get("id", 0) < 1000:
        continue  # ADBLU oficial: nao mexer automaticamente
    if is_centro_dump(ig) or bairro_muito_errado(ig):
        escolhidos.append(ig)

print(f"corrigir {len(escolhidos)} pins")
for ig in escolhidos:
    print(f"  #{ig['id']} {ig['nome'][:40]}  {ig['setor']} -> {ig['endereco_geo']}")

text = JSX.read_text(encoding="utf-8")
n = 0
for ig in escolhidos:
    lat, lng = ig["endereco_geo"]
    # match { id:XXXX, lat:old, lng:old,
    pat = rf"(\{{\s*id:{ig['id']},\s*)lat:-?[\d.]+,\s*lng:-?[\d.]+,"
    repl = rf"\g<1>lat:{lat:.6f}, lng:{lng:.6f},"
    new, c = re.subn(pat, repl, text, count=1)
    if c:
        text = new
        n += 1
    else:
        print("  NAO ACHOU no JSX", ig["id"])

JSX.write_text(text, encoding="utf-8")
print("atualizados no catalogo", n)

# runtime corrections for igrejaDedupe
corr = []
for ig in escolhidos:
    rua = re.split(r"\d", ig["endereco"], 1)[0].strip(" ,")
    if len(rua) < 6:
        continue
    corr.append({
        "id": ig["id"],
        "nome": ig["nome"],
        "endereco": ig["endereco"],
        "lat": ig["endereco_geo"][0],
        "lng": ig["endereco_geo"][1],
    })
(ROOT / "tmp-pins-corrigir.json").write_text(json.dumps(corr, ensure_ascii=False, indent=2), encoding="utf-8")
print("lista", len(corr))
