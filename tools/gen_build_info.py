#!/usr/bin/env python3
"""Tulis app/src/main/assets/www/js/build.js dari sumber versi tunggal:
  - versi aplikasi  : release-notes/CURRENT          (sama dengan versionName di app/build.gradle)
  - versi klien TJ  : gradle.properties lumi.tjClientVersion (sama dengan BuildConfig.TJ_CLIENT_VERSION)
Dipanggil otomatis oleh Gradle (tugas buildInfo) sebelum build. Jangan edit build.js manual."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ver = open(os.path.join(ROOT, "release-notes", "CURRENT")).read().strip().lstrip("v")
if not re.match(r"^\d+(\.\d+){0,2}$", ver):
    sys.exit("versi tidak valid di release-notes/CURRENT: %r" % ver)
tj = None
for line in open(os.path.join(ROOT, "gradle.properties"), encoding="utf-8"):
    m = re.match(r"\s*lumi\.tjClientVersion\s*=\s*(\S+)", line)
    if m: tj = m.group(1)
if not tj or not re.match(r"^\d+(\.\d+){1,3}$", tj):
    sys.exit("lumi.tjClientVersion tidak ada / tidak valid di gradle.properties")
out = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "build.js")
body = ("/* Dibuat otomatis oleh tools/gen_build_info.py — jangan diedit manual. */\n"
        "window.LUMI_BUILD=" + json.dumps({"version": ver, "tjClientVersion": tj}, separators=(",", ":")) + ";\n")
old = open(out).read() if os.path.exists(out) else None
if old != body:
    open(out, "w").write(body)
print("build.js:", ver, "TJ", tj)
