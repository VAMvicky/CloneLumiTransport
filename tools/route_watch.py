#!/usr/bin/env python3
"""
Pemantau perubahan rute Transjakarta (dijalankan GitHub Actions tiap jam).

1. Unduh GTFS resmi Transjakarta.
2. Bila isinya berubah (SHA-256), susun ringkasan rute (format sama dengan GtfsImporter.java):
     R<TAB>kode<TAB>nama<TAB>jumlahPola     M<TAB>kode<TAB>arah<TAB>halte1|halte2|...
3. Bandingkan dengan ringkasan sebelumnya (data/route_index.txt) -> daftar perubahan.
4. Tulis data/route_changes.json (rev naik bila ada perubahan). Aplikasi membaca file ini tiap jam
   lewat raw.githubusercontent.com lalu memberi notifikasi.

Pakai:  python3 tools/route_watch.py [--zip file_gtfs.zip] [--data data]
"""
import argparse, csv, datetime, hashlib, io, json, os, sys, urllib.request, zipfile

GTFS_URL = "https://gtfs.transjakarta.co.id/files/file_gtfs.zip"
UA = "LumiTransportation-RouteWatch/2.0 (+https://github.com/VAMvicky/LumiTransport)"


def read_csv(z, name):
    with z.open(name) as f:
        text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
        for row in csv.DictReader(text):
            yield {k.strip(): (v or "").strip() for k, v in row.items() if k}


def build_index(zip_bytes):
    z = zipfile.ZipFile(io.BytesIO(zip_bytes))
    routes = {}
    for r in read_csv(z, "routes.txt"):
        routes[r["route_id"]] = (r.get("route_short_name", ""), r.get("route_long_name", ""))
    rep_by_key, rep_by_trip = {}, {}
    for t in read_csv(z, "trips.txt"):
        rid = t["route_id"]
        if rid not in routes:
            continue
        d = t.get("direction_id", "") or "0"
        shape = t.get("shape_id", "")
        key = (rid, d, shape or t.get("trip_headsign", ""))
        if key in rep_by_key:
            continue
        pt = {"rid": rid, "dir": d, "trip": t["trip_id"], "seq": []}
        rep_by_key[key] = pt
        rep_by_trip[t["trip_id"]] = pt
    names = {}
    for s in read_csv(z, "stops.txt"):
        try:
            float(s["stop_lat"]); float(s["stop_lon"])
        except (ValueError, KeyError):
            continue
        names[s["stop_id"]] = s.get("stop_name", "")
    for st in read_csv(z, "stop_times.txt"):
        pt = rep_by_trip.get(st["trip_id"])
        if pt is None or st["stop_id"] not in names:
            continue
        try:
            seq = int(st["stop_sequence"])
        except ValueError:
            seq = len(pt["seq"])
        pt["seq"].append((seq, names[st["stop_id"]]))
    # pola berbeda per rute; pola utama = halte terbanyak per rute+arah
    by_route, seen, best = {}, set(), {}
    for pt in rep_by_key.values():
        if len(pt["seq"]) < 2:
            continue
        pt["seq"].sort(key=lambda x: x[0])
        sig = pt["rid"] + "|" + ">".join(n for _, n in pt["seq"])
        if sig in seen:
            continue
        seen.add(sig)
        by_route.setdefault(pt["rid"], []).append(pt)
        k = (pt["rid"], pt["dir"])
        if k not in best or len(pt["seq"]) > len(best[k]["seq"]):
            best[k] = pt
    mains = {id(p) for p in best.values()}
    out = []
    for rid, pats in by_route.items():
        code, name = routes[rid]
        out.append("R\t%s\t%s\t%d" % (code, name.replace("\t", " "), len(pats)))
        for pt in pats:
            if id(pt) not in mains:
                continue
            stops, prev = [], None
            for _, n in pt["seq"]:
                n = n.replace("|", "/").replace("\t", " ")
                if n == prev:
                    continue
                prev = n
                stops.append(n)
            out.append("M\t%s\t%s\t%s" % (code, pt["dir"], "|".join(stops)))
    return "\n".join(out) + "\n"


def parse(idx):
    m = {}
    for line in (idx or "").split("\n"):
        f = line.split("\t")
        if len(f) < 4 or not f[1].strip():
            continue
        r = m.setdefault(f[1].strip(), {"name": "", "patterns": 0, "main": {}})
        if f[0] == "R":
            r["name"] = r["name"] or f[2]
            try:
                r["patterns"] += int(f[3])
            except ValueError:
                pass
        elif f[0] == "M":
            stops = [s for s in f[3].split("|") if s]
            prev = r["main"].get(f[2])
            if prev is None or len(stops) > len(prev):
                r["main"][f[2]] = stops
    return m


def lst(items, mx):
    items = list(items)
    s = ", ".join(items[:mx])
    return s + (" dll. (%d)" % len(items) if len(items) > mx else "")


def diff(old_idx, new_idx):
    a, b = parse(old_idx), parse(new_idx)
    out = []
    for code, nr in b.items():
        orr = a.get(code)
        if orr is None:
            out.append({"k": "add", "code": code, "name": nr["name"], "text": "Rute baru: " + nr["name"], "a": nr["main"]})
            continue
        old_s = list(dict.fromkeys(x for l in orr["main"].values() for x in l))
        new_s = list(dict.fromkeys(x for l in nr["main"].values() for x in l))
        added = [x for x in new_s if x not in old_s]
        removed = [x for x in old_s if x not in new_s]
        order = False
        if not added and not removed:
            order = any(orr["main"].get(d) is not None and orr["main"][d] != v for d, v in nr["main"].items())
        parts = []
        if orr["name"] and nr["name"] != orr["name"]:
            parts.append("Nama trayek: %s → %s" % (orr["name"], nr["name"]))
        if added:
            parts.append("Halte baru: " + lst(added, 4))
        if removed:
            parts.append("Tidak lagi lewat: " + lst(removed, 4))
        if order:
            parts.append("Urutan halte berubah")
        if nr["patterns"] != orr["patterns"] and not parts:
            parts.append("Pola perjalanan %s (%d → %d, mis. varian lewat tol)" % (
                "bertambah" if nr["patterns"] > orr["patterns"] else "berkurang", orr["patterns"], nr["patterns"]))
        if parts:
            it = {"k": "chg", "code": code, "name": nr["name"], "text": ". ".join(parts), "b": orr["main"], "a": nr["main"]}
            if orr["name"] and nr["name"] != orr["name"]:
                it["on"] = orr["name"]
            if added:
                it["add"] = added
            if removed:
                it["rm"] = removed
            out.append(it)
    for code, orr in a.items():
        if code not in b:
            out.append({"k": "del", "code": code, "name": orr["name"], "text": "Rute tidak ada lagi di data resmi", "b": orr["main"]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", help="pakai file GTFS lokal (untuk uji)")
    ap.add_argument("--data", default="data")
    ap.add_argument("--date", help="tanggal/jam (uji)")
    ap.add_argument("--save-zip", help="simpan GTFS yang diunduh ke file ini")
    a = ap.parse_args()
    os.makedirs(a.data, exist_ok=True)
    if a.zip:
        raw = open(a.zip, "rb").read()
    else:
        req = urllib.request.Request(GTFS_URL, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=180).read()
    if a.save_zip:
        open(a.save_zip, "wb").write(raw)
    sha = hashlib.sha256(raw).hexdigest()
    meta_p = os.path.join(a.data, "gtfs_meta.json")
    idx_p = os.path.join(a.data, "route_index.txt")
    chg_p = os.path.join(a.data, "route_changes.json")
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    now = a.date or datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%Y-%m-%d %H:%M")
    feed = json.load(open(chg_p)) if os.path.exists(chg_p) else {"rev": 0, "latest": None, "history": []}
    if meta.get("sha256") == sha:
        print("GTFS tidak berubah", sha[:12])     # tidak menulis apa pun → tidak ada commit
        return
    feed["checked"] = now
    new_idx = build_index(raw)
    old_idx = open(idx_p, encoding="utf-8").read() if os.path.exists(idx_p) else None
    items = diff(old_idx, new_idx) if old_idx else []
    if items:
        feed["rev"] = int(feed.get("rev", 0)) + 1
        feed["latest"] = {"date": now, "items": items}
        slim = [{k: v for k, v in x.items() if k not in ("a", "b")} for x in items]
        feed["history"] = ([{"date": now, "items": slim}] + feed.get("history", []))[:50]
        print("%d perubahan rute, rev %d" % (len(items), feed["rev"]))
    else:
        print("GTFS berubah tanpa perubahan rute" if old_idx else "Ringkasan rute pertama dibuat")
    open(idx_p, "w", encoding="utf-8").write(new_idx)
    json.dump({"sha256": sha, "bytes": len(raw), "updated": now, "routes": new_idx.count("\nR\t") + new_idx.startswith("R\t")},
              open(meta_p, "w"), indent=1)
    json.dump(feed, open(chg_p, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
