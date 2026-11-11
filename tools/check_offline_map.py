"""Periksa paket peta offline sebelum diunggah: arsip PMTiles terbaca, petak Monas ada, gaya & huruf lengkap.
Pemakaian: python3 tools/check_offline_map.py <peta-jabodetabek.zip>   (butuh: pip install pmtiles)"""
import gzip, io, json, sys, zipfile
from pmtiles.reader import Reader, MemorySource
from pmtiles.tile import zxy_to_tileid

z = zipfile.ZipFile(sys.argv[1])
names = set(z.namelist())
need = {"tiles.pmtiles", "style.json", "sprites/ofm.json", "sprites/ofm.png", "sprites/ofm@2x.json", "sprites/ofm@2x.png"}
missing = need - names
if missing: sys.exit(f"isi kurang: {sorted(missing)}")
if not any(n.startswith("fonts/") and n.endswith("/0-255.pbf") for n in names): sys.exit("huruf 0-255 tidak ada")
style = json.loads(z.read("style.json"))
assert style["glyphs"].startswith("lumioff://") and style["sprite"].startswith("lumioff://"), "gaya belum diarahkan ke lumioff://"
assert all(l.get("source") in (None, "openmaptiles") for l in style["layers"]), "ada lapisan dengan sumber lain"
r = Reader(MemorySource(z.read("tiles.pmtiles")))
h = r.header()
assert h["max_zoom"] >= 14, h
# Monas z14: x=13053, y=8473
t = r.get(14, 13053, 8473)
assert t and len(t) > 100, "petak Monas z14 kosong"
print("ok:", len(names), "berkas; zoom", h["min_zoom"], "-", h["max_zoom"], "; petak Monas", len(t), "byte")
