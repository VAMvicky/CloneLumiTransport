"""Membangun paket peta offline Jabodetabek untuk Lumi (v2.17).

Dipakai workflow .github/workflows/offline-map.yml. Langkah:
  1. tiles.pmtiles — Planetiler (skema OpenMapTiles) dari ekstrak OSM Pulau Jawa (Geofabrik),
     dipotong ke kotak Jabodetabek, zoom 0–14 (MapLibre memperbesar sendiri di atas 14).
  2. style.json — gaya OpenFreeMap "Liberty" (skema sama), sumber/huruf/sprite diarahkan ke "lumioff://"
     yang dilayani aplikasi dari berkas lokal (OfflineMap.java). Lapisan yang butuh sumber lain dibuang.
  3. fonts/ + sprites/ — glyph huruf Latin & sprite ikon dari OpenFreeMap.
  4. peta-jabodetabek.zip + peta-jabodetabek.json (ukuran + SHA-256, diperiksa aplikasi sebelum dipakai).

Pemakaian: python3 tools/build_offline_map.py <planetiler.jar> <folder-keluaran>
"""
import hashlib, json, os, pathlib, subprocess, sys, time, urllib.parse, urllib.request, zipfile

BBOX = [106.35, -6.75, 107.20, -5.95]          # barat, selatan, timur, utara
MAXZOOM = 14
OSM_URL = "https://download.geofabrik.de/asia/indonesia/java-latest.osm.pbf"
STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
RANGES = ["0-255", "256-511", "512-767", "768-1023", "8192-8447"]
UA = {"User-Agent": "LumiTransport-offline-map-builder (+https://github.com/VAMvicky/TransportBCK)"}


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1: raise
            print(f"  ulang {url}: {e}"); time.sleep(3 * (i + 1))


def fonts_in(style):
    out = set()
    def walk(v):
        if isinstance(v, list):
            if v and all(isinstance(x, str) for x in v) and any("Noto" in x or "Sans" in x or "Regular" in x or "Bold" in x for x in v):
                out.add(",".join(v))
            for x in v: walk(x)
        elif isinstance(v, dict):
            for x in v.values(): walk(x)
    for layer in style.get("layers", []):
        walk((layer.get("layout") or {}).get("text-font"))
    return out or {"Noto Sans Regular"}


def main():
    jar, out = sys.argv[1], pathlib.Path(sys.argv[2])
    pkg = out / "pkg"
    (pkg / "fonts").mkdir(parents=True, exist_ok=True)
    (pkg / "sprites").mkdir(parents=True, exist_ok=True)

    # 1. petak vektor
    tiles = pkg / "tiles.pmtiles"
    cmd = ["java", "-Xmx5g", "-jar", jar, "--download", f"--osm-url={OSM_URL}", f"--osm-path={out / 'java.osm.pbf'}",
           "--bounds=" + ",".join(map(str, BBOX)), f"--maxzoom={MAXZOOM}", f"--output={tiles}", "--force",
           f"--tmpdir={out / 'tmp'}", f"--download-dir={out / 'sources'}"]
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)

    # 2. gaya
    style = json.loads(get(STYLE_URL))
    src_name = "openmaptiles"
    attribution = (style.get("sources", {}).get(src_name) or {}).get("attribution") or \
        '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles Data from OpenStreetMap'
    sprite = style.get("sprite")
    if isinstance(sprite, list): sprite = sprite[0]["url"]
    style["sources"] = {src_name: {"type": "vector", "tiles": ["lumioff://t/{z}/{x}/{y}"], "minzoom": 0, "maxzoom": MAXZOOM,
                                   "bounds": BBOX, "attribution": attribution}}
    style["layers"] = [l for l in style["layers"] if l.get("type") == "background" or l.get("source") == src_name]
    style["glyphs"] = "lumioff://fonts/{fontstack}/{range}.pbf"
    style["sprite"] = "lumioff://sprites/ofm"
    style["center"] = [106.83, -6.2]; style["zoom"] = 11
    (pkg / "style.json").write_text(json.dumps(style, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # 3. huruf & sprite
    glyph_tpl = json.loads(get(STYLE_URL)).get("glyphs")
    for stack in sorted(fonts_in(style)):
        d = pkg / "fonts" / stack; d.mkdir(parents=True, exist_ok=True)
        for r in RANGES:
            url = glyph_tpl.replace("{fontstack}", urllib.parse.quote(stack)).replace("{range}", r)
            try: (d / f"{r}.pbf").write_bytes(get(url))
            except Exception as e: print(f"  huruf {stack} {r} dilewati: {e}")  # noqa: BLE001
    for suf in [".json", ".png", "@2x.json", "@2x.png"]:
        (pkg / "sprites" / f"ofm{suf}").write_bytes(get(sprite + suf))

    # 4. zip + manifest
    zpath = out / "peta-jabodetabek.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        z.write(tiles, "tiles.pmtiles", compress_type=zipfile.ZIP_STORED)    # petak sudah terkompresi
        for p in sorted(pkg.rglob("*")):
            if p.is_file() and p != tiles:
                z.write(p, p.relative_to(pkg).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    h = hashlib.sha256()
    with open(zpath, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    man = {"v": 1, "date": time.strftime("%Y-%m-%d", time.gmtime()), "bytes": zpath.stat().st_size, "sha256": h.hexdigest(),
           "bbox": BBOX, "maxzoom": MAXZOOM, "source": "OpenStreetMap (Geofabrik Java) · Planetiler · OpenFreeMap Liberty"}
    (out / "peta-jabodetabek.json").write_text(json.dumps(man, indent=1), encoding="utf-8")
    print(json.dumps(man, indent=1))
    print(f"tiles.pmtiles: {tiles.stat().st_size / 1048576:.1f} MB, zip: {man['bytes'] / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
