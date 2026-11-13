#!/usr/bin/env python3
"""Anggaran waktu boot: halaman harus siap di bawah ambang (dipakai CI).

GTFS bawaan (±4 MB) dimuat setelah layar pertama; kalau ada yang memindahkannya
kembali ke jalur boot, langkah ini gagal.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / "app/src/main/assets/www/index.html").as_uri()
BUDGET_MS = 1500

MEASURE = """() => {
  const t = performance.timing;
  return t.domContentLoadedEventEnd - t.navigationStart;
}"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--allow-file-access-from-files"])
        pg = b.new_page()
        pg.goto(PAGE, wait_until="load")
        pg.wait_for_timeout(200)
        ms = pg.evaluate(MEASURE)
        b.close()
    print("boot domContentLoaded: %d ms (anggaran %d ms)" % (ms, BUDGET_MS))
    if ms > BUDGET_MS:
        print("GAGAL: boot melewati anggaran", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
