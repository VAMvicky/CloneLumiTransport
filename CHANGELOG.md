<div align="center">

# 📝 Catatan Perubahan · Changelog

**🌐 Bahasa / Language:** ketuk bagian di bawah untuk membuka / tap a section below to expand it

[⬅️ README (ID)](README.md) · [⬅️ README (EN)](README.en.md)

</div>

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
