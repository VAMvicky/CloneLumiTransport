#!/usr/bin/env python3
"""Uji tools/osm_access.py dengan elemen OSM tiruan di sekitar stasiun & halte Lumi asli."""
import importlib.util, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("oa", os.path.join(HERE, "osm_access.py"))
oa = importlib.util.module_from_spec(spec); spec.loader.exec_module(oa)
fails = 0
def check(ok, m):
    global fails
    print(("ok: " if ok else "GAGAL: ") + m); fails += 0 if ok else 1
pts = oa.lumi_points()
mrt = [p for p in pts if p["m"] == "MRT"][0]
halte = [p for p in pts if p["m"] == "TJ"][0]
off = lambda p, dm: [p[0] + dm / 111320.0, p[1]]
els = [
    {"type": "node", "lat": off(mrt["p"], 60)[0], "lon": mrt["p"][1], "tags": {"highway": "elevator"}},
    {"type": "node", "lat": off(mrt["p"], -90)[0], "lon": mrt["p"][1], "tags": {"highway": "elevator"}},
    {"type": "way", "center": {"lat": off(mrt["p"], 40)[0], "lon": mrt["p"][1]}, "tags": {"highway": "steps", "conveying": "forward"}},
    {"type": "node", "lat": off(mrt["p"], 900)[0], "lon": mrt["p"][1], "tags": {"highway": "elevator"}},          # terlalu jauh
    {"type": "node", "lat": mrt["p"][0], "lon": mrt["p"][1], "tags": {"railway": "station", "name": "Stasiun " + mrt["n"], "wheelchair": "yes"}},
    {"type": "node", "lat": off(halte["p"], 20)[0], "lon": halte["p"][1], "tags": {"highway": "bus_stop", "name": halte["n"], "wheelchair": "limited"}},
]
out = oa.build(pts, els)
m = [x for x in out if x["n"] == mrt["n"] and x["m"] == "MRT"]
check(m and m[0].get("lift") == 2 and m[0].get("esc") == 1 and m[0].get("wc") == "yes", "stasiun MRT: 2 lift, 1 eskalator, kursi roda ya (%s)" % (m[:1],))
h = [x for x in out if x["n"] == halte["n"] and x["m"] == "TJ"]
check(h and h[0].get("wc") == "limited" and "lift" not in h[0], "halte BRT: kursi roda terbatas (%s)" % (h[:1],))
check(len(out) <= 4, "titik tanpa info tidak disimpan (%d)" % len(out))
doc = {"v": 1, "stops": out}
check(not oa.validate(doc), "validasi lolos")
check(oa.validate({"v": 1, "stops": [{"n": "x", "p": [0, 0]}]}), "koordinat di luar Jabodetabek ditolak")
if fails: sys.exit(1)
print("Semua uji aksesibilitas lulus")
