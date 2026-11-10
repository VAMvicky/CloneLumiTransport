#!/usr/bin/env python3
"""
Selaraskan titik halte/stasiun Lumi dengan OpenStreetMap (peta yang dilihat pengguna).

Masukan : data Lumi bawaan dengan koordinat ASLI (dibangun ulang lewat tools/build_data.py, LUMI_RAW_OUT)
          + GTFS resmi ringkas (tj_gtfs.json, opsional)
Sumber  : Overpass API (halte bus, halte Transjakarta, stasiun KRL/MRT/LRT/KA Bandara/Whoosh) di Jabodetabek
Keluaran: data/stop_fix.json  {"v":1,"date":..,"fix":{"<nama>|<lat4>,<lon4>":[lat,lon], ...}}
          data/stop_fix_report.txt (ringkasan + perpindahan terbesar)

Aturan pencocokan:
  - nama dinormalkan (tanpa "Halte", "Stasiun", "LRT", "MRT", tanda baca, dst.) harus sama persis
    dengan salah satu nama OSM (name, name:id, alt_name, official_name, short_name);
  - jenis harus cocok (stasiun kereta ↔ fitur kereta; halte bus ↔ fitur bus);
  - dipilih fitur OSM terdekat dalam radius (bus 450 m, kereta 900 m);
  - hanya disimpan bila bergeser > 20 m.
"""
import json, math, re, sys, urllib.request, urllib.parse, datetime, os

BBOX = (-6.80, 106.35, -5.95, 107.25)   # selatan, barat, utara, timur (Jabodetabek)
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = "LumiTransportation-stopfix/1.0 (+https://github.com/VAMvicky/LumiTransport)"
RAIL_MODES = {"KRL", "MRT", "LRT", "LRTJ", "KABANDARA", "WHOOSH"}
# Nama di data Lumi yang berbeda dengan nama di OSM
ALIAS = {"tmii": ["taman mini", "taman mini indonesia indah"], "bni city": ["sudirman baru"],
         "dukuh atas": ["dukuh atas bni"], "pancoran": ["pancoran bank bjb"]}

def hav(a, b):
    R, r = 6371000.0, math.pi / 180
    dla, dlo = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    h = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

STOP_WORDS = r"\b(halte|stasiun|station|stop|lrt|mrt|krl|brt|transjakarta|tj|jaklingko|mikrotrans|bus|busway|commuter line|jabodebek|whoosh|ka bandara|railink)\b"
def norm(n):
    n = (n or "").lower().replace("&", " dan ")
    n = re.sub(r"[()\[\].,'’`\-/]", " ", n)
    n = re.sub(STOP_WORDS, " ", n)
    return re.sub(r"\s+", " ", n).strip()

def overpass():
    s, w, n, e = BBOX
    bb = "(%f,%f,%f,%f)" % (s, w, n, e)
    q = ("[out:json][timeout:240];(" +
         'node["highway"="bus_stop"]%s;' % bb +
         'node["public_transport"~"platform|stop_position|station"]%s;' % bb +
         'way["public_transport"~"platform|station"]%s;' % bb +
         'node["railway"~"station|halt"]%s;' % bb +
         'way["railway"~"station|platform"]%s;' % bb +
         'way["building"="train_station"]%s;' % bb +
         ");out center tags;")
    last = None
    import time
    for url in OVERPASS * 3:                     # server Overpass kadang sibuk / membatasi: coba lagi
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
            return json.load(urllib.request.urlopen(req, timeout=300))["elements"]
        except Exception as ex:
            last = ex
            print("overpass gagal:", url, ex, file=sys.stderr)
            time.sleep(45)
    raise last

# Jenis kereta yang diharapkan per moda Lumi, dan cara mengenalinya di OSM.
RAIL_WANT = {"KRL": "train", "KABANDARA": "train", "WHOOSH": "train", "MRT": "subway", "LRT": "light_rail", "LRTJ": "light_rail"}
def rail_types(t):
    out = set()
    st, net = t.get("station", ""), (t.get("network", "") + " " + t.get("operator", "") + " " + t.get("name", "")).lower()
    if t.get("subway") == "yes" or st == "subway" or "mrt" in net: out.add("subway")
    if t.get("light_rail") == "yes" or st == "light_rail" or "lrt" in net: out.add("light_rail")
    if t.get("train") == "yes" or st == "train" or "krl" in net or "commuter" in net or "kai" in net or "kcic" in net: out.add("train")
    return out

def kind_of(t):
    rail = t.get("railway") in ("station", "halt", "platform") or t.get("train") == "yes" or t.get("subway") == "yes" \
        or t.get("light_rail") == "yes" or t.get("monorail") == "yes" or t.get("building") == "train_station" \
        or t.get("station") in ("subway", "light_rail", "train")
    bus = t.get("highway") == "bus_stop" or t.get("bus") == "yes" or t.get("amenity") == "bus_station" \
        or "transjakarta" in (t.get("network", "") + t.get("operator", "") + t.get("name", "")).lower()
    if rail and not bus: return "rail"
    if bus and not rail: return "bus"
    return "any"

def load_lumi(path):
    s = open(path, encoding="utf-8").read()
    i = s.index("window.LUMI_DATA=") + len("window.LUMI_DATA=")
    return json.loads(s[i:].rstrip().rstrip(";"))

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    # Titik ASLI (tanpa koreksi OSM yang sudah dipakai di data.js), supaya hasilnya stabil antar-run.
    import subprocess, tempfile
    raw = os.path.join(tempfile.mkdtemp(), "data-raw.js")
    subprocess.run([sys.executable, os.path.join(root, "tools/build_data.py")], check=True,
                   env=dict(os.environ, LUMI_RAW_OUT=raw), stdout=subprocess.DEVNULL)
    data = load_lumi(raw)
    stops = {}   # key -> (name, p, rail, jenis kereta yang diharapkan)
    def add(name, p, rail, want=None):
        k = "%s|%.4f,%.4f" % (name, p[0], p[1])
        stops[k] = (name, p, rail, want)
    for l in data["lines"]:
        rail = l.get("mode") in RAIL_MODES
        for d in l.get("dirs", []):
            for st in d.get("s", []): add(st["n"], st["p"], rail, RAIL_WANT.get(l.get("mode")))
    gpath = os.path.join(root, "tj_gtfs.json")
    if os.path.exists(gpath):
        g = json.load(open(gpath, encoding="utf-8"))
        for l in g.get("lines", []):
            for d in l.get("dirs", []):
                for st in d.get("s", []): add(st["n"], st["p"], False)
    print("stop Lumi unik:", len(stops))

    els = overpass()
    print("fitur OSM:", len(els))
    idx = {}
    for e in els:
        t = e.get("tags", {})
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None: continue
        names = set()
        # Hanya nama utama (nama lama/alternatif sering milik halte lain atau sebelum ganti nama).
        for k in ("name", "name:id"):
            for v in str(t.get(k, "")).split(";"):
                if v.strip(): names.add(norm(v))
        kd = kind_of(t)
        rt = rail_types(t) if kd == "rail" else set()
        for n in names:
            if n: idx.setdefault(n, []).append((lat, lon, kd, t.get("name", ""), rt))

    fix, moves, unmatched = {}, [], 0
    for k, (name, p, rail, rwant) in stops.items():
        keys = [norm(name)] + ALIAS.get(norm(name), [])
        best, bd = None, None
        lim = 900 if rail else 250
        want = "rail" if rail else "bus"
        cands = []
        for nk in keys:
            for (lat, lon, kd, oname, rt) in idx.get(nk, []):
                if kd != want: continue                      # jenis harus sama persis (bukan "any")
                d = hav(p, (lat, lon))
                if d <= lim: cands.append((d, lat, lon, oname, rt))
        if rail and rwant:
            # Stasiun: utamakan jenis yang sama (MRT ↔ subway, LRT ↔ light_rail, KRL ↔ train);
            # fitur tanpa keterangan jenis hanya dipakai bila tidak ada yang cocok jenisnya.
            same = [c for c in cands if rwant in c[4]]
            other = [c for c in cands if c[4] and rwant not in c[4]]
            generic = [c for c in cands if not c[4]]
            cands = same or generic
            if not same and other: cands = [c for c in generic if all(hav((c[1], c[2]), (o[1], o[2])) > 150 for o in other)]
        cands = [c[:4] for c in cands]
        if not cands: unmatched += 1; continue
        cands.sort()
        bd, best = cands[0][0], cands[0][1:]
        # Ambigu: ada fitur senama lain yang hampir sama dekat tapi letaknya berjauhan → jangan digeser.
        amb = [c for c in cands[1:] if c[0] < bd + 60 and hav((best[0], best[1]), (c[1], c[2])) > 120]
        if amb: unmatched += 1; continue
        if bd > 20:
            # Format: nama -> [[lat asal, lon asal, lat OSM, lon OSM], ...]; aplikasi mencocokkan nama + jarak ≤80 m
            # dari titik asal, jadi tetap berlaku bila GTFS harian sedikit berbeda.
            e = [round(p[0], 5), round(p[1], 5), round(best[0], 6), round(best[1], 6)]
            lst = fix.setdefault(name, [])
            if e not in lst: lst.append(e)
            moves.append((bd, name, "kereta" if rail else "bus", p, best))
    moves.sort(reverse=True)
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%Y-%m-%d %H:%M")
    os.makedirs(os.path.join(root, "data"), exist_ok=True)
    json.dump({"v": 2, "date": now, "count": sum(len(v) for v in fix.values()), "fix": fix}, open(os.path.join(root, "data/stop_fix.json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(root, "data/stop_fix_report.txt"), "w", encoding="utf-8") as f:
        f.write("tanggal %s\nstop Lumi %d · cocok OSM %d · digeser >20 m %d · tidak cocok %d\n\n" %
                (now, len(stops), len(stops) - unmatched, sum(len(v) for v in fix.values()), unmatched))
        for bd, name, jenis, p, b in moves[:120]:
            f.write("%5.0f m  %-6s %-40s %.5f,%.5f -> %.5f,%.5f (OSM: %s)\n" % (bd, jenis, name[:40], p[0], p[1], b[0], b[1], b[2]))
    print(open(os.path.join(root, "data/stop_fix_report.txt"), encoding="utf-8").read()[:3000])

if __name__ == "__main__":
    main()
