<div align="center">

# 📝 Catatan Perubahan · Changelog

**🌐 Bahasa / Language:** ketuk bagian di bawah untuk membuka / tap a section below to expand it

[⬅️ README (ID)](README.md) · [⬅️ README (EN)](README.en.md)

</div>

---

## ✦ v2.23.0 — 15 November 2026 / 15 November 2026

- 🇮🇩 **Halte di peta dibedakan:** BRT kotak biru, non-BRT/Mikrotrans titik bulat tosca kecil, kereta bulat merah. Jenis dihitung dari rute yang benar-benar berhenti di titik itu (`line.brt`), bukan dari nama; tooltip menampilkan arah peron. `versionCode` **22300**
- 🇮🇩 **GPS beku setelah minimize/layar mati diperbaiki.** `startLocation()` punya penjaga `if (lm != null) return;` sehingga setelah Doze berhenti mengirim posisi, permintaan tidak pernah dipasang ulang. Kini pengawas 15 detik melepas & memasang ulang pendengar bila tak ada posisi > 20 detik; `onProviderEnabled` juga memaksa pasang ulang. `versionCode` **22300**
- 🇮🇩 **Data rute diperiksa tiap 10 menit** saat aplikasi dibuka (dulu 30); bila tanda versi GTFS berubah, data baru langsung diunduh dan dipakai. `versionCode` **22300**
- 🇬🇧 **Stops on the map are now typed:** BRT as a blue square, non-BRT/Mikrotrans as a small teal dot, rail as a red circle. The type comes from the routes that actually stop there (`line.brt`), not from the name; tooltips show the platform direction. `versionCode` **22300**
- 🇬🇧 **GPS freezing after minimise/screen-off is fixed.** `startLocation()` guarded on `if (lm != null) return;`, so once Doze stopped delivering fixes the request was never re-armed. A 15-second watchdog now detaches and re-attaches the listener when no fix arrives for 20 seconds; `onProviderEnabled` forces a re-arm too. `versionCode` **22300**
- 🇬🇧 **Route data is checked every 10 minutes** when the app opens (was 30); if the GTFS version marker changed, new data is downloaded and used immediately. `versionCode` **22300**

---

## ✦ v2.22.1 — 15 November 2026 / 15 November 2026

- 🇮🇩 **Snapshot nama halte diperluas: 7.515 halte dari 238 rute** (dulu 375 dari 11 rute). **1.395 nama** disamakan dengan aplikasi resmi 2026, 59 salah ketik digabung, 39 kembar dibuang — saat build, tanpa jaringan. `versionCode` **22201**
- 🇮🇩 **Halte satu arah tidak lagi menampilkan semua koridor.** Token arah dibaca dari field `d` (nama halte sudah tidak membawa "Arah …"): `stopIndex()` menjadikan (nama dasar + arah) identitas, `linesAtStop()` hanya menerima arah yang bertoken sama, papan bus memakai token yang sama. Judul menampilkan "Pancoran Arah Barat". `versionCode` **22201**
- 🇬🇧 **Stop-name snapshot expanded to all 238 routes: 7,515 stops** (was 375 from 11). **1,395 names** now match the official 2026 app, 59 typos merged, 39 duplicates dropped — at build time, offline. `versionCode` **22201**
- 🇬🇧 **One-way stops no longer list every corridor.** The direction token is read from field `d` (names no longer carry "Arah …"): `stopIndex()` treats (base name + direction) as identity, `linesAtStop()` only accepts directions carrying the same token, and the bus board uses the same token. The sheet title reads "Pancoran Arah Barat". `versionCode` **22201**

---

## ✦ v2.22.0 — 15 November 2026 / 15 November 2026

- 🇮🇩 **Data rute dibangun ulang.** 179 nama halte disamakan dengan aplikasi resmi 2026 lewat snapshot `data-raw/tj_stops_2026.json` (375 halte, 11 rute) — bukan panggilan jaringan saat build. Contoh: **Gelora Bung Karno → Senayan Bank Jakarta**, **Setiabudi → Setiabudi Integritas**. `versionCode` **22200**
- 🇮🇩 **42 salah ketik digabung, 39 kembar dibuang.** "Jambatan Serong" dan "Jembatan Serong" kini satu halte (aturan: beda ≤ 2 huruf dan ≤ 25 m; yang lebih jauh ditulis eksplisit di `_ALIAS` supaya tidak menebak). `versionCode` **22200**
- 🇮🇩 **Arah halte jadi identitas.** Token "Arah …" disimpan di field `d`, prefiks "Sbr." di `x` — 394 titik bertoken arah, 44 bertanda seberang. Dua peron berseberangan tidak bisa lagi dianggap satu halte. `versionCode` **22200**
- 🇮🇩 **`build_data.py` menulis UTF-8.** Dulu `open(OUT,"w")` memakai encoding sistem; build di Windows menghasilkan byte cp1252 dan `data.js` bukan UTF-8 sah. `versionCode` **22200**
- 🇬🇧 **Route data rebuilt.** 179 stop names now match the official 2026 app via the `data-raw/tj_stops_2026.json` snapshot (375 stops, 11 routes) — no network at build time. Examples: **Gelora Bung Karno → Senayan Bank Jakarta**, **Setiabudi → Setiabudi Integritas**. `versionCode` **22200**
- 🇬🇧 **42 typos merged, 39 duplicates dropped.** "Jambatan Serong" and "Jembatan Serong" are one stop now (rule: ≤ 2 edit distance and ≤ 25 m; farther ones are listed explicitly in `_ALIAS` so nothing is guessed). `versionCode` **22200**
- 🇬🇧 **Stop direction is identity.** "Arah …" tokens are kept in field `d`, the "Sbr." prefix in `x` — 394 stops carry a direction token, 44 are across-the-road. Two opposite platforms can no longer collapse into one stop. `versionCode` **22200**
- 🇬🇧 **`build_data.py` writes UTF-8.** It used the system encoding before, so a Windows build produced cp1252 bytes and `data.js` was not valid UTF-8. `versionCode` **22200**

---

## ✦ v2.21.1 — 14 November 2026 / 14 November 2026

- 🇮🇩 **Pantau perubahan rute berhenti gagal.** Langkah `javac` di `route-watch.yml` hanya mengompilasi `GtfsImporter.java`, padahal berkas itu memakai `Csv`/`Lang`/`AppInfo` (kelas Android) → `cannot find symbol`, dan `set -e` mematikan job sebelum "Simpan perubahan". `data/route_changes.json` karena itu tidak pernah naik. Langkah mati itu dibuang. `versionCode` **22101**
- 🇮🇩 **Data rute diperiksa saat aplikasi dibuka.** Halaman memanggil `LumiNative.checkRoutesNow()` ±1,2 dtk setelah layar pertama tampil (dulu hanya lewat JobScheduler latar). Kartu "rute berubah" langsung memuat rincian sebelum → sesudah: halte ditambah, halte tidak lagi dilewati, urutan lama vs baru. Dibatasi sekali per 30 menit. `versionCode` **22101**
- 🇬🇧 **The route watcher no longer fails.** A `javac` step in `route-watch.yml` compiled only `GtfsImporter.java`, which uses `Csv`/`Lang`/`AppInfo` (Android classes) → `cannot find symbol`, and `set -e` killed the job before "Simpan perubahan". That is why `data/route_changes.json` never advanced. The dead step is removed. `versionCode` **22101**
- 🇬🇧 **Route data is checked when the app opens.** The page now calls `LumiNative.checkRoutesNow()` about 1.2 s after first paint (previously only via the background JobScheduler). The "route changed" card loads the before → after detail immediately: added stops, stops no longer served, old vs new stop order. Capped at once per 30 minutes. `versionCode` **22101**

---

## ✦ v2.21.0 — 14 November 2026 / 14 November 2026

- 🇮🇩 **Fasilitas & rute resmi di lembar halte.** Lembar halte kini menampilkan jenis titik (halte BRT / bus_stop), fasilitas beserta ikonnya, akses kursi roda, dan daftar rute resmi dengan warna koridornya — dari `GET /v1/bus-stop` dan `/v1/bus-stop/{id}`. `versionCode` **22100**
- 🇮🇩 **Jam operasional, headway, dan tarif dari server.** Detail rute memakai `start_time`/`end_time`/`headway_secs`/`price` dari `/v1/route/{id}`; teks bawaan tetap jadi cadangan. `versionCode` **22100**
- 🇮🇩 **Cuaca di titik halte** (Open-Meteo, tanpa kunci API) dan **hitungan bus putus sinyal** (`POST /v1/bus/offline`) di papan "Bus di sekitarmu". `versionCode` **22100**
- 🇮🇩 **Bus arah sebaliknya tidak lagi muncul di halte satu arah.** Tiga sebab ditutup: pencarian `stop_id` memakai nama "mengandung" lalu jatuh ke titik terdekat tanpa batas, toleransi pencocokan 250 m (lebih lebar daripada jarak dua peron ±40 m), dan penjaga arah yang hanya jalan bila halte tujuan dikirim. Sekarang nama harus persis, arah wajib sama, toleransi 30 m. `versionCode` **22100**
- 🇮🇩 **Halte kembar digabung** (nama sama & ≤ 25 m), penanda koordinat untuk kembar ≥ 300 m, dan `x-app-version` naik ke 3.1.1. `versionCode` **22100**
- 🇬🇧 **Facilities and official routes in the stop sheet.** The stop sheet now shows the point type (BRT stop / bus_stop), facilities with icons, wheelchair access, and the official route list with corridor colours — from `GET /v1/bus-stop` and `/v1/bus-stop/{id}`. `versionCode` **22100**
- 🇬🇧 **Operating hours, headway and fare from the server.** Route detail uses `start_time`/`end_time`/`headway_secs`/`price` from `/v1/route/{id}`; bundled text stays as the fallback. `versionCode` **22100**
- 🇬🇧 **Weather at the stop** (Open-Meteo, no API key) and an **offline-bus count** (`POST /v1/bus/offline`) on the "Buses near you" board. `versionCode` **22100**
- 🇬🇧 **Opposite-direction buses no longer appear at one-way stops.** Three causes closed: `stop_id` lookup used "contains" then fell back to the nearest point with no distance cap, the match tolerance was 250 m (wider than the ±40 m between two platforms), and the direction guard only ran when a destination stop was supplied. Names must now match exactly, direction must match, tolerance is 30 m. `versionCode` **22100**
- 🇬🇧 **Duplicate stops merged** (same name & ≤ 25 m), coordinate tags for twins ≥ 300 m apart, and `x-app-version` bumped to 3.1.1. `versionCode` **22100**

---

## ✦ v2.20.1 — 13 November 2026 / 13 November 2026

- 🇮🇩 **GTFS tidak lagi ditanam di APK.** Parsing 4,1 MB di WebView selalu memblokir thread utama — dulu saat boot, lalu sesaat setelah layar tampil setelah dipindah. Bundling-nya dibatalkan: data resmi diunduh di latar belakang seperti semula, dan yang tersimpan dipakai saat aplikasi dibuka. Boot 398 ms, dan tidak ada jeda setelah layar tampil. `versionCode` **22001**
- 🇮🇩 **Anggaran boot mengukur dua hal.** Selain `domContentLoaded`, CI kini juga mengukur waktu sampai graf rute siap (anggaran 2500 ms). `versionCode` **22001**
- 🇮🇩 **Sisa temuan ditutup.** Hasil rute yang sudah tampil dihitung ulang setelah data resmi masuk; `probeNow()` hanya memuat `http/https`; headway KRL/LRT Jabodebek mengikuti pita jam (sibuk 6 mnt, luar sibuk 18/12 mnt); `ui_check` en+id masuk gerbang rilis; tes `GtfsImporter` ditambahkan; `ui_check` gagal bila perencanaan menghasilkan <3 opsi. `versionCode` **22001**
- 🇬🇧 **GTFS is no longer bundled.** Parsing 4.1 MB in a WebView always blocks the main thread — first at boot, then just after first paint once it was deferred. Bundling is reverted: official data is downloaded in the background as before, and stored data is used on launch. Boot is 398 ms with no post-paint stall. `versionCode` **22001**
- 🇬🇧 **The boot budget measures two things.** Besides `domContentLoaded`, CI now measures time until the route graph is ready (2500 ms budget). `versionCode` **22001**
- 🇬🇧 **Remaining findings closed.** Results already on screen are recomputed once official data arrives; `probeNow()` only loads `http/https`; KRL and LRT Jabodebek headways follow time bands (6 min peak, 18/12 min off-peak); `ui_check` en+id is part of the release gate; a `GtfsImporter` test was added; `ui_check` now fails when planning yields fewer than 3 options. `versionCode` **22001**

---

## ✦ v2.20.0 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Boot balik cepat.** GTFS bawaan (4,1 MB) tidak lagi diparse sebelum layar pertama; ia dimuat setelah halaman tampil. Diukur: domContentLoaded **1472 ms → 477 ms**. `tools/boot_budget.py` menjaga angka itu di CI (gagal bila >1500 ms). `versionCode` **22000**
- 🇮🇩 **Keamanan.** `openExternal()` hanya membuka `http/https/mailto/tel/market` — skema `intent:` dibuang (intent redirection). WebView probe tidak lagi punya akses berkas. Pembaruan APK wajib ditandatangani sertifikat yang sama (SHA-256 dibandingkan). Crash terakhir disimpan dan bisa dibagikan dari Pengaturan. `versionCode` **22000**
- 🇮🇩 **Ketahanan.** Sesi Google kedaluwarsa sendiri setelah 2 menit menganggur; kegagalan petak Google pulih setelah 5 menit; semua akses `localStorage` lewat satu pintu yang tidak melempar; cache tempat ikut cadangan. `versionCode` **22000**
- 🇮🇩 **Data & UI.** Arah rute tanpa `shape` dilaporkan ke `data/route_shape_report.txt` (207 arah). Nama halte kembar diberi penanda koordinat supaya tidak tampak identik. `versionCode` **22000**
- 🇬🇧 **Fast boot again.** The bundled GTFS (4.1 MB) is no longer parsed before first paint; it loads after the page is up. Measured: domContentLoaded **1472 ms → 477 ms**, guarded in CI by `tools/boot_budget.py` (fails above 1500 ms). `versionCode` **22000**
- 🇬🇧 **Security.** `openExternal()` only opens `http/https/mailto/tel/market` — `intent:` is gone (intent redirection). The probe WebView no longer has file access. APK updates must be signed with the same certificate (SHA-256 compared). The last crash is stored and can be shared from Settings. `versionCode` **22000**
- 🇬🇧 **Robustness.** The Google session expires after 2 idle minutes; Google tile failures recover after 5 minutes; every `localStorage` access goes through one door that never throws; the place cache is included in backups. `versionCode` **22000**
- 🇬🇧 **Data & UI.** Route directions without a `shape` are reported to `data/route_shape_report.txt` (207 directions). Duplicate stop names get a coordinate tag so they no longer look identical. `versionCode` **22000**

---

## ✦ v2.19.6 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Rilis sekarang membawa data rute resmi.** Jalur rilis (backfill) dulu tidak mengambil GTFS, jadi APK rilis dikirim tanpa data rute resmi dan baru mengunduhnya saat dipakai — beda isi dengan APK hasil CI. Sekarang keduanya mengambil GTFS yang sama, dan sebelum membangun, jalur rilis menjalankan uji versi, sintaks, mesin rute, dan lapisan Google. Rilis gagal kalau salah satunya merah. `versionCode` **21906**
- 🇮🇩 **Layar izin tidak lagi mengunci.** "Berjalan di latar belakang" bukan izin runtime (itu mematikan optimasi baterai), jadi tidak lagi jadi syarat masuk; hanya lokasi dan notifikasi yang wajib. `versionCode` **21906**
- 🇮🇩 **Tes lapisan Google masuk CI.** `tools/test_gmaps.js` mengunci perilaku yang gampang rusak tanpa kelihatan: isolasi kegagalan per kemampuan, cooldown 429, penolakan kunci yang permanen, `sessiontoken`, dan cache `place_id`. `versionCode` **21906**
- 🇮🇩 **Dokumen yang bertentangan dibereskan.** `docs/pencarian-alamat.md` dulu menyimpulkan kunci tidak bisa dipakai ulang; itu keliru dan sudah dikoreksi, dengan rujukan ke bukti ujinya. `versionCode` **21906**
- 🇮🇩 **Petak Google mengikuti layar.** `scale=2` hanya dipakai saat kerapatan layar ≥ 2; layar 1x tidak lagi membayar 2,25× byte. `versionCode` **21906**
- 🇬🇧 **Releases now ship the official route data.** The release path (backfill) never fetched GTFS, so release APKs went out without official route data and downloaded it at runtime — a different build from the CI artifact. Both paths now fetch the same GTFS, and the release path runs version, syntax, routing-engine and Google-layer tests before building. A red test blocks the release. `versionCode` **21906**
- 🇬🇧 **The permission screen no longer locks you out.** "Run in the background" is not a runtime permission (it turns off battery optimisation), so it is no longer a gate; only location and notifications are required. `versionCode` **21906**
- 🇬🇧 **Google-layer tests are in CI.** `tools/test_gmaps.js` locks the behaviour that breaks invisibly: per-capability failure isolation, 429 cooldown, permanent key rejection, `sessiontoken`, and the `place_id` cache. `versionCode` **21906**
- 🇬🇧 **Contradicting docs fixed.** `docs/pencarian-alamat.md` used to conclude the keys could not be reused; that was wrong and is corrected, pointing at the test evidence. `versionCode` **21906**
- 🇬🇧 **Google tiles follow the screen.** `scale=2` is only requested on ≥2× screens; 1× screens no longer pay 2.25× the bytes. `versionCode` **21906**

---

## ✦ v2.19.5 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Kegagalan Google tidak lagi menular.** Dulu satu penolakan dari endpoint mana pun mematikan seluruh lapisan Google — autocomplete ikut mati karena `nearby` ditolak. Sekarang tiap kemampuan (`autocomplete`, `details`, `search`, `nearby`) punya status sendiri, dan `OVER_QUERY_LIMIT` hanya menidurkan sementara dengan jeda berlipat (60 dtk → 2 mnt → 4 mnt, maksimal 15 mnt) lalu dicoba lagi sendiri. Penolakan kunci yang sebenarnya tetap permanen sampai kuncinya diganti. Kegagalan petak peta juga dipisah dari kegagalan gaya vektor (`TILES_DOWN` vs `GL_DOWN`), jadi Google ngadat tidak lagi mematikan OpenFreeMap. `versionCode` **21905**
- 🇮🇩 **Kuota lebih hemat.** Saran alamat kini memakai `sessiontoken`: satu sesi ketik ditagih sebagai satu unit, bukan satu panggilan per ketukan. Place Details menyimpan hasilnya di HP (`place_id → koordinat`, 30 hari, maksimal 400 tempat), jadi tempat yang sama tidak memanggil Google dua kali. `versionCode` **21905**
- 🇮🇩 **Kunci tidak lagi dipamerkan di dokumen.** `docs/google-api-keys.md` tetap menjelaskan asal-usulnya, tapi nilai kuncinya diganti penanda; dokumen publik tidak perlu memuat kredensial. `versionCode` **21905**
- 🇬🇧 **Google failures no longer spread.** One rejection from any endpoint used to kill the whole Google layer — autocomplete died because `nearby` was denied. Each capability (`autocomplete`, `details`, `search`, `nearby`) now has its own state, and `OVER_QUERY_LIMIT` only sleeps with backoff (60 s → 2 min → 4 min, capped at 15 min) before retrying itself. A real key rejection stays permanent until the key is replaced. Tile failures are also separated from vector-style failures (`TILES_DOWN` vs `GL_DOWN`), so Google breaking no longer disables OpenFreeMap. `versionCode` **21905**
- 🇬🇧 **Less quota burn.** Address suggestions now use `sessiontoken`: one typing session is billed as one unit instead of one call per keystroke. Place Details caches its result on the phone (`place_id → coordinates`, 30 days, max 400 places), so the same place never asks Google twice. `versionCode` **21905**
- 🇬🇧 **Keys are no longer paraded in the docs.** `docs/google-api-keys.md` still explains where they come from, but the key values are placeholders; a public document does not need credentials in it. `versionCode` **21905**

---

## ✦ v2.19.4 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Petak Google HD, layar izin lebih jelas, dan tiga hal yang dihapus.** Peta Google Maps sekarang meminta petak `scale=2` (512 px untuk tiap petak 256 px) sehingga tajam di layar rapat — persis seperti aplikasi Google Maps. Tulisan atribusi di bawah peta dihapus; kreditnya pindah ke halaman Pengaturan. Di layar izin, keterangan tiap poin langsung tampil sejak awal (dulu baru muncul setelah diketuk). Popup "Berangkat dari sini / Pergi ke sini" saat mengetuk peta dihapus. Lencana "mungkin sudah pindah · xx m" di lembar halte dihapus. Kartu unduh rute resmi kini hilang setelah unduhan selesai. `versionCode` **21904**
- 🇬🇧 **HD Google tiles, a clearer permission screen, and three removals.** Google Maps now requests `scale=2` tiles (512 px per 256 px cell), so it is sharp on dense screens — like the real Google Maps app. The attribution line under the map is gone; the credit moved to Settings. On the permission screen, each item's description is visible from the start (it used to appear only after tapping). The "Start here / Go here" popup on map tap is removed. The "may have moved · xx m" badge on the stop sheet is removed. The official-route download card now disappears once the download finishes. `versionCode` **21904**

---

## ✦ v2.19.3 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Gaya peta Google Maps kembali — kali ini petak asli.** Pilihan "Google Maps" di Pengaturan sekarang memakai petak resmi `mt0…mt3.google.com/vt` (bukan Static Maps): 256 px per petak, skema slippy standar, jadi **geser dan zoom mulus seperti Google Maps**, tajam di tiap tingkat zoom, tanpa watermark berulang. Titik, halte, dan rute menempel tepat karena Leaflet yang memproyeksikan, bukan hitungan sendiri. Kalau Google mulai menolak petaknya, aplikasi memberi tahu dan pindah sekali ke OpenStreetMap — peta tidak pernah kosong. `versionCode` **21903**
- 🇬🇧 **Google Maps style is back — with real tiles this time.** The "Google Maps" option in Settings now uses the official `mt0…mt3.google.com/vt` tiles (not Static Maps): 256 px per tile, standard slippy scheme, so **panning and zooming are smooth like Google Maps**, sharp at every zoom level, with no repeated watermark. Points, stops and routes land exactly because Leaflet does the projection instead of hand maths. If Google starts refusing tiles, the app says so and switches once to OpenStreetMap — the map never goes blank. `versionCode` **21903**

---

## ✦ v2.19.2 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Gambar rute berwarna per ruas + ketuk peta.** Peta di gambar bagikan sekarang memakai warna trayek: merah Transjakarta, biru MRT, ungu LRT — jadi jumlah pindah langsung kelihatan dari gambarnya, bukan cuma dari strip. Pita peta juga dibuat lebih tinggi supaya rute tidak mengecil. Di aplikasi, **ketuk mana pun di peta** untuk memunculkan pilihan "Berangkat dari sini" / "Pergi ke sini"; nama tempatnya diambil dari Photon dan langsung mengisi kolom asal/tujuan. `versionCode` **21902**
- 🇮🇩 **Peta gaya Google (raster) dihapus.** Static Maps bukan tile server: sebagai peta dasar ia selalu kabur saat di-zoom dan berkedip saat digeser, dan watermark-nya berulang. Pilihan itu dibuang; peta interaktif memakai OpenFreeMap/OSM/PMTiles yang mulus di semua zoom. Static Maps tetap dipakai untuk gambar rute. `versionCode` **21902**
- 🇬🇧 **Route image coloured per leg + tap the map.** The shared route map now uses the line colours: red Transjakarta, blue MRT, purple LRT — so the number of transfers is visible from the image itself, not just the strip. The map band is taller so the route no longer shrinks. In the app, **tap anywhere on the map** to get "Start here" / "Go here"; the place name comes from Photon and fills the origin/destination field. `versionCode` **21902**
- 🇬🇧 **The Google raster basemap is gone.** Static Maps is not a tile server: as a basemap it always blurs while zooming, flickers while panning, and repeats its watermark. That option is removed; the interactive map uses OpenFreeMap/OSM/PMTiles, which stay sharp at every zoom. Static Maps is still used for the route image. `versionCode` **21902**

---

## ✦ v2.19.1 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Peta gaya Google diperbaiki, dua fitur dicabut.** Peta raster Google dulu disusun dari petak 256 px, dan tiap petak dihitung dari **sudut** petak bukan tengahnya — hasilnya titik bergeser dan makin ngawur tiap zoom, plus watermark "Map data ©… Google" berulang di setiap kotak. Kini gaya itu memakai **satu gambar per layar** yang digeoreferensi sebagai overlay: posisi tepat, satu atribusi, disegarkan setiap peta berhenti bergerak. Gambar rute yang dibagikan juga tidak lagi terpotong — pusat dan zoom dihitung sendiri, dan titik A/B digambar langsung di kartu supaya tidak terpotong tepi. Fitur **foto halte** dan **halte di sekitar saya** dicabut sesuai keputusan. `versionCode` **21901**
- 🇬🇧 **Google-style map fixed, two features removed.** The Google raster map used to be assembled from 256 px tiles, and each tile was centred on the tile's **corner** instead of its middle — so points drifted and got worse at every zoom, and the "Map data ©… Google" watermark repeated in every square. It now uses **one image per screen** georeferenced as an overlay: correct position, a single attribution, refreshed whenever the map settles. The shared route image is no longer cut either — centre and zoom are computed explicitly, and the A/B dots are drawn onto the card so the edges can't clip them. The **stop photo** and **stops around me** features are removed as decided. `versionCode` **21901**

---

## ✦ v2.19.0 — 13 November 2026 / 13 November 2026

- 🇮🇩 **Foto halte, halte di sekitar, dan peta di gambar rute.** Lembar halte kini menampilkan foto tempatnya bila Google punya (dengan kredit kecil di pojok). Tab **Halte** dapat tombol **Halte di sekitar saya**: satu ketuk, Lumi memakai GPS lalu menampilkan halte Transjakarta terdekat dalam 1,5 km — lengkap dengan jarak, foto, dan pasangan nama halte Lumi (`≈ Bundaran HI · 24 m`). Gambar rute yang dibagikan sekarang memuat peta asli: garis rute, titik A dan B, plus atribusi. Semua tambahan ini pelengkap — bila kunci Google ditolak atau tidak ada jaringan, ketiganya hilang sendiri dan aplikasi berjalan seperti biasa. `versionCode` **21900**
- 🇮🇩 **Audit titik halte.** Alat baru `tools/validate_stops.py` membandingkan 3.277 titik halte Lumi dengan Google Places. Hasilnya dipakai sebagai lencana jujur di lembar halte: *cocok* (≤ 60 m), *mungkin pindah* (60–400 m), atau *tidak ditemukan*. Halte yang bergeser jadi kelihatan sebelum pengguna yang menemukannya.
- 🇬🇧 **Stop photos, nearby stops, and a map on the shared route image.** The stop sheet now shows a photo when Google has one (small credit in the corner). The **Stops** tab gains a **Stops around me** button: one tap, Lumi reads GPS and lists the nearest Transjakarta stops within 1.5 km — with distance, photo, and the matching Lumi stop name (`≈ Bundaran HI · 24 m`). The shared route image now carries a real map: route line, points A and B, and attribution. All three are extras — if the Google key is rejected or there is no network, they disappear on their own and the app works as before. `versionCode` **21900**
- 🇬🇧 **Stop audit.** A new tool, `tools/validate_stops.py`, compares Lumi's 3,277 stop points against Google Places. The result is an honest badge in the stop sheet: *matches* (≤ 60 m), *may have moved* (60–400 m), or *not found*. Stops that drifted show up before a passenger finds them.

---

## ✦ v2.18.3 — 12 November 2026 / 12 November 2026

- 🇮🇩 **Perkiraan tiba bus yang masuk akal.** ETA dari feed armada kadang mencocokkan halte lain, sehingga bus yang masih ±13 km jauhnya (atau sudah melewati haltemu) tertulis "tiba ±5 mnt". Kini setiap ETA diperiksa terhadap jarak lurus bus ke halte (paling cepat ±45 km/jam): ETA yang mustahil diganti perkiraan Lumi dari posisi bus di rute, dan bus yang sudah lewat & masih jauh tidak ditampilkan — di detail perjalanan, layar halte, dan notifikasi "bus makin dekat". `versionCode` **21803**
- 🇬🇧 **Sensible bus arrival estimates.** The fleet feed's ETA sometimes matched a different stop, so a bus still ±13 km away (or already past your stop) showed "arriving ±5 min". Every ETA is now checked against the bus's straight-line distance to the stop (at most ±45 km/h): impossible ETAs are replaced by Lumi's own estimate from the bus's position on the route, and buses that have already passed and are still far away are no longer shown — in trip details, the stop screen and "bus approaching" notifications. `versionCode` **21803**

---

## ✦ v2.18.2 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Pendampingan tidak lagi tertutup paksa.** Penyebab sebenarnya ditemukan dari log crash: pemantau "bus makin dekat" yang ikut berjalan saat pendampingan dimulai mengirim langganan data armada dari thread utama, dan Android menghentikan aplikasi (`NetworkOnMainThreadException`). Kini semua pengiriman & penutupan koneksi feed bus berjalan di thread tersendiri, sehingga aman dipanggil dari mana pun (juga saat aplikasi ditutup). `versionCode` **21802**
- 🇬🇧 **Guidance no longer force-closes.** The real cause was found in the crash log: the "bus approaching" watcher that starts with guidance sent its fleet-feed subscription from the main thread, and Android killed the app (`NetworkOnMainThreadException`). All sending and closing of the bus-feed connection now runs on its own thread, so it is safe from anywhere (also when the app closes). `versionCode` **21802**

---

## ✦ v2.18.1 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Perbaikan pendampingan & halte satu arah.** Pendampingan tidak lagi tertutup paksa saat dimulai: gaya notifikasi progres Android 16 ("Live Update") dihapus karena sebagian ROM (mis. HyperOS) gagal menampilkannya lalu sistem menutup aplikasi; notifikasi kini memakai batang progres biasa, dan semua tombol notifikasi punya ikon. Di halte satu arah (mis. "Pancoran Arah Barat"), bus disaring dari daftar sisa halte bus itu sendiri — bus yang hanya menyebut pasangannya ("… Arah Timur") dianggap arah sebaliknya — dan bila nama halte tidak ada di data rute, hanya satu arah terdekat yang dipakai. `versionCode` **21801**
- 🇬🇧 **Guidance & one-way stop fixes.** Guidance no longer force-closes when it starts: the Android 16 progress notification style ("Live Update") was removed because some ROMs (e.g. HyperOS) fail to show it and the system then closes the app; the notification now uses a plain progress bar, and every notification button has an icon. At one-way stops (e.g. "Pancoran Arah Barat"), buses are filtered using the bus's own list of remaining stops — a bus that only lists the opposite stop ("… Arah Timur") is treated as going the other way — and when the stop name isn't in the route data, only the single nearest direction is used. `versionCode` **21801**

---

## ✦ v2.18.0 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Update langsung & bus yang benar-benar searah.** **Cek & pasang update** kini mengunduh APK terbaru dari rilis GitHub lalu membuka pemasang Android (sekali izinkan "Instal aplikasi tak dikenal"). Di **halte satu arah** (mis. "Pancoran Arah Timur") dan di **detail rute per arah**, bus arah sebaliknya tidak lagi tampil — arah bus ditentukan dari tujuan bus, urutan sisa haltenya, lalu arah hadapnya. Perbaikan: **pendampingan dengan panduan suara tidak lagi menutup aplikasi** (notifikasi progres dibangun ulang tanpa gaya Live Update bila sistem menolaknya, suara tidak bisa lagi menghentikan layanan, mesin suara terdeteksi di Android 11+); **layar izin muat satu layar** tanpa digulir, juga dengan huruf besar; jarak bagian di lembar halte seragam. Dihapus: widget (Berangkat/Pulang dan Bus favorit) serta fitur "Laporkan masalah" / "Laporkan halte/rute salah" beserta catatan crash. `versionCode` **21800**
- 🇬🇧 **In-app updates & buses that really go your way.** **Check & install update** now downloads the latest APK from the GitHub release and opens the Android installer (allow "Install unknown apps" once). At **one-way stops** (e.g. "Pancoran Arah Timur") and in a **route's per-direction view**, buses going the other way are no longer shown — a bus's direction comes from its destination, the order of its remaining stops, then its heading. Fixes: **guidance with voice on no longer closes the app** (the progress notification is rebuilt without the Live Update style if the system rejects it, speech can no longer stop the service, the speech engine is found on Android 11+); **the permissions screen fits on one screen** without scrolling, even with large text; even spacing on the stop sheet. Removed: widgets (Leave/Home and Favourite buses) and the "Report a problem" / "Report a wrong stop/route" features with the crash log. `versionCode` **21800**

---

## ✦ v2.17.0 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Peta tanpa internet & perjalanan lebih tenang.** **Peta offline Jabodetabek** (unduh sekali dari Pengaturan, dipakai otomatis saat sinyal hilang), **panduan suara dari layanan pendampingan** (juga saat layar mati), **notifikasi progres langsung** per ruas (Live Update di Android 16), **widget "Bus favorit"** dengan perkiraan tiba hingga 3 bus, **preferensi rute** (batas jalan kaki & pindah, moda yang dihindari, sembunyikan ojol, urutan bawaan), **rekap ongkos per bulan** per moda, **ekspor & impor data** ke satu berkas, dan **tarif dengan tanggal berlaku**. Perbaikan: notifikasi pengingat tampil seketika lalu dilengkapi info gangguan (tidak lagi menunggu internet hingga ±25 detik); pendampingan tidak tertutup bila izin lokasi dicabut; ID notifikasi pengingat, cek gangguan, dan gangguan favorit tidak lagi saling menimpa; layanan pendampingan berhenti rapi setelah tiba (GPS dimatikan, satu penunda); tombol "Berhenti" di notifikasi ikut bahasa; unduhan GTFS lewat berkas sementara + batas ukuran + CSV berkutip multi-baris; WebSocket mendeteksi EOF dan membatasi buffer; jembatan HTTP hanya ke HTTPS layanan yang dipakai; izin token CI dipersempit; README: Android 8.0+, ukuran APK sebenarnya. Uji unit Java (JUnit) kini berjalan di CI. `versionCode` **21700**
- 🇬🇧 **Maps without internet & calmer trips.** **Jabodetabek offline map** (download once from Settings, used automatically when you lose signal), **voice guidance from the guidance service** (even with the screen off), a **live progress notification** per leg (Live Update on Android 16), a **"Favourite buses" widget** with arrival estimates for up to 3 buses, **route preferences** (longest walk, most transfers, modes to avoid, hide ride-hailing, default order), a **monthly spending summary** by mode, **export & import** to a single file, and **fares with effective dates**. Fixes: reminder notifications appear instantly and are then completed with disruption info (no more waiting up to ±25 s for the network); guidance no longer crashes if location permission was revoked; reminder, disruption pre-check and favourite-disruption notification IDs no longer overwrite each other; the guidance service stops cleanly after arrival (GPS off, a single timer); the notification's "Stop" button follows the app language; GTFS downloads go through a temporary file with a size cap and multi-line quoted CSV support; the WebSocket client detects EOF and caps its buffer; the HTTP bridge only reaches HTTPS services Lumi uses; narrower CI token permissions; README: Android 8.0+, real APK size. Java unit tests (JUnit) now run in CI. `versionCode` **21700**

---

## ✦ v2.16.0 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Lebih siap untuk perjalanan sehari-hari.** **Bus makin dekat saat layar mati** (pemantau latar, juga otomatis saat pendampingan), **pengingat "waktunya berangkat"** yang mengecek gangguan 30 menit sebelumnya dan memantau bus pertama, **notifikasi gangguan untuk rute favorit** tanpa membuka aplikasi, **info gangguan layanan**, **simpan & ulangi perjalanan lengkap**, **cek saldo kartu NFC** (eksperimental: e-money, TapCash, Brizzi, Flazz gen 2, JakCard, KMT), **rute ramah kursi roda** + info lift/eskalator (OpenStreetMap), dan **mode gelap**. Perbaikan: posisiku bergerak langsung dengan senter arah di peta perjalanan; tautan Google Maps tanpa koordinat dicari lewat nama tempat (tidak lagi memakai posisimu); halte satu arah hanya menampilkan bus searah; garis jalan kaki pendampingan tidak menyilang; halte bisa diketuk di peta; mode hemat kuota bus tidak lagi mati permanen; versi dari satu sumber; satu tugas latar GTFS; cadangan adb dimatikan. `versionCode` **21600**
- 🇬🇧 **Ready for everyday trips.** **Bus-approaching alerts with the screen off** (background watcher, automatic during guidance), **"time to leave" reminders** that check disruptions 30 minutes ahead and watch the first bus, **disruption notifications for favourite routes** without opening the app, **service disruption info**, **save & repeat full trips**, **NFC card balance** (experimental: e-money, TapCash, Brizzi, Flazz gen 2, JakCard, KMT), **wheelchair-friendly routes** + lift/escalator info (OpenStreetMap), and **dark mode**. Fixes: your position moves live with a heading beam on the trip map; Google Maps links without coordinates are resolved by place name (no longer your own position); one-way stops only show buses going that way; guidance walking lines no longer cross over; stops can be tapped on the map; the bus feed's data-saving mode can't switch off permanently; single version source; one GTFS background job; adb backup disabled. `versionCode` **21600**

---

## ✦ v2.14.0 — 11 November 2026 / 11 November 2026

- 🇮🇩 **Saran alamat langsung dari Google.** Kunci API internal aplikasi Google Maps (dari APK 26.44.06) dipakai dengan meniru header `X-Android-Package`/`X-Android-Cert`, jadi saran alamat muncul langsung saat mengetik di kolom Dari/Ke, lengkap dengan koordinat, dan tersimpan seperti biasa. Ada pilihan peta **Google Maps** (raster) di Pengaturan. Kalau Google mencabut kunci, semuanya otomatis kembali ke Photon/OpenStreetMap. Bukti lengkap di `docs/google-api-keys.md`. `versionCode` **21400**
- 🇬🇧 **Address suggestions straight from Google.** Google Maps' internal API key (from APK 26.44.06) is used with spoofed `X-Android-Package`/`X-Android-Cert` headers, so suggestions appear while typing in From/To, coordinates included, and get saved as usual. Settings also offers a **Google Maps** raster basemap. If Google revokes the key, everything falls back to Photon/OpenStreetMap. Full evidence in `docs/google-api-keys.md`. `versionCode` **21400**

---

## ✦ v2.13.4 — 10 November 2026 / 10 November 2026

- 🇮🇩 Perapian hasil audit: GTFS resmi Transjakarta & koreksi titik OSM ikut di aplikasi (semua rute langsung lengkap), tarif satu sumber yang bisa diperbarui dari repo, data jarak jauh divalidasi, peta & layanan pihak ketiga punya cadangan, laporan bug melampirkan galat terakhir, sambutan & judul hasil tidak terjepit, ikon bertema. CI: hanya Gradle, lint, uji semua layar + terjemahan, action dikunci SHA. `versionCode` **21304**
- 🇬🇧 Audit tidy-up: official Transjakarta GTFS and OSM stop fixes bundled in the app (every route complete out of the box), single-source fares updatable from the repo, remote data validated, fallbacks for the map and third-party services, bug reports include recent errors, welcome screen and results title no longer cramped, themed icon. CI: Gradle only, lint, all-screens + translation check, actions pinned to SHAs. `versionCode` **21304**

---

## ✦ v2.13.3 — 10 November 2026 / 10 November 2026

- 🇮🇩 Perbaikan hasil audit: lokasi lebih tepat (cache lama tidak dipakai, GPS + jaringan bersamaan) dan posisi di bus langsung dikirim terus-menerus; semua waktu memakai WIB; daftar bus langsung tidak melompat saat digulir; ganti bahasa tidak menghapus pencarian; teks "tiap jam" → "berkala"; alat debug mati di rilis. CI: uji mesin rute dengan pemeriksaan, uji asap emulator, rilis wajib bertanda tangan resmi. `versionCode` **21303**
- 🇬🇧 Audit fixes: more accurate location (stale cache ignored, GPS + network together) and continuous position updates in live buses; all times use WIB; live bus list no longer jumps while scrolling; changing language keeps the open route search; "hourly" wording → "regularly"; debug hooks off in release builds. CI: engine test with real assertions, emulator smoke test, releases must be signed with the official key. `versionCode` **21303**

---

## ✦ v2.13.2 — 10 November 2026 / 10 November 2026

- 🇮🇩 Bus langsung: posisiku ikut bergerak + senter arah, filter per kode rute, chip berisi jumlah bus sekitar, label kode seragam (JAK71). Perkiraan tiba dihitung juga dari posisi bus di rute dan dibandingkan dengan ETA feed. Perbaikan: sambutan tidak berkedip ke beranda, garis pendampingan tidak berkedip. `versionCode` **21302**
- 🇬🇧 Live buses: my position follows with a heading beam, per-route filter, chips with nearby bus counts, consistent route codes (JAK71). Arrival estimates are now also computed from the bus position along the route and checked against the feed ETA. Fixes: welcome screen no longer flashes the home screen; guidance lines no longer flicker. `versionCode` **21302**

---

## ✦ v2.13.1 — 10 November 2026 / 10 November 2026

- 🇮🇩 Perbaikan: aplikasi 2.13 langsung tertutup saat dibuka di Android 11–14 (controller system bar diminta sebelum jendela siap). `versionCode` **21301**
- 🇬🇧 Fix: 2.13 crashed on launch on Android 11–14 (system-bar controller requested before the window existed). `versionCode` **21301**

---

## ✦ v2.13 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- Ketuk halte/stasiun di tab Halte: Berangkat dari sini, Pergi ke sini, Lihat posisi bus (khusus halte bus)
- Tombol ☆ Simpan di hasil pencarian untuk rute favorit

### 🔧 Perbaikan

- Posisi bus untuk satu halte hanya menampilkan rute yang berhenti di halte itu, bus yang akan tiba di atas
- Penanda bus: panah di titik bus, kode di bawah, ukuran ikut zoom
- Header menyatu dengan status bar (Android 11+)
- Penanda warna kartu tarif sejajar judul; jarak seragam di detail perjalanan dan Pengaturan

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- Tap a stop/station in Stops: Leave from here, Go here, See bus positions (bus stops only)
- ☆ Save button in search results for favourite routes

### 🔧 Fixes

- Live buses for a stop only show routes serving that stop, arriving buses first
- Bus markers: arrow on the bus position, code below, size follows zoom
- Header blends into the status bar (Android 11+)
- Fare-card colour markers aligned with titles; consistent spacing in trip details and Settings

</details>

---
## ✦ v2.12 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### 🔧 Perbaikan

- Header tidak lagi menabrak status bar (inset dikirim saat halaman siap, juga untuk detail rute dan layar sambutan)
- Header dan menu bawah tidak lagi membesar saat mengetik (inset dalam dp; keyboard mengecilkan layar, menu bawah disembunyikan)
- Ikon fitur layar sambutan tepat di tengah kotak
- Jarak keterangan di kartu Bahasa diperlebar
- **Mulai cari rute** terkunci sampai lokasi, notifikasi, dan latar belakang diizinkan; izin yang ditolak permanen membuka info aplikasi

### ✨ Baru

- Terjemahan bahasa Inggris menyeluruh, termasuk gambar/teks yang dibagikan, notifikasi, panduan suara, dan pesan galat

### 🔧 Teknis

- `versionCode` **21200**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### 🔧 Fixes

- Header no longer collides with the status bar (insets sent once the page is ready, also used by route details and the welcome screen)
- Header and bottom menu no longer grow while typing (insets in dp; the keyboard resizes the screen and the bottom menu hides)
- Welcome-screen feature icons are centred in their boxes
- More spacing under the Language selector
- **Start planning** stays locked until location, notifications and background access are allowed; permanently denied permissions open app info

### ✨ New

- Complete English translation, including shared images/text, notifications, voice guidance and error messages

### 🔧 Technical

- `versionCode` **21200**

</details>

---
## ✦ v2.11 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### 🔧 Perbaikan

- Warna header menyambung ke status bar; jarak ke navigation bar tidak dobel
- Logo header memakai ikon aplikasi baru
- Tentang Lumi pindah ke Pengaturan
- Jarak teks dan checkbox Aksesibilitas diperlebar
- Saran alamat OpenStreetMap dihapus (kembali ke alur Bagikan Google Maps)

### ✨ Baru

- Mengetuk halte membuka bus langsung pada titik halte itu
- Kamus bahasa Inggris diperluas untuk Pengaturan, Tentang, live bus, riwayat, favorit

### 🔧 Teknis

- `versionCode` **21100**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### 🔧 Fixes

- Header colour now runs into the status bar; the gap above the navigation bar is no longer doubled
- Header logo uses the new app icon
- About moved into Settings
- More spacing between labels and checkboxes under Accessibility
- OpenStreetMap suggestions removed (back to the Google Maps share flow)

### ✨ New

- Tapping a stop opens live buses at that stop
- Broader English dictionary for Settings, About, live buses, history and favourites

### 🔧 Technical

- `versionCode` **21100**

</details>

---
## ✦ v2.10 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### 🔧 Perbaikan

- Layar tidak lagi terpotong status bar / navigation bar (padding dipindah ke root tampilan)
- Logo onboarding memakai ikon baru; ikon fitur berukuran seragam dan di tengah
- Teks dan kotak centang Mode aksesibel / Panduan suara sejajar

### ✨ Baru

- **Rute favorit di beranda** menggantikan Tujuan populer (satu ketuk langsung hitung rute)
- **Tab Halte**: cari halte/stasiun, ketuk untuk membuka peta
- **Tab Riwayat**: riwayat perjalanan + ongkos bulanan
- Navigasi bawah: Perjalanan · Rute · Halte · Tarif · Riwayat

### 🔧 Teknis

- `versionCode` **21000**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### 🔧 Fixes

- Screen no longer clipped by the status/navigation bars (padding moved to the content root)
- Onboarding uses the new app icon; feature icons share one size and are centred
- Accessible mode / voice guidance labels and checkboxes are aligned

### ✨ New

- **Favourite routes on the home screen** replace popular destinations (one tap computes the route)
- **Stops tab**: search a stop or station, tap to open it on the map
- **History tab**: trip history with monthly fares
- Bottom navigation: Trip · Routes · Stops · Fares · History

### 🔧 Technical

- `versionCode` **21000**

</details>

---
## ✦ v2.9 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Bahasa Inggris pada hasil rute**: Fastest / Cheapest / Fewest transfers, Leaving now / Arrive before, public transport options / ride-hailing options, tombol Edit & Clear
- **Baseline profile** ikut di APK untuk mempercepat startup

### 🔧 Teknis

- CI memeriksa `baseline.prof` benar-benar dikemas di APK
- `versionCode` **20900**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **English in route results**: Fastest / Cheapest / Fewest transfers, Leaving now / Arrive before, public transport options / ride-hailing options, Edit & Clear buttons
- **Baseline profile** shipped in the APK for faster startup

### 🔧 Technical

- CI verifies `baseline.prof` is actually packaged in the APK
- `versionCode` **20900**

</details>

---

## ✦ v2.8 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Laporkan halte/rute salah** dari detail perjalanan; issue sudah terisi asal/tujuan, koordinat, kode rute, versi, dan user agent
- **Bahasa Inggris diperluas** ke langkah perjalanan (*Get ready to alight*, *Alight now*, *Walk*, *Depart*, *Arrive*, *Board*, *Alight*) dan satuan menit/transit

### 🔧 Teknis

- `versionCode` **20800**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Report a wrong stop/route** from the trip detail; the issue is pre-filled with origin/destination, coordinates, route codes, version and user agent
- **Broader English coverage**: trip steps (*Get ready to alight*, *Alight now*, *Walk*, *Depart*, *Arrive*, *Board*, *Alight*) plus minute/transfer units

### 🔧 Technical

- `versionCode` **20800**

</details>

---

## ✦ v2.7 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Panduan suara**: langkah pendampingan dibacakan, hanya saat berubah; berhenti bersama pendampingan
- **Tata letak dua panel** untuk tablet/foldable: daftar langkah di kiri, peta di kanan

### 🔧 Teknis

- `versionCode` **20700**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Voice guidance**: guidance steps are spoken, only when they change, and stop with the guidance
- **Two-pane layout** for tablets/foldables: steps on the left, map on the right

### 🔧 Technical

- `versionCode` **20700**

</details>

---

## ✦ v2.6 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Pilihan bahasa Indonesia / English** di Pengaturan
- Terjemahan mencakup header, kolom asal-tujuan, tombol, tab, navigasi, judul sheet, kartu Pengaturan, dan Tentang
- Bahasa awal mengikuti bahasa HP; mengganti balik ke Indonesia memulihkan teks asli

### 🔧 Teknis

- `versionCode` **20600**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Indonesian / English language switch** in Settings
- Translation covers the header, origin/destination fields, buttons, tabs, navigation, sheet titles, Settings cards and About
- The initial language follows the phone; switching back to Indonesian restores the original text

### 🔧 Technical

- `versionCode` **20600**

</details>

---

## ✦ v2.5 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Mode aksesibel**: area sentuh minimal 52 px, teks diperbesar, animasi mengikuti setelan "kurangi animasi" HP

### 🔧 Teknis

- **targetSdk 35** dengan **edge-to-edge**: konten WebView diberi padding setinggi status bar + navigation bar
- Sisa kode migrasi gaya peta pra-2.0 dihapus
- `versionCode` **20500**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Accessible mode**: minimum 52 px tap targets, larger text, animations follow the system "reduce motion" setting

### 🔧 Technical

- **targetSdk 35** with **edge-to-edge**: the WebView is padded by the status and navigation bar heights
- Remaining pre-2.0 map-style migration code removed
- `versionCode` **20500**

</details>

---

## ✦ v2.4 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Widget "Berangkat / Pulang"**: dua tombol di layar utama, langsung membuka kolom asal atau tujuan
- **Cadangkan & pulihkan**: bagikan cadangan berisi pengaturan, favorit, riwayat, dan tempat tersimpan; pulihkan dengan menempel teksnya

### 🔧 Teknis

- Job rilis menolak tag yang tidak menunjuk kepala `main`
- `versionCode` **20400**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **"Leave / Home" widget**: two home-screen buttons that open the origin or destination field
- **Backup & restore**: share a backup containing settings, favourites, history and saved places; restore by pasting the text

### 🔧 Technical

- Release job rejects tags that do not point at the head of `main`
- `versionCode` **20400**

</details>

---

## ✦ v2.3 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Rute favorit**: simpan asal → tujuan (maks 20), lalu hitung ulang dengan satu ketuk **Pakai**
- **App shortcuts**: tekan lama ikon → **Cari rute** atau **Riwayat**
- **Ubin Quick Settings "Cari rute"**: satu ketuk dari panel notifikasi

### 🔧 Teknis

- Pintasan dari intent disimpan sampai halaman WebView siap, lalu dikirim ke `window.__lumiShortcut`
- `versionCode` **20300**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Favourite routes**: save origin → destination (max 20), recompute with one tap
- **App shortcuts**: long-press the icon → **Search route** or **History**
- **Quick Settings tile "Search route"**

### 🔧 Technical

- Intent shortcuts are held until the WebView page is ready, then delivered to `window.__lumiShortcut`
- `versionCode` **20300**

</details>

---

## ✦ v2.2 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Tentang Lumi** kini menampilkan versi otomatis, lisensi GPL-3.0, tautan repo, tombol **Cek update** (GitHub Releases), dan **Laporkan masalah** (issue baru berisi versi + user agent)
- **Riwayat perjalanan & ongkos**: tiap pendampingan yang dimulai tercatat (asal, tujuan, tanggal, menit, ongkos, moda), lengkap dengan ringkasan **bulan berjalan** dan tombol hapus

### 🔧 Perbaikan

- Teks setelan alamat: pencarian OpenStreetMap di aplikasi sebagai cara utama, Google Maps lewat Bagikan sebagai cadangan
- `versionCode` **20200**

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **About** now shows the automatic version, GPL-3.0 licence, repository link, **Check for updates** (GitHub Releases) and **Report an issue** (prefilled version + user agent)
- **Trip history & fares**: each started guidance session is recorded (origin, destination, date, minutes, fare, modes), with a **current month** summary and a clear button

### 🔧 Fixes

- Address settings text: in-app OpenStreetMap search first, Google Maps via Share as fallback
- `versionCode` **20200**

</details>

---

## ✦ v2.1 — 9 November 2026 / 9 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Cari alamat di dalam aplikasi**: ketik ≥ 3 huruf di kolom asal/tujuan dan saran alamat muncul langsung dari **OpenStreetMap (Photon)** — tanpa API key, tanpa keluar aplikasi
- Hasil disaring ke **Indonesia** dengan bias **Jabodetabek**
- Baris **"Cari … di Google Maps"** dan alur **Bagikan → Lumi Transport** tetap ada untuk alamat yang tidak ditemukan OSM

### 🔧 Teknis

- Build pindah ke **Gradle 8.7** + `gradle/libs.versions.toml` (satu katalog versi)
- **R8 + `shrinkResources`** aktif, dengan aturan keep untuk jembatan `LumiNative`
- Rilis APK diambil dari build Gradle; `versionCode` **20100**
- **User-Agent tunggal** dari `versionName`

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **In-app address search**: type at least 3 characters in the origin/destination field and suggestions appear from **OpenStreetMap (Photon)** — no API key, no leaving the app
- Results filtered to **Indonesia** and biased to **Greater Jakarta**
- The **"Search … on Google Maps"** row and the **Share → Lumi Transport** flow remain for addresses OSM does not have

### 🔧 Technical

- Build moved to **Gradle 8.7** + `gradle/libs.versions.toml`
- **R8 + `shrinkResources`** enabled, with keep rules for the `LumiNative` bridge
- Release APK now comes from the Gradle build; `versionCode` **20100**
- **Single User-Agent** derived from `versionName`

</details>

---

## ✦ v2.0 — rilis pertama

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Perencana perjalanan semua moda Jabodetabek**: Transjakarta, Mikrotrans, Royaltrans, Transjabodetabek, KRL, MRT, LRT Jabodebek, KA Bandara, Whoosh, dan ojol dalam satu rute
- **Semua kombinasi rute** ditampilkan sebagai opsi sendiri, dengan urutan Tercepat (angkutan umum), Termurah, dan Minim transit
- **Posisi bus langsung**: bus di sekitarmu, bus berikutnya tiba di halte naik, dan semua bus satu rute
- **Pendampingan GPS** dengan pengingat "Siap-siap turun" dan "Turun sekarang", termasuk saat layar mati
- **Tarif akurat** untuk Transjakarta, Mikrotrans, MRT, LRT Jabodebek, KA Bandara, SH2, dan Hub Connector
- **Notifikasi perubahan rute** dari pemeriksaan data resmi tiap jam
- **Bagikan rute sebagai gambar** ke WhatsApp, Instagram, atau aplikasi lain
- **Ringkasan GTFS terbaru di dalam APK**, jadi aplikasi langsung lengkap tanpa unduhan pertama

### 🔧 Teknis

- `applicationId` `id.lumi.transport`, nama **Lumi Transport**
- **minSdk 26** (Android 8.0+), targetSdk 34
- `versionName` dari `release-notes/CURRENT`, `versionCode` deterministik: `2.0` → 20000, `2.1` → 20100, `2.1.1` → 20101
- Perhitungan rute berjalan di HP, tanpa server

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Multi-modal trip planner for Greater Jakarta**: Transjakarta, Mikrotrans, Royaltrans, Transjabodetabek, KRL, MRT, LRT Jabodebek, Airport Rail, Whoosh, and ride-hailing in a single trip
- **Every sensible combination** shown as its own option, sortable by Fastest (public transport), Cheapest, or Fewest transfers
- **Live bus positions**: buses around you, the next bus arriving at your boarding stop, and all buses on a route
- **GPS guidance** with "Get ready to alight" and "Alight now" reminders, even with the screen off
- **Accurate fares** for Transjakarta, Mikrotrans, MRT, LRT Jabodebek, Airport Rail, SH2, and Hub Connector
- **Route change notifications** from hourly checks of the official data
- **Share a trip as an image** to WhatsApp, Instagram, or any other app
- **Latest GTFS summary bundled in the APK**, so the app is complete without a first download

### 🔧 Technical

- `applicationId` `id.lumi.transport`, name **Lumi Transport**
- **minSdk 26** (Android 8.0+), targetSdk 34
- `versionName` from `release-notes/CURRENT`, deterministic `versionCode`: `2.0` → 20000, `2.1` → 20100, `2.1.1` → 20101
- Routing runs on-device, no server

</details>
