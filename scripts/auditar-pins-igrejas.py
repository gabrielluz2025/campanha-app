# -*- coding: utf-8 -*-
"""Cruza endereço x GPS x polígono de bairro para achar pins no lugar errado."""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSX = ROOT / "src" / "data" / "igrejasBase.js"
DUMP = ROOT / "tmp-igrejas-dump.json"
GEO = ROOT / "public" / "bairros_pm.geojson"
OUT = ROOT / "tmp-pins-audit.json"

UA = "CampanhaApp-PinAudit/1.0 (auditoria de enderecos)"


def norm(s):
    s = str(s or "")
    s = s.replace("\u0301", "")
    import unicodedata
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def haversine_km(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def point_in_ring(lng, lat, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[(i - 1) % n][0], ring[(i - 1) % n][1]
        if ((yi > lat) != (yj > lat)) and lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi:
            inside = not inside
    return inside


def point_in_feat(lng, lat, feat):
    g = feat.get("geometry") or {}
    t = g.get("type")
    coords = g.get("coordinates") or []
    if t == "Polygon":
        return point_in_ring(lng, lat, coords[0]) if coords else False
    if t == "MultiPolygon":
        return any(point_in_ring(lng, lat, p[0]) for p in coords if p)
    return False


def bairro_do_ponto(lat, lng, features):
    hits = []
    for f in features:
        if point_in_feat(lng, lat, f):
            hits.append(f["properties"].get("name") or "")
    if not hits:
        return None
    hits.sort(key=len, reverse=True)
    return hits[0]


def extrair_rua(end):
    s = str(end or "").split(" - ")[0].strip()
    s = s.split(",")[0].strip()
    s = re.sub(r",?\s*\d{1,6}\s*$", "", s).strip()
    s = re.sub(r"^(RUA|R\.|AVENIDA|AV\.|TRAVESSA|TV\.|ALAMEDA|AL\.)\s+", "", s, flags=re.I)
    return s


def extrair_num(end):
    s = str(end or "")
    if re.search(r"\bS\s*/\s*N\b", s, re.I):
        return None
    head = s.split("-")[0]
    m = re.search(r",\s*n[ºo°.]?\s*(\d{1,6})\b", head, re.I) or re.search(r",\s*(\d{1,6})\b", head)
    if m:
        return m.group(1)
    nums = re.findall(r"\b(\d{1,6})\b", head)
    if not nums:
        return None
    if len(nums) >= 2 and len(nums[0]) <= 2:
        return nums[-1]
    return nums[-1]


def parse_jsx_igrejas(text):
    items = []
    for m in re.finditer(
        r"\{\s*id:(\d+)\s*,\s*lat:(-?[\d.]+)\s*,\s*lng:(-?[\d.]+)\s*,\s*nome:'((?:\\'|[^'])*)'\s*,\s*setor:'((?:\\'|[^'])*)'.*?endereco:'((?:\\'|[^'])*)'",
        text,
        re.S,
    ):
        items.append({
            "id": int(m.group(1)),
            "lat": float(m.group(2)),
            "lng": float(m.group(3)),
            "nome": m.group(4).replace("\\'", "'"),
            "setor": m.group(5).replace("\\'", "'"),
            "endereco": m.group(6).replace("\\'", "'"),
            "fonte": "catalogo",
        })
    return items


def geocode(q, cache):
    key = norm(q)
    if key in cache:
        return cache[key]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": q,
        "format": "json",
        "limit": 1,
        "countrycodes": "br",
    })
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        if data:
            cache[key] = {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"]), "label": data[0].get("display_name", "")}
        else:
            cache[key] = None
    except Exception as e:
        cache[key] = {"error": str(e)}
    time.sleep(1.15)
    return cache[key]


def bairros_eq(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    aliases = {
        "DA GLORIA": "GLORIA",
        "GLORIA": "DA GLORIA",
        "DO SALTO": "SALTO",
        "SALTO": "DO SALTO",
        "VICTOR KONDER": "KONDER",
    }
    return aliases.get(na) == nb or aliases.get(nb) == na


def main():
    text = JSX.read_text(encoding="utf-8")
    catalog = parse_jsx_igrejas(text)
    dump_custom = []
    dump_coords = {}
    if DUMP.exists():
        dump = json.loads(DUMP.read_text(encoding="utf-8"))
        dump_custom = dump.get("igrejas_custom") or []
        dump_coords = dump.get("geo_coords_igrejas") or {}
        if isinstance(dump_custom, str):
            dump_custom = json.loads(dump_custom)
        if isinstance(dump_coords, str):
            dump_coords = json.loads(dump_coords)

    by_id = {c["id"]: c for c in catalog}
    for ig in dump_custom:
        if not isinstance(ig, dict) or ig.get("id") is None:
            continue
        iid = int(ig["id"])
        if iid in by_id:
            continue
        lat, lng = ig.get("lat"), ig.get("lng")
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            continue
        by_id[iid] = {
            "id": iid,
            "lat": lat,
            "lng": lng,
            "nome": ig.get("nome") or "",
            "setor": ig.get("setor") or "",
            "endereco": ig.get("endereco") or "",
            "fonte": "custom",
        }

    for k, v in dump_coords.items():
        try:
            iid = int(k)
            lat, lng = float(v["lat"]), float(v["lng"])
        except (TypeError, ValueError, KeyError):
            continue
        if iid in by_id:
            by_id[iid]["geo_dump_lat"] = lat
            by_id[iid]["geo_dump_lng"] = lng

    geo = json.loads(GEO.read_text(encoding="utf-8"))
    features = geo.get("features") or []

    cache_path = ROOT / "tmp-geocode-cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    rows = []
    to_geo = []
    for ig in by_id.values():
        lat, lng = ig["lat"], ig["lng"]
        if "geo_dump_lat" in ig:
            d = haversine_km((lat, lng), (ig["geo_dump_lat"], ig["geo_dump_lng"]))
            ig["km_catalogo_vs_dump"] = round(d, 3)
            if d > 0.25:
                lat, lng = ig["geo_dump_lat"], ig["geo_dump_lng"]
                ig["lat_usado"] = lat
                ig["lng_usado"] = lng
        bairro_gps = bairro_do_ponto(lat, lng, features)
        ig["bairro_gps"] = bairro_gps
        setor = ig.get("setor") or ""
        bairro_end = None
        end = str(ig.get("endereco") or "")
        parts = [p.strip() for p in re.split(r"\s[-–]\s|,", end) if p.strip()]
        for p in reversed(parts):
            pn = norm(p)
            if pn in ("BLUMENAU", "SC", "SANTA CATARINA", "BRASIL") or re.fullmatch(r"\d{5}\s?\d{3}", pn.replace(" ", "")):
                continue
            if len(pn) >= 4:
                bairro_end = p
                break
        ig["bairro_end"] = bairro_end
        ref = bairro_end or setor
        ig["bairro_ok"] = (not ref or ref in ("—", "-", "Todos") or not bairro_gps or bairros_eq(ref, bairro_gps) or bairros_eq(setor, bairro_gps))
        rua = extrair_rua(ig.get("endereco"))
        num = extrair_num(ig.get("endereco"))
        ig["rua"] = rua
        ig["num"] = num
        end_n = norm(ig.get("endereco"))
        if rua and num and ("BLUMENAU" in end_n or "GASPAR" in end_n or "INDAIAL" in end_n or ig.get("fonte") == "catalogo"):
            to_geo.append(ig)

    print(f"Igrejas: {len(by_id)}  |  para geocodificar: {len(to_geo)}")
    for i, ig in enumerate(to_geo, 1):
        end = ig.get("endereco") or ""
        q = f"{end}, Blumenau, Santa Catarina, Brasil" if "BLUMENAU" not in norm(end) else f"{end}, Brasil"
        print(f"  [{i}/{len(to_geo)}] {ig['id']} {ig['nome'][:40]}")
        g = geocode(q, cache)
        if i % 20 == 0:
            cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        if not g or g.get("error") or "lat" not in g:
            ig["geo_addr"] = None
            continue
        ig["geo_addr"] = g
        d = haversine_km((ig.get("lat_usado", ig["lat"]), ig.get("lng_usado", ig["lng"])), (g["lat"], g["lng"]))
        ig["km_vs_endereco"] = round(d, 3)

    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    graves = []
    bairro_err = []
    for ig in by_id.values():
        km = ig.get("km_vs_endereco")
        if km is not None and km >= 0.45:
            graves.append(ig)
        if ig.get("bairro_ok") is False and ig.get("bairro_gps"):
            bairro_err.append(ig)

    graves.sort(key=lambda x: -(x.get("km_vs_endereco") or 0))
    bairro_err.sort(key=lambda x: x.get("nome") or "")

    out = {
        "total": len(by_id),
        "geocodificadas": sum(1 for i in by_id.values() if i.get("km_vs_endereco") is not None),
        "pin_longe_do_endereco": [
            {
                "id": i["id"],
                "nome": i["nome"],
                "endereco": i["endereco"],
                "setor": i["setor"],
                "bairro_gps": i.get("bairro_gps"),
                "km": i.get("km_vs_endereco"),
                "fonte": i.get("fonte"),
                "pin": [i.get("lat_usado", i["lat"]), i.get("lng_usado", i["lng"])],
                "endereco_geo": [i["geo_addr"]["lat"], i["geo_addr"]["lng"]] if i.get("geo_addr") and "lat" in i["geo_addr"] else None,
            }
            for i in graves
        ],
        "bairro_diferente_do_gps": [
            {
                "id": i["id"],
                "nome": i["nome"],
                "endereco": i["endereco"],
                "setor": i["setor"],
                "bairro_gps": i.get("bairro_gps"),
                "km": i.get("km_vs_endereco"),
                "fonte": i.get("fonte"),
            }
            for i in bairro_err
        ],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nPin longe do endereco (>=450m): {len(graves)}")
    for i in graves[:40]:
        print(f"  {i['km_vs_endereco']:5.2f} km  #{i['id']}  {i['nome'][:42]}  |  {i['endereco'][:50]}  | gps={i.get('bairro_gps')} setor={i.get('setor')}")
    print(f"Bairro GPS != setor: {len(bairro_err)}")
    print("Salvo em", OUT)


if __name__ == "__main__":
    main()
