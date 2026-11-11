#!/usr/bin/env python3
"""Info aksesibilitas halte & stasiun dari OpenStreetMap → data/accessibility.json (v2.16).

Untuk tiap stasiun kereta (KRL/MRT/LRT/KA Bandara/Whoosh) dan halte BRT Transjakarta di data Lumi:
  - lift       : jumlah node highway=elevator dalam radius (stasiun 200 m, halte 80 m)
  - eskalator  : jumlah jalan highway=steps + conveying=* dalam radius yang sama
  - kursi roda : tag wheelchair=yes|limited|no dari stasiun/peron/halte OSM terdekat yang namanya cocok
Hanya titik yang punya info yang disimpan. Aplikasi memakai berkas ini (diambil dari repo) untuk
"Ramah kursi roda" di hasil rute dan info lift/eskalator di halte, stasiun, dan detail perjalanan.

Pemakaian:  python3 tools/osm_access.py            (butuh internet: Overpass)
            python3 tools/osm_access.py --check    (validasi berkas yang ada)
Gagal (Overpass mati) → keluar != 0, berkas lama dipertahankan.
"""
import datetime, importlib.util, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "data.js")
OUT = os.path.join(ROOT, "data", "accessibility.json")
RAIL = {"KRL", "MRT", "LRT", "LRTJ", "KABANDARA", "WHOOSH"}
WC = {"yes", "limited", "no"}

_spec = importlib.util.spec_from_file_location("osm_stops", os.path.join(ROOT, "tools", "osm_stops.py"))
osm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(osm)


def hav(a, b):
    return osm.hav(a, b)


def lumi_points():
    src = open(DATA_JS, encoding="utf-8").read()
    data = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))
    pts, seen = [], set()
    for l in data["lines"]:
        m = l.get("mode")
        if not (m in RAIL or (m == "TJ" and l.get("brt"))):
            continue
        for d in l.get("dirs", []):
            for s in d.get("s", []):
                if not s or not s.get("p"):
                    continue
                k = (s["n"], round(s["p"][0], 4), round(s["p"][1], 4))
                if k in seen:
                    continue
                seen.add(k)
                pts.append({"n": s["n"], "p": [round(s["p"][0], 6), round(s["p"][1], 6)], "m": m})
    return pts


def query():
    s, w, n, e = osm.BBOX
    bb = "(%f,%f,%f,%f)" % (s, w, n, e)
    q = ("[out:json][timeout:240];(" +
         'node["highway"="elevator"]%s;' % bb +
         'way["highway"="steps"]["conveying"]%s;' % bb +
         'node["wheelchair"]["railway"~"station|halt"]%s;' % bb +
         'way["wheelchair"]["railway"~"station|platform"]%s;' % bb +
         'node["wheelchair"]["public_transport"~"station|platform"]%s;' % bb +
         'way["wheelchair"]["public_transport"~"station|platform"]%s;' % bb +
         'node["wheelchair"]["highway"="bus_stop"]%s;' % bb +
         ");out center tags;")
    return osm.overpass_query(q)


def pos(el):
    if "lat" in el:
        return [el["lat"], el["lon"]]
    c = el.get("center")
    return [c["lat"], c["lon"]] if c else None


def build(points, els):
    lifts, escs, wcs = [], [], []
    for el in els:
        p = pos(el)
        if not p:
            continue
        t = el.get("tags", {})
        if t.get("highway") == "elevator":
            lifts.append(p)
        elif t.get("highway") == "steps" and t.get("conveying"):
            escs.append(p)
        if t.get("wheelchair") in WC and (t.get("railway") or t.get("public_transport") or t.get("highway") == "bus_stop"):
            wcs.append((p, osm.norm(t.get("name", "")), t["wheelchair"]))
    out = []
    for s in points:
        r = 200.0 if s["m"] in RAIL else 80.0
        nl = sum(1 for p in lifts if hav(s["p"], p) <= r)
        ne = sum(1 for p in escs if hav(s["p"], p) <= r)
        nk, wc, best = osm.norm(s["n"]), None, 1e9
        for p, name, v in wcs:
            d = hav(s["p"], p)
            if d > r * 1.5:
                continue
            same = bool(nk and name and (nk == name or nk in name or name in nk))
            score = d - (500 if same else 0)
            if (same or d <= r / 2) and score < best:
                best, wc = score, v
        if nl or ne or wc:
            e = {"n": s["n"], "p": s["p"], "m": s["m"]}
            if nl: e["lift"] = nl
            if ne: e["esc"] = ne
            if wc: e["wc"] = wc
            out.append(e)
    return out


def validate(doc):
    errs = []
    if not isinstance(doc, dict) or doc.get("v") != 1 or not isinstance(doc.get("stops"), list):
        return ["bentuk dasar: {v:1, stops:[...]}"]
    if len(doc["stops"]) > 5000:
        errs.append("terlalu banyak titik")
    for i, s in enumerate(doc["stops"]):
        p = s.get("p")
        if not s.get("n") or not isinstance(p, list) or len(p) != 2 or not (-7.2 < p[0] < -5.7 and 105.9 < p[1] < 107.6):
            errs.append("stops[%d]: nama/koordinat salah" % i)
        if s.get("wc") is not None and s["wc"] not in WC:
            errs.append("stops[%d]: wc harus yes|limited|no" % i)
        for k in ("lift", "esc"):
            if k in s and (not isinstance(s[k], int) or s[k] < 0 or s[k] > 99):
                errs.append("stops[%d]: %s salah" % (i, k))
    return errs


def main():
    if "--check" in sys.argv:
        errs = validate(json.load(open(OUT, encoding="utf-8")))
        for e in errs:
            print("GAGAL:", e, file=sys.stderr)
        print("accessibility.json:", "lulus" if not errs else "%d galat" % len(errs))
        sys.exit(1 if errs else 0)
    pts = lumi_points()
    stops = build(pts, query())
    doc = {"v": 1, "updated": datetime.date.today().isoformat(), "source": "OpenStreetMap (ODbL)", "stops": stops}
    errs = validate(doc)
    if errs or not stops:
        for e in errs[:20]:
            print("GAGAL:", e, file=sys.stderr)
        print("tidak ada data aksesibilitas; berkas lama dipertahankan", file=sys.stderr)
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    print("OK", len(stops), "titik dari", len(pts))


if __name__ == "__main__":
    main()
