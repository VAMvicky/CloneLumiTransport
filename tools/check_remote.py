#!/usr/bin/env python3
"""Periksa berkas data jarak jauh sebelum di-commit/dirilis (dipakai CI):
  data/remote_config.json, data/disruptions.json
Aturan di sini SAMA dengan pemeriksaan di aplikasi (app.js: validRemoteCfg / validDisruptions) —
berkas yang gagal di sini juga akan diabaikan aplikasi.
   python3 tools/check_remote.py [berkas_gangguan.json]"""
import datetime, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
VER = re.compile(r"^\d{1,3}(\.\d{1,4}){1,3}$")
HTTPS = re.compile(r"^https://[A-Za-z0-9.-]+(:\d+)?(/[^\s\"'<>]*)?$")
MODES = {"TJ", "MIKRO", "ROYAL", "KRL", "MRT", "LRT", "LRTJ", "KABANDARA", "WHOOSH"}
SEV = {"info", "warn", "severe"}
errs = []


def err(f, m):
    errs.append("%s: %s" % (f, m))


def check_cfg(path):
    c = json.load(open(path, encoding="utf-8"))
    f = os.path.basename(path)
    if c.get("v") != 1:
        err(f, "v harus 1")
    if "tjClientVersion" in c and not VER.match(str(c["tjClientVersion"])):
        err(f, "tjClientVersion tidak valid")
    if "disruptions" in c and not re.match(r"^[a-z0-9_.-]+\.json$", str(c["disruptions"])):
        err(f, "disruptions harus nama berkas .json di folder data/")

def parse_time(s):
    return datetime.datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def check_disruptions(path):
    d = json.load(open(path, encoding="utf-8"))
    f = os.path.basename(path)
    if d.get("v") != 1 or not isinstance(d.get("items"), list):
        err(f, "bentuk dasar: {v:1, items:[...]}")
        return
    if len(d["items"]) > 60:
        err(f, "maks. 60 item")
    ids = set()
    for i, x in enumerate(d["items"]):
        w = "items[%d]" % i
        if not isinstance(x, dict):
            err(f, w + " harus objek"); continue
        if not re.match(r"^[A-Za-z0-9_.:-]{1,64}$", str(x.get("id", ""))):
            err(f, w + ".id wajib (huruf/angka, maks. 64)")
        if x.get("id") in ids:
            err(f, w + ".id ganda")
        ids.add(x.get("id"))
        if x.get("mode") is not None and x["mode"] not in MODES:
            err(f, w + ".mode tidak dikenal")
        if not isinstance(x.get("lines", []), list) or len(x.get("lines", [])) > 40:
            err(f, w + ".lines harus daftar kode rute (maks. 40)")
        if not x.get("mode") and not x.get("lines"):
            err(f, w + ": isi mode atau lines")
        if x.get("severity", "warn") not in SEV:
            err(f, w + ".severity: info|warn|severe")
        for k in ("title", "text"):
            v = x.get(k)
            if isinstance(v, str):
                v = {"id": v}
            if not isinstance(v, dict) or not str(v.get("id", "")).strip():
                err(f, w + ".%s wajib (teks Indonesia; boleh {id, en})" % k)
            elif any(len(str(t)) > (120 if k == "title" else 600) for t in v.values()):
                err(f, w + ".%s terlalu panjang" % k)
        try:
            a = parse_time(x["from"]) if x.get("from") else None
            b = parse_time(x["until"]) if x.get("until") else None
            if a and b and b <= a:
                err(f, w + ": until harus setelah from")
            if (a and not a.tzinfo) or (b and not b.tzinfo):
                err(f, w + ": tulis zona waktu, mis. 2026-11-11T05:00+07:00")
        except Exception:
            err(f, w + ": from/until bukan waktu ISO 8601")
        if x.get("url") and not HTTPS.match(str(x["url"])):
            err(f, w + ".url harus https")


def main():
    targets = sys.argv[1:]
    if targets:
        for t in targets:
            check_disruptions(t)
    else:
        check_cfg(os.path.join(D, "remote_config.json"))
        check_disruptions(os.path.join(D, "disruptions.json"))
    for e in errs:
        print("GAGAL:", e, file=sys.stderr)
    print("check_remote:", "lulus" if not errs else "%d galat" % len(errs))
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
