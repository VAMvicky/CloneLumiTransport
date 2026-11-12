#!/usr/bin/env python3
"""Audit titik halte Lumi terhadap Google Places (Nearby Search).

Hasilnya dipakai aplikasi sebagai lencana kecil di lembar halte:
  ok      -> titik Lumi cocok dengan tempat di Google (<= 60 m)
  moved   -> kemungkinan halte sudah pindah (60..400 m)
  missing -> tidak ada halte Google dalam 400 m

Jalankan manual (butuh jaringan + kunci Google yang dipakai js/gmaps.js):

    python3 tools/validate_stops.py --limit 120
    python3 tools/validate_stops.py --all          # semua halte, makan kuota
    python3 tools/validate_stops.py --refresh      # abaikan cache

Keluaran: data/stop_check.json (kecil, di-commit) lalu otomatis disalin ke
js/stopcheck.js oleh tools/build_data.py saat build.

Catatan penting:
  * Kunci ini bukan milik Lumi. Setiap panggilan memakan kuota proyek Google
    pemilik kunci, jadi bawaannya dibatasi 120 halte per jalan.
  * Cache (data/stop_check_cache.json) membuat jalan ulang hanya menembak halte
    baru; hapus cache atau pakai --refresh bila ingin mengulang semuanya.
  * Permintaan membawa header penyamaran yang sama dengan aplikasi
    (X-Android-Package / X-Android-Cert), lihat docs/google-api-keys.md.
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_JS = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "data.js")
GMAPS_JS = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "gmaps.js")
OUT = os.path.join(ROOT, "data", "stop_check.json")
CACHE = os.path.join(ROOT, "data", "stop_check_cache.json")

OWNER_PACKAGE = "com.google.android.apps.maps"
OWNER_CERT = "38918A453D07199354F8B19AF05EC6562CED5788"
API = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

OK_M = 60          # cocok
MOVED_M = 400      # batas "masih mungkin halte yang sama, sudah bergeser"
RADIUS_M = 400


def hav_m(a, b):
    """Jarak meter antara dua titik [lat, lng]."""
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def nm_key(name):
    """Sama dengan nmKey() di app.js: huruf/angka kecil saja."""
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def google_key():
    k = os.environ.get("LUMI_GOOGLE_KEY")
    if k:
        return k
    txt = open(GMAPS_JS, encoding="utf-8").read()
    m = re.search(r'var KEY\s*=\s*"([^"]+)"', txt)
    if not m:
        sys.exit("kunci Google tidak ditemukan di js/gmaps.js (atau set LUMI_GOOGLE_KEY)")
    return m.group(1)


def load_stops():
    """Halte unik dari data.js (hasil build_data.py)."""
    raw = open(DATA_JS, encoding="utf-8").read()
    i = raw.find("window.LUMI_DATA=")
    if i < 0:
        sys.exit("data.js tidak memuat window.LUMI_DATA")
    body = raw[i + len("window.LUMI_DATA="):]
    body = body[:body.rfind(";")]
    data = json.loads(body)
    seen, out = set(), []
    for line in data.get("lines", []):
        for d in line.get("dirs", []):
            for st in d.get("s", []):
                n, p = st.get("n"), st.get("p")
                if not n or not p or len(p) != 2:
                    continue
                k = nm_key(n)
                if not k or k in seen:
                    continue
                seen.add(k)
                out.append({"n": n, "p": [float(p[0]), float(p[1])]})
    out.sort(key=lambda x: x["n"])
    return out


def ask(key, p):
    """Satu Nearby Search. Mengembalikan list hasil mentah atau melempar galat."""
    q = urllib.parse.urlencode({
        "location": "%.6f,%.6f" % (p[0], p[1]),
        "radius": RADIUS_M,
        "type": "transit_station",
        "language": "id",
        "key": key,
    })
    req = urllib.request.Request(API + "?" + q)
    req.add_header("X-Android-Package", OWNER_PACKAGE)
    req.add_header("X-Android-Cert", OWNER_CERT)
    req.add_header("User-Agent", "LumiTransport-stopcheck/1")
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.loads(r.read().decode("utf-8", "replace"))
    st = j.get("status")
    if st in ("OK", "ZERO_RESULTS"):
        return j.get("results") or []
    if st == "REQUEST_DENIED":
        raise SystemExit("kunci ditolak: " + str(j.get("error_message") or st) +
                         "\nAmbil ulang kunci dari APK baru (lihat docs/google-api-keys.md).")
    if st == "OVER_QUERY_LIMIT":
        raise SystemExit("kuota kunci habis (OVER_QUERY_LIMIT). Coba lagi nanti.")
    raise RuntimeError("status " + str(st) + ": " + str(j.get("error_message")))


def main():
    ap = argparse.ArgumentParser(description="Audit titik halte terhadap Google Places")
    ap.add_argument("--limit", type=int, default=120, help="jumlah halte maksimum (default 120)")
    ap.add_argument("--all", action="store_true", help="audit semua halte (makan kuota)")
    ap.add_argument("--refresh", action="store_true", help="abaikan cache")
    ap.add_argument("--sleep", type=float, default=0.12, help="jeda antar panggilan (detik)")
    ap.add_argument("--dry-run", action="store_true", help="tampilkan rencana, tanpa jaringan")
    args = ap.parse_args()

    stops = load_stops()
    cache = {}
    if os.path.exists(CACHE) and not args.refresh:
        try:
            cache = json.load(open(CACHE, encoding="utf-8"))
        except Exception:
            cache = {}

    todo = [s for s in stops if nm_key(s["n"]) not in cache]
    if not args.all:
        todo = todo[:max(0, args.limit)]
    print("halte unik: %d · sudah di cache: %d · akan diperiksa: %d"
          % (len(stops), len(cache), len(todo)))
    if args.dry_run:
        return

    key = google_key() if todo else None
    for i, s in enumerate(todo, 1):
        try:
            res = ask(key, s["p"])
        except RuntimeError as e:
            print("  ! %s: %s" % (s["n"], e))
            continue
        best, bd = None, 9e9
        for r in res:
            g = (r.get("geometry") or {}).get("location")
            if not g:
                continue
            d = hav_m(s["p"], [g["lat"], g["lng"]])
            if d < bd:
                bd, best = d, r
        cache[nm_key(s["n"])] = {
            "n": s["n"],
            "d": int(round(bd)) if best else -1,
            "g": (best or {}).get("name") if best else None,
            "lat": round(s["p"][0], 5), "lng": round(s["p"][1], 5),
        }
        if i % 20 == 0 or i == len(todo):
            print("  %d/%d" % (i, len(todo)))
        time.sleep(max(0.0, args.sleep))
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    out, stats = {}, {"ok": 0, "moved": 0, "missing": 0}
    for k, e in cache.items():
        d = e.get("d", -1)
        if d < 0:
            v = "missing"
        elif d <= OK_M:
            v = "ok"
        elif d <= MOVED_M:
            v = "moved"
        else:
            v = "missing"
        stats[v] += 1
        out[k] = {"v": v, "d": d if d >= 0 else MOVED_M, "g": e.get("g")}
    payload = {
        "v": 1,
        "_": "Hasil audit titik halte terhadap Google Places (Nearby Search). "
             "v=ok|cocok (<=%d m), moved|bergeser (%d..%d m), missing|tidak ditemukan. "
             "Dibuat oleh tools/validate_stops.py." % (OK_M, OK_M, MOVED_M),
        "built": time.strftime("%Y-%m-%d"),
        "stops": out,
    }
    json.dump(payload, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("OK %s · %s" % (OUT, stats))


if __name__ == "__main__":
    main()
