"""Uji antarmuka Lumi di Chrome headless (dipakai CI, job "ui").

Menjelajahi semua layar (sambutan, hasil rute, pendampingan, bus langsung, tab rute/halte/info/riwayat,
pengaturan, berbagi lokasi) dengan jembatan Android tiruan, lalu:
  1. gagal bila ada galat JavaScript (pageerror),
  2. dalam mode Inggris, gagal bila masih ada teks berbahasa Indonesia (selain nama tempat/rute).

Pemakaian:  python3 tools/ui_check.py en|id [native] [--shots DIR]
Butuh: pip install playwright (memakai Chrome/Chromium yang sudah terpasang).
"""
import asyncio, json, os, pathlib, re, shutil, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
NATIVE = "native" in sys.argv
WWW = (ROOT / "app/src/main/assets/www/index.html").as_uri()
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
OUT = []

STUB = r"""
(() => {
  const st = { gps: true, perm: { loc: false, notif: false, battery: false, oem: true, brand: "Xiaomi" } };
  window.__stub = st;
  const cb = (fn) => setTimeout(fn, 30);
  window.LumiNative = {
    setLang: (l) => { st.lang = l; }, insets: () => JSON.stringify({ top: 32, bottom: 24, ime: false }),
    permState: () => JSON.stringify(st.perm), requestPerm: (k) => { st.perm[k] = true; cb(() => window.__lumiPerm && __lumiPerm()); },
    openAutostart: () => {}, http: (id, u) => cb(() => __lumiHttp(id, 0, "")), httpH: (id, u) => cb(() => __lumiHttp(id, 0, "")),
    httpPost: (id) => cb(() => __lumiHttp(id, 0, "")),
    locate: (id) => cb(() => __lumiLocate(id, { lat: -6.2088, lon: 106.8456, acc: 10 })),
    gpsOn: () => st.gps, openGpsSettings: () => {}, startGuide: (spec, title) => { st.guide = title; }, stopGuide: () => {},
    guideState: () => null, getChanges: () => JSON.stringify({ unseen: true, lastDate: "2026-11-08 10:15", list: [{ date: "2026-11-08", items: [
      { k: "chg", code: "9", name: "Pinang Ranti - Pluit", text: "Halte baru: Halte A, Halte B dll. (5). Tidak lagi lewat: Halte C" },
      { k: "add", code: "JAK.99", name: "Kampung X - Kampung Y", text: "Rute baru: Kampung X - Kampung Y" },
      { k: "chg", code: "1", name: "Blok M - Kota", text: "Pola perjalanan bertambah (2 → 3, mis. varian lewat tol)" },
      { k: "chg", code: "2", name: "Pulo Gadung - Monas", text: "Urutan halte berubah" },
      { k: "del", code: "T99", name: "Zona Z", text: "Rute tidak ada lagi di data resmi" },
      { k: "chg", code: "3", name: "Kalideres - Monas", text: "Nama trayek: Lama → Baru" }]}]}),
    getChangeDetail: () => null, markChangesSeen: () => {}, pipOk: () => true, enterPip: () => {}, versionName: () => "2.12",
    share: (t) => { st.shared = t; }, shareImage: (u, t) => { st.sharedImg = t; }, openUrl: (u) => { st.url = u; }, openApp: () => {},
    updateGtfs: () => cb(() => { __lumiGtfs("progress", "Downloading GTFS… 3 MB"); __lumiGtfs("error", "HTTP 503"); }),
    takeShared: () => null, takeOpen: () => null, compass: () => {}, speak: (t) => { st.spoken = t; }, stopSpeak: () => {},
    getRouteData: () => null, resolve: (id, u) => cb(() => __lumiResolved(id, u)), openTjApp: () => {}, busNotify: () => {},
    liveOpen: () => { cb(() => window.LumiLive && LumiLive.__nativeClose && LumiLive.__nativeClose("server refused: 403")); }, liveSend: () => {}, liveClose: () => {}, liveFilter: () => {}, liveBytes: () => 0,
    watchPos: (on) => { st.watch = on; if (on) cb(() => window.__lumiPos && __lumiPos(-6.2089, 106.8457, 8)); }
  };
  try { localStorage.setItem('lumi:debug', '1'); } catch (e) { }
})();
"""

COLLECT = r"""
() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) {
      const t = n.nodeValue.replace(/\s+/g, " ").trim();
      if (!t) continue;
      const p = n.parentElement;
      if (!p || p.closest("script,style,svg,.leaflet-tile-pane,[translate=no],.leaflet-control-attribution")) continue;
      out.push(t);
    } else {
      for (const a of ["placeholder", "aria-label", "title", "alt"]) { const v = n.getAttribute(a); if (v) out.push(v); }
    }
  }
  const tl = document.querySelector("#toast"); if (tl && tl.textContent) out.push(tl.textContent);
  return out;
}
"""

async def main():
    async with async_playwright() as p:
        exe = os.environ.get("CHROME") or shutil.which("google-chrome") or shutil.which("chromium")
        b = await p.chromium.launch(executable_path=exe, args=["--allow-file-access-from-files"]) if exe else await p.chromium.launch(args=["--allow-file-access-from-files"])
        ctx = await b.new_context(viewport={"width": 392, "height": 850}, device_scale_factor=2, locale="id-ID")
        if NATIVE: await ctx.add_init_script(STUB)
        if os.environ.get("CLOCK"):
            await ctx.clock.install(time=os.environ["CLOCK"])
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(WWW)
        await pg.evaluate("l => { localStorage.clear(); localStorage.setItem('lumi:cfg', JSON.stringify({lang: l})); }", LANG)
        await pg.reload(); await pg.wait_for_timeout(700)

        async def grab(step, shot=False):
            await pg.wait_for_timeout(250)
            for t in await pg.evaluate(COLLECT): OUT.append({"step": step, "text": t})
            if shot and SHOTS: await pg.screenshot(path=f"{SHOTS}/{LANG}-{step}.png")

        await grab("onboard1", True)
        await pg.click("#obNext"); await grab("onboard2", True)
        if NATIVE:
            await pg.evaluate("document.querySelector('#obDone').click()"); await grab("onboard2-locked", True)
            for k in ["loc", "notif", "battery"]:
                await pg.click(f'[data-perm="{k}"]'); await pg.wait_for_timeout(120)
            await grab("onboard2-ok", True)
        await pg.evaluate("document.querySelector('#obDone').click()"); await grab("home", True)

        # seed data
        await pg.evaluate("""() => {
          const s = (k, v) => localStorage.setItem('lumi:' + k, JSON.stringify(v));
          s('favs', [{key: 'a|b', from: {name: 'Monas', p: [-6.1754, 106.8272]}, to: {name: 'Blok M', p: [-6.2443, 106.7999]}, ts: Date.now()}]);
          s('trips', [{key: 'x', ts: Date.now(), from: 'Monas', to: 'Blok M', mins: 75, fare: 3500, modes: 'Transjakarta + KRL Commuter Line'}]);
          s('places', [{name: 'Rumah', sub: 'Dari Google Maps', p: [-6.2, 106.8]}]);
          s('recent', [{from: {name: 'Lokasi saya', p: [-6.2, 106.8], me: true}, to: {name: 'Blok M', p: [-6.2443, 106.7999]}}]);
        }""")
        await pg.reload(); await pg.wait_for_timeout(700); await grab("home-seeded", True)
        await pg.click("#inFrom"); await grab("suggest-empty")
        await pg.fill("#inFrom", "monas"); await grab("suggest-q")
        await pg.fill("#inFrom", "https://maps.app.goo.gl/abc"); await grab("suggest-link")
        await pg.keyboard.press("Escape"); await pg.click("#btnGo"); await grab("go-noorigin")
        await pg.click("#btnTime"); await grab("time", True)
        await pg.click('#timeMode [data-m="arr"]'); await pg.click("#btnTimeOk"); await grab("time-set")
        await pg.click("#btnTime"); await pg.click('#timeMode [data-m="now"]'); await pg.click("#btnTimeOk")

        # rencana perjalanan
        trips = [("Monas", [-6.1754, 106.8272], "Blok M", [-6.2443, 106.7999]),
                 ("Stasiun Bogor", [-6.595, 106.79], "Bandara Soekarno-Hatta", [-6.1256, 106.6559]),
                 ("Kota Tua", [-6.1352, 106.8133], "Ragunan", [-6.3125, 106.8202]),
                 ("Lebak Bulus", [-6.2894, 106.7745], "Bekasi Timur", [-6.2470, 107.0150])]
        for i, (fn, fp, tn, tp) in enumerate(trips):
            await pg.evaluate("a => { __lumiSet('from', {name: a[0], p: a[1]}); __lumiSet('to', {name: a[2], p: a[3]}); }", [fn, fp, tn, tp])
            await pg.click("#btnGo"); await pg.wait_for_timeout(1500); await grab(f"results{i}", i == 0)
            n = await pg.evaluate("document.querySelectorAll('#results .it').length")
            if i == 0:
                await pg.click('.fbar [data-sort="cheap"]'); await grab("sort")
                chips = await pg.evaluate("[...document.querySelectorAll('.fbar [data-mode]')].map(x=>x.dataset.mode)")
                if chips: await pg.click(f'.fbar [data-mode="{chips[-1]}"]'); await pg.click(f'.fbar [data-mode="{chips[0]}"]'); await grab("filter-empty")
                if chips: await pg.click(f'.fbar [data-mode="{chips[-1]}"]'); await pg.click(f'.fbar [data-mode="{chips[0]}"]')
                if await pg.query_selector("#btnMore"): await pg.click("#btnMore"); await grab("more")
            for k in range(min(n, 4)):
                await pg.evaluate("k => document.querySelectorAll('#results .it')[k].click()", k)
                await pg.wait_for_timeout(700); await grab(f"trip{i}-{k}", i == 0 and k == 0)
                tg = await pg.query_selector("#tripBody [data-tog]")
                if tg: await tg.click(); await grab(f"trip{i}-{k}-stops")
                await pg.evaluate("document.querySelector('#sheetTrip').hidden = true")
            await pg.evaluate("document.querySelectorAll('#results .it-share')[0] && document.querySelectorAll('#results .it-share')[0].click()")
            await pg.wait_for_timeout(400); await grab(f"share{i}")
        if NATIVE:
            await pg.evaluate("document.querySelectorAll('#results .it')[0].click()"); await pg.wait_for_timeout(600)
            await pg.click("#btnGuide"); await pg.wait_for_timeout(500); await grab("guide", True)
            await pg.evaluate("__lumiGuide({phase:'ride',title:'TJ 9 · 3 stops to go',text:'Get off at X · now near Y',stopsLeft:3,metersLeft:-1})"); await grab("guide2")
            await pg.evaluate("__lumiGuide({phase:'walk',title:'Walk to your destination',text:'±300 m to go to Z',stopsLeft:-1,metersLeft:1300})"); await grab("guide3")
            await pg.evaluate("__lumiGuide({phase:'done',done:true,title:'Arrived',text:'You have arrived at Z.',stopsLeft:-1,metersLeft:-1})"); await grab("guide4")
            await pg.evaluate("document.querySelector('.guide-stop') && document.querySelector('.guide-stop').click()"); await grab("guide-stop")
            await pg.evaluate("document.querySelector('#sheetTrip').hidden = true")
            await pg.evaluate("__stub.gps = false"); await pg.click("#btnLocate"); await grab("gps", True)
            await pg.click("#gpsLater"); await pg.evaluate("__stub.gps = true")
            await pg.click("#btnLocate"); await pg.wait_for_timeout(400); await grab("locate")
        await pg.click("#btnClear"); await grab("cleared")

        # bus di sekitarmu
        await pg.click("#btnLiveNear"); await pg.wait_for_timeout(2500); await grab("live", True)
        await pg.evaluate("document.querySelector('#sheetLive').hidden = true")

        # tab rute
        await pg.click('.nav-btn[data-tab="lines"]'); await grab("lines", True)
        await pg.fill("#inLine", "zzzz"); await pg.wait_for_timeout(300); await grab("lines-empty")
        await pg.fill("#inLine", ""); await pg.wait_for_timeout(300)
        for lid in ["tj-1", "tj-3", "tj-9", "tj-jak01", "tj-13b", "krl-b", "krl-cm", "mrt-ns", "ka-bandara", "lrt-cbr", "whoosh"]:
            await pg.evaluate("id => { const b = document.querySelector('.l-item[data-id=\"'+id+'\"]'); b && b.click(); }", lid)
            await pg.wait_for_timeout(500); await grab(f"line-{lid}", lid == "tj-3")
            dirs = await pg.evaluate("document.querySelectorAll('#lineBody [data-dir]').length")
            for d in range(1, dirs):
                await pg.evaluate("d => document.querySelectorAll('#lineBody [data-dir]')[d].click()", d); await grab(f"line-{lid}-d{d}")
            await pg.evaluate("document.querySelector('#lineBody .stop') && document.querySelector('#lineBody .stop').click()"); await grab(f"line-{lid}-stop")
            await pg.evaluate("document.querySelector('#sheetLine').hidden = true")

        # tab halte, tarif, riwayat
        await pg.click('.nav-btn[data-tab="stops"]'); await grab("stops", True)
        await pg.fill("#inStop", "zzzz"); await grab("stops-empty")
        await pg.fill("#inStop", "Monas"); await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('#stopList .stop-row') && document.querySelector('#stopList .stop-row').click()")
        await pg.wait_for_timeout(600); await grab("stop-sheet")
        # Lembar aksi halte (Berangkat dari sini / Pergi ke sini / Lihat posisi bus)
        await pg.evaluate("() => { const s = document.querySelector('#sheetStop'); if (s && !s.hidden) { const b = document.querySelector('#stopActLive'); if (b && !b.hidden) b.click(); else s.hidden = true; } }")
        await pg.wait_for_timeout(1200); await grab("stop-live")
        await pg.evaluate("() => { const s = document.querySelector('#sheetStop'); if (s) s.hidden = true; }")
        await pg.evaluate("document.querySelector('#sheetLive').hidden = true")
        await pg.click('.nav-btn[data-tab="info"]'); await grab("info", True)
        await pg.click('.nav-btn[data-tab="history"]'); await grab("history", True)
        await pg.click('.nav-btn[data-tab="plan"]')

        # perubahan rute (native)
        if NATIVE:
            await pg.evaluate("document.querySelector('.chg-more') && document.querySelector('.chg-more').click()"); await grab("changes-home", True)
            await pg.evaluate("document.querySelector('.chg-row') && document.querySelector('.chg-row').click()"); await pg.wait_for_timeout(300); await grab("change-detail", True)
            await pg.evaluate("document.querySelector('#sheetChg') && (document.querySelector('#sheetChg').hidden = true)")

        # pengaturan
        await pg.click("#btnSettings"); await pg.wait_for_timeout(300); await grab("settings", True)
        await pg.evaluate("document.querySelector('.gtfs-btn') && document.querySelector('.gtfs-btn').click()"); await pg.wait_for_timeout(400); await grab("gtfs")
        await pg.evaluate("document.querySelector('#setAccess').click()"); await grab("set-access")
        await pg.evaluate("document.querySelector('#setVoice').click()"); await grab("set-voice")
        await pg.evaluate("document.querySelector('#btnSaveFav').click()"); await grab("set-fav")
        await pg.evaluate("document.querySelector('#restoreText').value = 'xx'; document.querySelector('#btnRestore').click()"); await grab("restore-bad")
        await pg.evaluate("document.querySelector('#btnClearTrips') && document.querySelector('#btnClearTrips').click()"); await grab("trips-cleared")
        await pg.select_option("#setMap", "bright"); await grab("map-style")
        await pg.evaluate("document.querySelector('#btnUpdate').click()"); await pg.wait_for_timeout(500); await grab("update")
        await pg.evaluate("document.querySelector('#sheetSettings').hidden = true")

        # bagikan dari Google Maps + pilih titik
        await pg.evaluate("lumiShared('Monas\\nhttps://www.google.com/maps/place/Monas/@-6.1754,106.8272,17z')"); await pg.wait_for_timeout(500); await grab("share-ok", True)
        await pg.evaluate("document.querySelector('#sheetShare').hidden = true")
        await pg.evaluate("lumiShared('Toko Kue\\nhttps://maps.app.goo.gl/abc')"); await pg.wait_for_timeout(500); await grab("share-nocoord")
        await pg.click("#shareTo"); await pg.wait_for_timeout(500); await grab("pick", True)
        await pg.click("#pickOk"); await grab("pick-ok")

        names = await pg.evaluate("""() => { const s = new Set(); for (const l of __lumiDebug.data.lines) { s.add(l.code); s.add(l.name); for (const d of l.dirs) { if (d.h) s.add(d.h); for (const x of d.s) s.add(x.n); } } return [...s]; }""")
        swallowed = await pg.evaluate("() => window.lumiErrors ? lumiErrors() : []")
        await b.close()
        return errs, names, swallowed

# Kata Indonesia yang tidak boleh muncul di mode Inggris (di luar nama tempat/rute).
ID = set("""dan di ke dari yang untuk tidak belum sudah naik turun halte stasiun jalan kaki cari pilih tempat lagi mnt menit jam semua buka tutup hapus simpan pakai lihat izin izinkan lokasi rute tarif peta kereta pindah tiba berangkat sekarang arah menuju berikutnya pemberhentian perjalanan pengaturan bahasa aplikasi ketuk gratis bayar dengan atau bisa akan saat ini itu kamu oleh pada sampai tanpa lewat mulai selesai gagal memuat resmi diunduh perubahan baru dihapus berubah sebelum sesudah pendampingan ojol mobil motor sekitar besok pukul operasional beroperasi transportasi umum angkutan pilihan opsi termurah tercepat minim rekomendasi moda bersihkan ubah riwayat favorit cadangan pulihkan aksesibel suara panduan tentang lisensi laporkan masalah versi terbaru tersedia memeriksa mengunduh menghubungkan terhubung menunggu posisi armada penumpang tersimpan nama titik asal tujuan alamat tautan koordinat terbaca geser letakkan langsung diterima jadikan lainnya tampilkan sembunyikan kartu biru bawah hanya juga sebagian mungkin sesuai bila tiap setiap hari bulan ongkos ongkosnya disimpan diperbarui berhenti varian memutar pola tunggu termasuk sibuk libur maks mis dll sejak hingga lintas koridor pengumpan wisata rusun bawaan unduh perbarui tampil gambar bagikan salin mengerti oke dibagikan disetel dimatikan aktif layanan sinyal lemah coba ditolak diperlukan kosong terputus jaringan tamu ditutup kode menolak""".split())
# Nama contoh yang dipakai skrip ini sendiri.
SAMPLE = ["Monas", "Blok M", "Stasiun Bogor", "Bandara Soekarno-Hatta", "Kota Tua", "Ragunan", "Lebak Bulus", "Bekasi Timur",
          "Rumah", "Toko Kue", "Pinang Ranti - Pluit", "Kampung X - Kampung Y", "Blok M - Kota", "Pulo Gadung - Monas", "Zona Z",
          "Kalideres - Monas", "Halte A", "Halte B", "Halte C", "Lama", "Baru", "Lokasi saya", "Jakarta Pusat", "Jakarta Selatan",
          "Jakarta Barat", "Jakarta Timur", "Jakarta Utara", "Kebayoran Baru", "Gambir", "Menteng"]
# Teks yang memang tidak diterjemahkan.
ALLOW = {"Bahasa Indonesia", "Language / Bahasa"}
# Nama trayek berbentuk "Asal – Tujuan [via X]" (data resmi, tidak diterjemahkan).
TRAYEK = re.compile(r"[A-Z0-9][\w .()'/&-]*( – [A-Z0-9][\w .()'/&-]*)+")


def untranslated(rows, names):
    names = sorted({n for n in list(names) + SAMPLE if n and len(n) > 2}, key=len, reverse=True)
    nm = re.compile("|".join(re.escape(n) for n in names))
    bad = {}
    for r in rows:
        t = r["text"]
        if t in ALLOW or TRAYEK.fullmatch(t) or re.fullmatch(r"\S+\.\S+", t):
            continue
        words = re.findall(r"[A-Za-z]+", nm.sub(" ", t).lower())
        if any(w in ID for w in words):
            bad.setdefault(t, set()).add(r["step"])
    return bad


if __name__ == "__main__":
    if SHOTS: os.makedirs(SHOTS, exist_ok=True)
    errs, names, swallowed = asyncio.run(main())
    print(f"{len(OUT)} teks dari semua layar ({LANG}{', native' if NATIVE else ''})")
    if swallowed:   # informasi saja: galat yang ditangkap try/catch (lihat lumiLog di index.html)
        print(f"{len(swallowed)} galat tertangkap (catatan lumiLog):")
        for x in swallowed[-15:]: print(f"  ×{x.get('n', 1)} {x['m']}  @{x.get('a', '')}")
    fail = False
    if errs:
        fail = True
        print("GALAT JavaScript:"); [print("  " + e) for e in errs[:20]]
    if LANG == "en":
        bad = untranslated(OUT, names)
        if bad:
            fail = True
            print(f"{len(bad)} teks belum diterjemahkan (tambahkan ke js/i18n.js):")
            for t, st in sorted(bad.items()): print(f"  {t[:160]!r}  <- {sorted(st)[:3]}")
    sys.exit(1 if fail else 0)
