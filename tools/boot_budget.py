#!/usr/bin/env python3
"""Anggaran waktu boot: halaman harus siap di bawah ambang (dipakai CI).

GTFS bawaan (±4 MB) dimuat setelah layar pertama; kalau ada yang memindahkannya
kembali ke jalur boot, langkah ini gagal.
"""
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / "app/src/main/assets/www/index.html").as_uri()
BUDGET_MS = 1500
GRAPH_BUDGET_MS = 2500

MEASURE = """() => {
  const t = performance.timing;
  return { dcl: t.domContentLoadedEventEnd - t.navigationStart };
}"""

GRAPH = """() => window.__lumiGtfsReady ? window.__lumiGtfsReady.then(() => true) : true"""


def main():
    with sync_playwright() as p:
        # CI memakai Chrome bawaan runner (sama seperti ui_check), bukan chromium unduhan.
        try:
            b = p.chromium.launch(channel="chrome", args=["--allow-file-access-from-files"])
        except Exception:
            b = p.chromium.launch(args=["--allow-file-access-from-files"])
        pg = b.new_page()
        pg.goto(PAGE, wait_until="load")
        pg.wait_for_timeout(200)
        ms = pg.evaluate(MEASURE)["dcl"]
        t0 = time.time()
        pg.evaluate(GRAPH)
        graph_ms = int((time.time() - t0) * 1000)
        b.close()
    print("boot domContentLoaded: %d ms (anggaran %d ms)" % (ms, BUDGET_MS))
    print("graf rute siap: %d ms (anggaran %d ms)" % (graph_ms, GRAPH_BUDGET_MS))
    if ms > BUDGET_MS or graph_ms > GRAPH_BUDGET_MS:
        print("GAGAL: melewati anggaran", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
