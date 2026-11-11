"""Membuat berkas uji kecil untuk PmTilesTest (app/src/test/resources/fixture.pmtiles).

Petak z0–6. Isi tiap petak = gzip("z/x/y") sehingga uji bisa memastikan petak yang terbaca benar;
petak z6 dengan x genap berisi "laut" yang sama (deduplikasi → run length > 1). Butuh: pip install pmtiles
"""
import gzip, io, json, pathlib, sys
from pmtiles.tile import zxy_to_tileid, TileType, Compression
from pmtiles.writer import Writer

OUT = pathlib.Path(__file__).resolve().parent.parent / "app/src/test/resources/fixture.pmtiles"

def gz(s):
    b = io.BytesIO()
    with gzip.GzipFile(fileobj=b, mode="wb", mtime=0) as g: g.write(s.encode())
    return b.getvalue()

tiles = []
for z in range(0, 7):
    for x in range(1 << z):
        for y in range(1 << z):
            body = "laut" if z == 6 and x % 2 == 0 else f"{z}/{x}/{y}"
            tiles.append((zxy_to_tileid(z, x, y), gz(body)))
tiles.sort()
with open(OUT, "wb") as f:
    w = Writer(f)
    for tid, data in tiles: w.write_tile(tid, data)
    w.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.GZIP, "min_zoom": 0, "max_zoom": 6,
                "min_lon_e7": int(106.35e7), "min_lat_e7": int(-6.75e7), "max_lon_e7": int(107.2e7), "max_lat_e7": int(-5.95e7),
                "center_zoom": 3, "center_lon_e7": int(106.8e7), "center_lat_e7": int(-6.2e7)}, {"name": "uji"})
print(OUT, OUT.stat().st_size, "byte")
# Nilai acuan tileId untuk PmTilesTest
for z, x, y in [(0, 0, 0), (1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0), (2, 1, 3), (10, 813, 520), (14, 13044, 8333), (20, 834960, 533320)]:
    print(z, x, y, zxy_to_tileid(z, x, y))
