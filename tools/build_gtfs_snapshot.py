#!/usr/bin/env python3
"""Simpan ringkasan GTFS resmi Transjakarta ke data-raw, khusus Mikrotrans & Angkutan Umum Integrasi.

Kenapa ada:
  `data-raw/tj_gtfs_2021/` adalah salinan 2021. Untuk Mikrotrans itu sudah jauh: nama halte,
  urutan halte, dan sebagian rutenya berubah. Aplikasi memang mengunduh GTFS resmi saat berjalan,
  tetapi sebelum unduhan pertama selesai, pengguna baru melihat data 2021 — halte yang tidak ada
  lagi, atau halte yang belum ada.

  Berkas ini membuat data.js membawa Mikrotrans versi resmi terbaru, jadi benar sejak detik
  pertama aplikasi dipasang, tanpa menunggu internet.

Ukuran: hanya rute Mikrotrans/Angkutan Umum Integrasi, halte + garis yang disederhanakan (±40 m).
Sekitar 1–2 MB, dan itu memang disengaja: akurasi lebih penting daripada ukuran APK.

Pakai:
  python3 tools/build_gtfs_snapshot.py            # unduh GTFS resmi, tulis data-raw/tj_gtfs_2026_mikro.json
  python3 tools/build_gtfs_snapshot.py --zip x.zip
"""
import argparse, csv, io, json, math, os, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data-raw", "tj_gtfs_2026_mikro.json")
GTFS_URL = "https://gtfs.transjakarta.co.id/files/file_gtfs.zip"
UA = "LumiTransportation-GTFS-Snapshot/1.0 (+https://github.com/VAMvicky/CloneLumiTransport)"
WANTED = {"Mikrotrans", "Angkutan Umum Integrasi"}
STEP_M = 40          # jarak antar titik garis setelah disederhanakan


def rows(z, name):
    with z.open(name) as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline="")):
            yield {(k or "").strip(): (v or "").strip() for k, v in r.items() if k}


def hav_km(a, b):
    r = math.pi / 180
    dla, dlo = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    h = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def simplify(pts, step_m=STEP_M):
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for p in pts[1:-1]:
        if hav_km(out[-1], p) * 1000 >= step_m:
            out.append(p)
    out.append(pts[-1])
    return out


def norm_code(c):
    return (c or "").strip().upper().replace(".", "").replace("-", "").replace(" ", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()

    if a.zip:
        raw = open(a.zip, "rb").read()
    else:
        req = urllib.request.Request(GTFS_URL, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=180).read()
    z = zipfile.ZipFile(io.BytesIO(raw))
    print("GTFS %.2f MB" % (len(raw) / 1048576.0))

    routes = {r["route_id"]: r for r in rows(z, "routes.txt") if r.get("route_desc") in WANTED}
    print("rute Mikrotrans/Angkutan Umum Integrasi:", len(routes))

    stops = {}
    for s in rows(z, "stops.txt"):
        try:
            stops[s["stop_id"]] = (float(s["stop_lat"]), float(s["stop_lon"]), s.get("stop_name", ""))
        except (KeyError, ValueError):
            continue
    print("halte:", len(stops))

    shapes = {}
    for s in rows(z, "shapes.txt"):
        sid = s.get("shape_id")
        if not sid:
            continue
        try:
            shapes.setdefault(sid, []).append((int(s["shape_pt_sequence"]), float(s["shape_pt_lat"]), float(s["shape_pt_lon"])))
        except (KeyError, ValueError):
            continue
    for sid in shapes:
        shapes[sid].sort()
        shapes[sid] = [[la, lo] for _, la, lo in shapes[sid]]
    print("shape:", len(shapes))

    # stop_times dikelompokkan per trip
    st = {}
    for t in rows(z, "stop_times.txt"):
        tid = t.get("trip_id")
        if not tid:
            continue
        try:
            seq = int(t.get("stop_sequence") or 0)
        except ValueError:
            continue
        st.setdefault(tid, []).append((seq, t.get("stop_id")))
    for tid in st:
        st[tid].sort()

    # pilih satu trip terbaik per (rute, arah)
    best = {}
    for t in rows(z, "trips.txt"):
        rid = t.get("route_id")
        if rid not in routes:
            continue
        tid = t.get("trip_id")
        seq = st.get(tid) or []
        if len(seq) < 2:
            continue
        d = t.get("direction_id") or "0"
        key = (rid, d)
        if key not in best or len(seq) > len(best[key][1]):
            best[key] = (t, seq)

    out = {}
    for (rid, d), (t, seq) in sorted(best.items()):
        r = routes[rid]
        code = norm_code(r.get("route_short_name") or rid)
        stops_list = []
        for _, sid in seq:
            p = stops.get(sid)
            if not p:
                continue
            stops_list.append([round(p[0], 5), round(p[1], 5), p[2]])
        if len(stops_list) < 2:
            continue
        shape = shapes.get(t.get("shape_id")) or []
        ent = out.setdefault(code, {"name": r.get("route_long_name", ""), "dirs": []})
        ent["dirs"].append({
            "d": d,
            "h": t.get("trip_headsign", ""),
            "s": stops_list,
            "shape": simplify(shape) if len(shape) > 2 else None,
        })

    doc = {
        "v": 1,
        "_": "Ringkasan GTFS resmi Transjakarta (Mikrotrans + Angkutan Umum Integrasi): halte berurutan "
             "dan garis yang disederhanakan ±40 m. Dipakai tools/build_data.py supaya data.js benar "
             "sejak pemasangan pertama. Dibuat tools/build_gtfs_snapshot.py.",
        "routes": out,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    mb = os.path.getsize(a.out) / 1048576.0
    print("OK", a.out, "%.2f MB" % mb, len(out), "rute,",
          sum(len(v["dirs"]) for v in out.values()), "arah")


if __name__ == "__main__":
    main()
