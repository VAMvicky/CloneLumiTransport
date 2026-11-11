#!/usr/bin/env python3
"""Jadwal pasti moda berjadwal (KRL / MRT / LRT / KA Bandara) → data/rail_schedule.json.

Aplikasi memakai berkas ini untuk waktu keberangkatan & lama perjalanan yang pasti pada ruas kereta
(lihat engine.js: schedTrip). Bila berkas kosong / tidak ada, aplikasi kembali ke perkiraan headway.

Sumber (boleh lebih dari satu, digabung):
  1. GTFS statis (stop_times.txt) — variabel lingkungan RAIL_GTFS, mis.
       RAIL_GTFS="MRT=https://contoh.id/mrt_gtfs.zip,LRTJ=/path/lrtj.zip"
     Setiap perjalanan (trip) dibaca urutan halte & jam berangkatnya dari stop_times.
  2. Jadwal KRL dari API komunitas Comuline (https://github.com/comuline/api) yang menyalin jadwal
     resmi KAI Commuter tiap hari — aktif bila COMULINE_API diisi (mis. https://www.api.comuline.com/v1).
     Jadwal per stasiun digabung per nomor KA menjadi urutan stasiun + jam.

Setiap perjalanan dicocokkan ke rute & arah Lumi (data.js) lewat nama stasiun yang dinormalkan:
urutan stasiun harus searah dengan data Lumi, minimal 2 stasiun cocok. Keluaran disusun per arah rute
Lumi: { n: jumlah stasiun, trips: [[label, [menit | null, ...]], ...] }.

Pemakaian:  python3 tools/rail_schedule.py            (tulis data/rail_schedule.json)
            python3 tools/rail_schedule.py --check    (hanya validasi berkas yang ada)
Keluar dengan kode != 0 bila tidak ada satu perjalanan pun yang cocok — berkas lama dipertahankan.
"""
import csv, datetime, io, json, os, re, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "data.js")
OUT = os.path.join(ROOT, "data", "rail_schedule.json")
UA = "LumiTransport-railschedule/1.0 (+https://github.com/VAMvicky/LumiTransport)"
RAIL_MODES = {"KRL", "MRT", "LRT", "LRTJ", "KABANDARA"}
WIB = datetime.timezone(datetime.timedelta(hours=7))

# Nama stasiun di sumber jadwal yang berbeda dari nama di data Lumi (sudah dinormalkan).
ALIAS = {
    "jakartakota": "jakartakota", "kota": "jakartakota",
    "univindonesia": "universitasindonesia", "ui": "universitasindonesia",
    "univpancasila": "universitaspancasila",
    "tanjungpriuk": "tanjungpriok",
    "kampungbandan": "kampungbandan", "kpbandan": "kampungbandan",
    "rawabuntubaru": "rawabuntu",
    "bandarasoekarnohatta": "bandarasoekarnohatta", "bst": "bandarasoekarnohatta",
    "sudirmanbaru": "bnicity", "duriberikut": "duri",
    "bekasitimur": "bekasitimur", "cikarang": "cikarang",
}


def norm(n):
    n = (n or "").lower()
    n = re.sub(r"\b(stasiun|station|st\.?|lrt|mrt|krl)\b", " ", n)
    n = re.sub(r"[^a-z0-9]", "", n)
    return ALIAS.get(n, n)


def load_lumi_lines():
    src = open(DATA_JS, encoding="utf-8").read()
    data = json.loads(src[src.index("=") + 1:].strip().rstrip(";"))
    return [l for l in data["lines"] if l.get("mode") in RAIL_MODES and l.get("dirs")]


def fetch(url, timeout=60):
    if os.path.exists(url):
        return open(url, "rb").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, */*"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def hhmm_to_min(t):
    """'07:12:00' / '25:03:00' (GTFS boleh > 24 jam) → menit."""
    p = (t or "").strip().split(":")
    if len(p) < 2 or not p[0].isdigit() or not p[1].isdigit():
        return None
    return int(p[0]) * 60 + int(p[1]) + (1 if len(p) > 2 and p[2].isdigit() and int(p[2]) >= 30 else 0)


# ---------------------------------------------------------------- sumber: GTFS statis
def trains_from_gtfs(blob, tag):
    z = zipfile.ZipFile(io.BytesIO(blob))
    def rows(name):
        with z.open(name) as f:
            return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))
    stops = {r["stop_id"]: r.get("stop_name", "") for r in rows("stops.txt")}
    trips = {r["trip_id"]: r for r in rows("trips.txt")}
    seq = {}
    for r in rows("stop_times.txt"):
        tid = r["trip_id"]
        m = hhmm_to_min(r.get("departure_time") or r.get("arrival_time"))
        if m is None:
            continue
        seq.setdefault(tid, []).append((int(r.get("stop_sequence") or 0), stops.get(r["stop_id"], r["stop_id"]), m))
    out = []
    for tid, st in seq.items():
        st.sort()
        label = (trips.get(tid, {}).get("trip_short_name") or tid)
        out.append({"label": "%s %s" % (tag, label) if tag else label, "stops": [(s[1], s[2]) for s in st]})
    return out


# ---------------------------------------------------------------- sumber: Comuline (KRL)
def iso_to_min(iso, day0):
    d = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(WIB)
    return int((d - day0).total_seconds() // 60)


def trains_from_comuline(base):
    base = base.rstrip("/")
    st = json.loads(fetch(base + "/station"))["data"]
    krl = [s for s in st if (s.get("type") or "KRL") == "KRL"]
    by_train = {}
    day0 = None
    for s in krl:
        try:
            sc = json.loads(fetch(base + "/schedule/" + s["id"]))["data"]
        except Exception as ex:                          # satu stasiun gagal: lanjut
            print("jadwal %s gagal: %s" % (s["id"], ex), file=sys.stderr)
            continue
        for r in sc:
            t = datetime.datetime.fromisoformat(r["departs_at"].replace("Z", "+00:00")).astimezone(WIB)
            if day0 is None:
                day0 = t.replace(hour=0, minute=0, second=0, microsecond=0)
            m = iso_to_min(r["departs_at"], day0)
            by_train.setdefault(r["train_id"], {"line": r.get("line", ""), "stops": []})["stops"].append((s["name"], m))
    out = []
    for tid, t in by_train.items():
        st = sorted(t["stops"], key=lambda x: x[1])
        # Kereta yang lewat tengah malam: jamnya harus terus naik.
        fixed, prev = [], None
        for name, m in st:
            if prev is not None and m < prev - 600:
                m += 1440
            fixed.append((name, m)); prev = m
        out.append({"label": "KA " + str(tid), "stops": fixed})
    return out


# ---------------------------------------------------------------- pencocokan ke rute Lumi
def match_train(train, lines):
    """Rute & arah Lumi terbaik untuk satu perjalanan: (line_id, dir_index, {idx: menit}) atau None."""
    tn = [(norm(n), m) for n, m in train["stops"]]
    best = None
    for l in lines:
        for di, d in enumerate(l["dirs"]):
            names = [norm(s["n"]) for s in d.get("s", [])]
            pos = {}
            for i, n in enumerate(names):
                pos.setdefault(n, i)
            hit, last_i, last_m = {}, -1, -1
            for n, m in tn:
                i = pos.get(n)
                if i is None or i <= last_i or m < last_m:
                    continue
                hit[i] = m; last_i, last_m = i, m
            if len(hit) >= 2 and (best is None or len(hit) > len(best[2])):
                best = (l["id"], di, hit, len(names))
    return best


def build(trains, lines):
    out, unmatched = {}, 0
    for t in trains:
        mt = match_train(t, lines)
        if not mt:
            unmatched += 1
            continue
        lid, di, hit, n = mt
        L = out.setdefault(lid, {"d": []})
        while len(L["d"]) <= di:
            L["d"].append(None)
        dd = L["d"][di] or {"n": n, "trips": []}
        L["d"][di] = dd
        dd["trips"].append([t["label"], [hit.get(i) for i in range(n)]])
    for L in out.values():
        for dd in L["d"]:
            if dd:
                dd["trips"].sort(key=lambda tr: next((x for x in tr[1] if x is not None), 0))
    return out, unmatched


def validate(doc, lines=None):
    errs = []
    if not isinstance(doc, dict) or doc.get("v") != 1 or not isinstance(doc.get("lines"), dict):
        return ["bentuk dasar salah (v=1, lines={})"]
    byid = {l["id"]: l for l in (lines or [])}
    for lid, L in doc["lines"].items():
        for di, dd in enumerate(L.get("d", [])):
            if dd is None:
                continue
            if lines is not None:
                l = byid.get(lid)
                if not l or di >= len(l["dirs"]) or len(l["dirs"][di]["s"]) != dd["n"]:
                    errs.append("%s arah %d: jumlah stasiun tidak cocok dengan data.js" % (lid, di))
            for tr in dd["trips"]:
                if len(tr[1]) != dd["n"]:
                    errs.append("%s arah %d: panjang jadwal %s salah" % (lid, di, tr[0]))
                    break
                prev = -1
                for x in tr[1]:
                    if x is None:
                        continue
                    if x < prev or x > 2 * 1440:
                        errs.append("%s arah %d: jam tidak berurutan di %s" % (lid, di, tr[0]))
                        break
                    prev = x
    return errs


def main():
    lines = load_lumi_lines()
    if "--check" in sys.argv:
        doc = json.load(open(OUT, encoding="utf-8"))
        errs = validate(doc, lines)
        for e in errs:
            print("GAGAL:", e, file=sys.stderr)
        n = sum(len(dd["trips"]) for L in doc["lines"].values() for dd in L["d"] if dd)
        print("rail_schedule.json:", n, "perjalanan,", len(errs), "galat")
        sys.exit(1 if errs else 0)

    trains, sources = [], []
    for item in filter(None, (os.environ.get("RAIL_GTFS") or "").split(",")):
        tag, _, url = item.partition("=")
        try:
            got = trains_from_gtfs(fetch(url.strip()), tag.strip())
            trains += got; sources.append("gtfs:" + tag.strip())
            print("GTFS", tag, len(got), "perjalanan")
        except Exception as ex:
            print("GTFS %s gagal: %s" % (tag, ex), file=sys.stderr)
    if os.environ.get("COMULINE_API"):
        try:
            got = trains_from_comuline(os.environ["COMULINE_API"])
            trains += got; sources.append("comuline")
            print("Comuline", len(got), "perjalanan KA")
        except Exception as ex:
            print("Comuline gagal: %s" % ex, file=sys.stderr)

    built, unmatched = build(trains, lines)
    total = sum(len(dd["trips"]) for L in built.values() for dd in L["d"] if dd)
    if not total:
        print("Tidak ada perjalanan yang cocok dengan rute Lumi; data/rail_schedule.json lama dipertahankan.", file=sys.stderr)
        sys.exit(1)
    doc = {"v": 1, "updated": datetime.datetime.now(WIB).strftime("%Y-%m-%d"), "sources": sources, "lines": built}
    errs = validate(doc, lines)
    if errs:
        for e in errs[:20]:
            print("GAGAL:", e, file=sys.stderr)
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    print("OK", OUT, total, "perjalanan,", unmatched, "tidak cocok,", os.path.getsize(OUT), "byte")


if __name__ == "__main__":
    main()
