<div align="center">

# 📝 Catatan Perubahan · Changelog

**🌐 Bahasa / Language:** ketuk bagian di bawah untuk membuka / tap a section below to expand it

[⬅️ README (ID)](README.md) · [⬅️ README (EN)](README.en.md)

</div>

---

## ✦ v2.4 — 7 November 2026 / 7 November 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Posisi bus langsung kembali**, kali ini benar-benar tersambung: layar **Bus di sekitarmu**, perkiraan **bus berikutnya tiba di halte naik** pada detail perjalanan, dan **semua bus satu rute** di detail rute
- **Notifikasi "bus makin dekat"**: begitu kamu membuka detail perjalanan, Lumi memberi tahu saat bus berikutnya tinggal **±10, ±5, ±2 menit**, dan saat **sudah tiba** di halte naikmu (sekali per bus, tidak berulang)
- **ETA presisi per halte**: ID halte naik/turun diambil sekali dari REST TJ (`/v1/bus-stop`), lalu ETA dibaca dari `eta_by_parent_stop_id` milik bus — bukan lagi menebak lewat nama halte
- Sumbernya feed armada Transjakarta yang sama dengan aplikasi resmi TJ (MQTT `wss://mqtt.tj.co.id:8084/mqtt`), lewat koneksi native (WebSocket + MQTT) supaya tidak bergantung WebSocket WebView
- Hanya rute yang sedang dilihat yang diunduh; pemakaian kuota ditampilkan di layar (mis. "25 bus aktif · 0,8 MB")

### 🐞 Perbaikan

- **Satuan ETA diperbaiki**: nilai `eta` dari feed adalah **menit**, bukan detik. Sebelumnya hampir semua bus tampil "tiba"; sekarang tampil "±3 mnt", "±12 mnt", dan seterusnya
- Penyebab fitur ini dulu dihapus sudah ditemukan: broker armada hanya menerima koneksi anonim bila **client ID diawali `mqttjs_`**. Client ID `lumi_…` dijawab server dengan CONNACK kode 5 (not authorized), sehingga koneksi selalu gagal walau jaringan normal
- Bila feed tetap tidak bisa dihubungi (mis. di luar jam operasi), Lumi menampilkan sebabnya + tombol **Buka aplikasi TJ**, bukan layar kosong

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Live bus positions are back, and this time they really connect**: **Buses near you**, **next bus at your boarding stop** on trip details, and **every bus on a route** on route details
- **"Bus is getting closer" notifications**: open a trip and Lumi tells you when the next bus is about **±10, ±5, ±2 minutes** away and when it has **arrived** at your boarding stop (once per bus, no repeats)
- **Precise per-stop ETA**: your boarding and alighting stop IDs are fetched once from the TJ REST API (`/v1/bus-stop`), then the ETA is read from the bus's `eta_by_parent_stop_id` instead of guessing by stop name
- Data comes from the same Transjakarta fleet feed the official TJ app uses (MQTT `wss://mqtt.tj.co.id:8084/mqtt`) over a native connection (WebSocket + MQTT), independent of the WebView WebSocket
- Only the routes you are looking at are downloaded; data use is shown on screen (e.g. "25 active buses · 0.8 MB")

### 🐞 Fixes

- **ETA units fixed**: the feed's `eta` value is **minutes**, not seconds. Previously almost every bus showed "arriving now"; now it shows "±3 min", "±12 min", and so on
- Root cause of the earlier removal found: the fleet broker only accepts anonymous connections when the **client ID starts with `mqttjs_`**. A `lumi_…` client ID is answered with CONNACK code 5 (not authorized), so the connection always failed even on a good network
- If the feed still cannot be reached (e.g. outside operating hours), Lumi explains why and offers an **Open TJ app** button instead of an empty screen

</details>

---

## ✦ v2.3 — 29 Oktober 2026 / 29 October 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

- Pendampingan: rute yang sudah dilewati menghilang, jalan kaki dimulai dari posisimu sekarang, mode PiP dengan peta (menutup PiP menutup aplikasi), senter arah hadap, lokasi tidak hilang saat kartu diketuk, pop-up "GPS belum aktif"
- Riwayat dengan "Lokasi saya" memakai posisi GPS sekarang
- Peta pendampingan mengikuti posisimu (zoom langsung ke posisimu), bisa digeser + tombol Pusatkan; senter berputar mulus; menutup aplikasi menghentikan pendampingan; perbaikan peta setelah PiP
- Tombol **Bersihkan** di hasil pencarian untuk kembali ke beranda; **Tampilkan semua opsi** tidak lagi melompat ke atas
- Hasil rute tanpa pemborosan: rute sama dengan halte lebih jauh/lebih lama dibuang, rute bolak-balik dibuang
- Warna pembeda untuk rute berturut-turut yang warnanya sama; teks pindah di halte yang sama menyebut rute berikutnya
- Info rute dikelompokkan rapi (TJ, Mikrotrans, Royaltrans, Transjabodetabek, kereta)
- Tarif LRT Jabodebek mengikuti jam: jam sibuk maks. Rp20.000, di luar jam sibuk & akhir pekan maks. Rp10.000
- Fitur posisi bus di dalam Lumi dihapus; tiap ruas bus punya tombol **Lihat posisi bus di aplikasi TJ** (aplikasi TJ atau Play Store)

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

- Guidance: passed route disappears, walk starts from your current location, picture-in-picture with map (closing it closes the app), compass beam, location dot kept, "GPS is off" prompt
- History entries with "My location" use your current GPS position
- Guidance map follows you (zooms to you on start), free panning with a Recenter button; smooth 360° compass beam; closing the app stops guidance; map fixes after PiP
- **Clear** button on results; **Show all options** keeps your scroll position
- No wasteful results: same-route options with worse stops and back-and-forth routes removed
- Distinct colors for consecutive same-colored routes; clearer same-stop transfers; route list grouped cleanly
- Time-based LRT Jabodebek fares (peak max Rp20,000, off-peak/weekend max Rp10,000)
- In-app live bus positions removed; each bus leg links to the official TJ app (or the Play Store)

</details>

---

## ✦ v2.2 — 29 Oktober 2026 / 29 October 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### 🐞 Perbaikan

- Bus langsung tersambung lewat koneksi native Android; bila gagal, tampil penyebab dan tombol **Lihat di aplikasi TJ**
- Pola memutar di GTFS resmi (184 dari 240 rute) dipecah menjadi dua arah utama; pola lain menjadi varian berketerangan

### ⚡ Peningkatan

- Pencarian rute 3–7× lebih cepat dengan data resmi
- Pemantau perubahan rute (GitHub Actions) aktif dan mencatat status; ringkasan GTFS di cabang `gtfs-data`

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

- Live buses connect via a native Android connection, with a clear error and an **Open TJ app** fallback
- Loop-shaped official GTFS patterns split into two main directions with described variants
- Route search 3–7× faster; route-change watcher running with status file and `gtfs-data` branch

</details>

---

## ✦ v2.1 — 29 Oktober 2026 / 29 October 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Posisi bus langsung** (Transjakarta, Mikrotrans, Royaltrans) dari feed armada Transjakarta: layar **Bus di sekitarmu**, perkiraan **bus berikutnya** di halte naik pada detail perjalanan, dan semua bus rute di detail rute
- **Keterangan varian** yang jelas: via Tol, lewat X, tanpa X, mulai X, putar balik di X

### ⚡ Peningkatan

- Nama trayek resmi (mis. 9N Pinang Ranti – Simpang Cawang); rute memutar dipecah menjadi dua arah
- Daftar rute: label 24 jam rata kanan, nama rute tidak terpotong
- Gambar rute: ikon orang berjalan untuk langkah jalan kaki
- Logo dengan gradasi biru yang lebih halus

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Live bus positions** (Transjakarta, Mikrotrans, Royaltrans): **Buses near you**, next-bus ETA on trip details, and all buses on route details
- Clear **variant descriptions**: via toll, via X, skips X, starts at X, turns back at X

### ⚡ Improvements

- Official route names (e.g. 9N Pinang Ranti – Simpang Cawang); loop routes split into two directions
- Route list: 24-hour label right-aligned, names no longer truncated
- Route image: walking icon for walking steps
- Smoother blue logo gradient

</details>

---

## ✦ v2.0 — 29 Oktober 2026 / 29 October 2026

<details open>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

### ✨ Baru

- **Bagikan rute sebagai gambar**: tombol *Bagikan rute* di setiap kartu hasil dan di detail perjalanan. Yang terkirim adalah gambar berisi asal → tujuan, total waktu & tarif, strip moda, serta jam naik, arah, tempat turun, dan tarif tiap langkah
- **Layar sambutan** dan **"Satu langkah lagi"** saat pertama dibuka, masing-masing muat dalam satu layar tanpa scroll: izin lokasi, notifikasi, berjalan di latar belakang, dan pintasan *Mulai otomatis* untuk Xiaomi, Oppo, Vivo, Realme, dan Infinix
- **Perubahan rute terdeteksi tiap jam**: GitHub Actions memeriksa GTFS resmi Transjakarta tiap jam dan menulis `data/route_changes.json`; aplikasi membaca umpan ini serta tanda versi file GTFS tiap jam, lalu memberi notifikasi dan memperbarui data rute

### 💸 Tarif

- SH2 Blok M – Bandara Soetta Rp15.000 (sejak 1 Sep 2026); SH1 dan Transjabodetabek lain tetap Rp3.500
- Hub Connector (HC2 PIK 2 – Dukuh Atas) Rp20.000
- MRT dihitung per stasiun: Rp3.000 + Rp1.000 per stasiun, maks. Rp14.000
- KA Bandara: Duri Rp70.000; Manggarai – BNI City Rp10.000
- Whoosh mulai Rp250.000 (tarif dinamis)
- Catatan penyesuaian tarif Transjakarta 1 Januari 2027 dan Perpres ojol 27/2026

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

### ✨ New

- **Share routes as images** from every result card and the trip screen
- **Welcome** and **"One more step"** screens on first launch, each fitting on one screen: location, notifications, background running, and an *Auto-start* shortcut for Xiaomi, Oppo, Vivo, Realme and Infinix
- **Hourly route-change detection**: GitHub Actions checks the official Transjakarta GTFS every hour and writes `data/route_changes.json`; the app reads this feed and the GTFS file signature every hour, then notifies you and refreshes route data

### 💸 Fares

- SH2 Blok M – Soekarno-Hatta Airport Rp15,000 (since 1 Sep 2026); SH1 and other Transjabodetabek routes stay at Rp3,500
- Hub Connector (HC2 PIK 2 – Dukuh Atas) Rp20,000
- MRT priced per station: Rp3,000 + Rp1,000 per station, max Rp14,000
- Airport Rail: Duri Rp70,000; Manggarai – BNI City Rp10,000
- Whoosh from Rp250,000 (dynamic pricing)

</details>

---

## ✦ v1.8 — 29 Oktober 2026 / 29 October 2026

<details>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

- **Mode pendampingan GPS**: posisi di peta, sisa pemberhentian, peringatan "Siap-siap turun" dan "Turun sekarang" dengan getar, tetap berjalan saat layar mati
- **Filter hasil**: urutkan Tercepat/Termurah/Minim transit dan pilih moda (opsi yang mengandung moda terpilih)
- **Pembaruan rute harian** dengan catatan perubahan (rute baru, dihapus, halte berubah)
- Membaca lokasi dari Google Maps lebih cepat (beberapa cara berjalan bersamaan + cache)
- Rute duplikat dihapus; tema biru muda dan logo gradasi biru

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

- **GPS guidance mode** with stops left, "Get ready" and "Get off now" alerts, working with the screen off
- **Result filters** for sort order and modes
- **Daily route updates** with a change log
- Faster Google Maps location reading; duplicate routes removed; light-blue theme and new logo

</details>

---

## ✦ v1.7 — Oktober 2026 / October 2026

<details>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

- Tarif TJ berbasis halte: pindah di dalam halte gratis, turun di luar halte bayar lagi
- 9 dan 9A sebagai opsi terpisah; varian **koridor 9 via Tol** (tidak berhenti di Kemanggisan s.d. Jembatan Dua)
- Penjelajahan semua kombinasi dua rute (mis. 9/9C → Makasar → JAK36/JAK108, LRT → TMII → JAK36)
- Rute memutar ditangani benar; tidak ikut bus memutar demi jalan kaki lebih pendek
- GTFS resmi Transjakarta diunduh otomatis

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

- Station-based TJ fares; routes 9 and 9A as separate options; corridor 9 via-toll variant
- Every two-route combination explored; loop routes handled correctly
- Official Transjakarta GTFS downloaded automatically

</details>

---

## ✦ v1.0 – v1.6 — Oktober 2026 / October 2026

<details>
<summary><h2>🇮🇩 Bahasa Indonesia</h2></summary>

- Rilis awal: perencana rute multimoda offline (Transjakarta, Mikrotrans, Royaltrans, KRL, MRT, LRT, KA Bandara, Whoosh, ojol)
- Info rute dengan urutan halte dan rute sambungan
- Jam berangkat/tiba dengan jam operasional tiap moda (AMARI 24 jam)
- Input alamat lewat Google Maps (Bagikan ke Lumi), CARTO Basemaps API key di Pengaturan
- Kombinasi Mikrotrans + LRT dan semua opsi angkutan umum

</details>

<details>
<summary><h2>🇬🇧 English</h2></summary>

- First releases: offline multimodal planner, route info, operating hours, Google Maps address input, CARTO Basemaps key setting

</details>
