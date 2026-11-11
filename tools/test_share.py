#!/usr/bin/env python3
"""Uji ujung-ke-ujung "Ikuti perjalananku": pesan dienkripsi ShareCrypto.java (sama dengan aplikasi),
lalu halaman docs/ikuti/index.html mengambilnya dari relay tiruan dan mendekripsi dengan WebCrypto.
   python3 tools/test_share.py        (butuh javac/java + playwright)"""
import asyncio, json, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = tempfile.mkdtemp()
subprocess.check_call(["javac", "-d", out, str(ROOT / "app/src/main/java/id/lumi/transport/ShareCrypto.java"), str(ROOT / "tools/ShareCryptoTest.java")])
lines = subprocess.check_output(["java", "-cp", out, "ShareCryptoTest"]).decode().split()
key, msgs = lines[0], lines[1:]
topic = "lumi-" + "0123456789abcdef" * 2

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(locale="id-ID")
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        served = {"n": 0}
        async def relay(route):
            url = route.request.url
            served["n"] += 1
            # Kiriman bertahap: 2 pesan pertama, lalu pesan "tiba"
            body = msgs[:2] if "since=12h" in url else msgs[2:]
            nd = "\n".join(json.dumps({"id": "m%d" % i, "time": 1, "event": "message", "topic": topic, "message": m}) for i, m in enumerate(body))
            await route.fulfill(status=200, body=nd + "\n", headers={"Access-Control-Allow-Origin": "*"})
        await pg.route("https://ntfy.sh/**", relay)
        await pg.route("https://unpkg.com/**", lambda r: r.abort())        # tanpa internet: peta boleh tidak tampil
        await pg.goto((ROOT / "docs/ikuti/index.html").as_uri() + "#t=" + topic + "&k=" + key)
        await pg.wait_for_timeout(1500)
        s1 = await pg.evaluate("[document.querySelector('#title').textContent, document.querySelector('#state').textContent, document.querySelector('#now').textContent, document.querySelector('#to').textContent]")
        await pg.wait_for_timeout(10500)
        s2 = await pg.evaluate("[document.querySelector('#title').textContent, document.querySelector('#state').textContent]")
        # kunci salah
        pg2 = await b.new_page(locale="id-ID")
        await pg2.route("https://ntfy.sh/**", relay); await pg2.route("https://unpkg.com/**", lambda r: r.abort())
        await pg2.goto((ROOT / "docs/ikuti/index.html").as_uri() + "#t=" + topic + "&k=" + ("A" * 43))
        await pg2.wait_for_timeout(1200)
        s3 = await pg2.evaluate("[document.querySelector('#title').textContent, document.querySelector('#now').textContent]")
        await pg2.goto("about:blank")
        await pg2.goto((ROOT / "docs/ikuti/index.html").as_uri() + "#t=bad")
        await pg2.wait_for_timeout(300)
        s4 = await pg2.evaluate("document.querySelector('#title').textContent")
        await b.close()
        return errs, s1, s2, s3, s4

errs, s1, s2, s3, s4 = asyncio.run(main())
fails = 0
def check(ok, msg):
    global fails
    print(("ok: " if ok else "GAGAL: ") + msg)
    if not ok: fails += 1
check(not errs, "tanpa galat JavaScript " + (str(errs) if errs else ""))
check(s1[0] == "Sedang dalam perjalanan" and s1[1] == "Dalam perjalanan", "pesan Java terdekripsi di peramban: %s" % s1[:2])
check("TJ 1" in s1[2] and "Blok M" in s1[3], "judul & tujuan tampil: %r / %r" % (s1[2], s1[3]))
check(s2 == ["Sudah sampai tujuan", "Sudah tiba ✓"], "pesan 'arrived' menghentikan & menandai tiba: %s" % s2)
check(s3[0] == "Menunggu posisi pertama…" and "TJ" not in s3[1], "kunci salah: pesan diabaikan, tidak bocor: %s" % s3)
check(s4 == "Tautan tidak bisa dibuka", "tautan rusak ditolak")
if fails: sys.exit(1)
print("Semua uji ikuti perjalanan lulus")
