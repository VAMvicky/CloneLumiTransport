# Kereta, gangguan layanan & berbagi perjalanan (v2.15)

Panduan pengelola untuk fitur yang datanya diatur dari repo, tanpa rilis APK baru.
Semua berkas di `data/` diambil aplikasi dari `raw.githubusercontent.com` dan **diperiksa dulu**
(aturannya sama dengan `tools/check_remote.py`, yang juga dijalankan CI). Berkas yang tidak lolos diabaikan.

| Berkas | Diambil aplikasi | Isi |
|---|---|---|
| `data/remote_config.json` | tiap ≥ 6 jam | versi klien TJ, daftar feed GTFS-Realtime, alamat relay & penampil berbagi |
| `data/disruptions.json` | tiap ≥ 30 menit (saat aplikasi terbuka) | info gangguan layanan |
| `data/rail_schedule.json` | tiap ≥ 24 jam, atau bila `remote_config.updated` berubah | jadwal pasti kereta |

---

## 1. Versi klien Transjakarta (`x-app-version`)

Feed posisi bus & REST Transjakarta memeriksa versi aplikasi klien. Angkanya **hanya** ditulis di
`gradle.properties` → `lumi.tjClientVersion` (masuk ke `BuildConfig.TJ_CLIENT_VERSION` dan `js/build.js`).

Bila TJ menaikkan versi minimum sebelum rilis berikutnya: ubah `"tjClientVersion"` di
`data/remote_config.json`. Aplikasi yang sudah terpasang memakainya dalam ≤ 6 jam (native menyimpannya
lewat `AppInfo.setTjClientVersion`). Naikkan juga `gradle.properties` untuk rilis berikutnya.
`tools/test_version.sh` gagal bila ada angka versi tertanam lagi di kode.

---

## 2. Jadwal pasti kereta (`data/rail_schedule.json`)

Dibuat `tools/rail_schedule.py` (workflow **Jadwal kereta**, tiap hari 02.43 WIB). Sumber diatur lewat
**Settings → Secrets and variables → Actions → Variables**:

- `COMULINE_API` — mis. `https://www.api.comuline.com/v1`. API komunitas [Comuline](https://github.com/comuline/api)
  yang menyalin jadwal resmi KAI Commuter tiap hari. Jadwal per stasiun digabung per nomor KA.
- `RAIL_GTFS` — GTFS statis berformat `MODA=URL,...`, mis. `MRT=https://…/gtfs.zip`. `stop_times.txt` dibaca per perjalanan.

Setiap perjalanan dicocokkan ke rute & arah Lumi lewat nama stasiun (lihat `ALIAS` di skrip untuk nama
yang berbeda). Tanpa sumber, berkas tetap kosong dan aplikasi memakai perkiraan headway seperti sebelumnya.

Di aplikasi: ruas kereta berjadwal diberi tanda **JADWAL**, waktu tunggu & tiba mengikuti perjalanan
terjadwal pertama yang terkejar, kartu ruas menampilkan nomor KA + keberangkatan berikutnya, dan
"Tiba sebelum" memundurkan jam berangkat bila kereta terjadwal membuat opsi tercepat terlambat.

Uji: `python3 tools/test_rail.py` (data tiruan GTFS & Comuline → pipeline → mesin rute).

---

## 3. Posisi kereta langsung (GTFS-Realtime)

KAI Commuter belum membuka feed GTFS-Realtime publik (data langsungnya saat ini dibagikan ke Google Maps
lewat kemitraan). Lumi sudah siap: begitu ada feed, tambahkan di `remote_config.json`:

```json
"rail": {
  "realtime": [
    { "id": "krl", "url": "https://contoh.id/gtfs-rt/vehicle-positions.pb", "kind": "all",
      "modes": ["KRL"], "routeMap": { "BOGOR": "krl-b", "CIKARANG": "krl-cm" } }
  ]
}
```

- Protobuf didekode native (`GtfsRt.java`, tanpa pustaka; uji: `tools/GtfsRtTest.java`).
- `VehiclePosition` → penanda kereta di peta rute & perjalanan (diperbarui tiap 30 dtk selama layar terbuka).
- `TripUpdate` → keterlambatan per nomor KA ("+4 mnt terlambat"), juga menggeser posisi perkiraan.
- `Alert` → ikut tampil sebagai info gangguan.
- `routeMap` memetakan `route_id` feed ke `id` rute Lumi (lihat `data.js`). Tanpa peta, Lumi mencocokkan nomor KA dengan jadwal.

Tanpa feed, peta menampilkan **posisi perkiraan dari jadwal** (penanda bergaris putus-putus, ditulis
"Perkiraan jadwal") — tidak pernah disajikan seolah-olah posisi sungguhan.

---

## 4. Info gangguan layanan (`data/disruptions.json`)

```json
{
  "v": 1,
  "updated": "2026-11-11",
  "items": [
    {
      "id": "krl-bogor-2026-11-11",
      "mode": "KRL",
      "lines": ["B"],
      "severity": "warn",
      "title": { "id": "KRL Bogor tertahan", "en": "Bogor line held" },
      "text":  { "id": "Gangguan sinyal di Manggarai, perjalanan tertahan ±15 menit.", "en": "Signal fault at Manggarai, trains held ±15 min." },
      "from": "2026-11-11T05:00+07:00",
      "until": "2026-11-11T12:00+07:00",
      "url": "https://commuterline.id"
    }
  ]
}
```

- `mode`: `TJ`, `MIKRO`, `ROYAL`, `KRL`, `MRT`, `LRT`, `LRTJ`, `KABANDARA`, `WHOOSH`.
- `lines`: kode rute Lumi (`"9"`, `"B"`, `"JAK36"`) atau id (`"krl-b"`). Kosong = seluruh moda.
  Isi `mode` juga bila kodenya bisa tertukar antarmoda (mis. `"1"`).
- `severity`: `info` | `warn` | `severe`. `title` wajib (boleh string saja, maks. 120 huruf); `text` maks. 600.
- `from`/`until` wajib memakai zona waktu. Item yang sudah lewat `until` otomatis tidak tampil.
- Tampil di: beranda (paling atas), tanda "⚠ Ada gangguan" di kartu hasil, detail perjalanan & ruas, dan detail rute.

Periksa sebelum commit: `python3 tools/check_remote.py` (atau `python3 tools/check_remote.py berkas.json`).

---

## 5. Ikuti perjalananku (berbagi posisi langsung)

Saat pendampingan berjalan, tombol **Bagikan** di kartu biru membuat tautan untuk keluarga:
`https://vamvicky.github.io/LumiTransport/ikuti/#t=<topik>&k=<kunci>`.

- Tanpa server Lumi: posisi dikirim ke relay pub/sub publik [ntfy](https://ntfy.sh) pada topik acak 128-bit.
- **Terenkripsi ujung-ke-ujung** (AES-256-GCM, `ShareCrypto.java`). Kunci hanya ada di bagian `#` tautan,
  yang tidak dikirim peramban ke server mana pun; relay hanya menyimpan teks acak (± 12 jam).
- Dikirim tiap 15 dtk saat bergerak, saat fase berubah, dan minimal tiap 60 dtk; berhenti otomatis saat
  tiba (pesan "Sudah tiba ✓"), saat pendampingan dihentikan ("Berbagi dihentikan"), atau setelah 6 jam.
- Penampil: `docs/ikuti/index.html` (halaman statis, Leaflet + WebCrypto).
  **Aktifkan GitHub Pages** (Settings → Pages → Deploy from branch → `main` / folder `/docs`) agar tautan bisa dibuka.
- Relay & alamat penampil bisa diganti di `remote_config.json` → `share.relay` / `share.viewer` (https).

Uji ujung-ke-ujung: `python3 tools/test_share.py` (enkripsi Java → dekripsi di penampil).

---

## 6. Pengingat "waktunya berangkat"

Di detail perjalanan: **Ingatkan berangkat HH.MM**. Jam berangkat = "berangkat paling lambat" dari
pencarian (paling berguna dengan **Tiba sebelum**). Pilih 0–30 menit sebelumnya, sekali atau mingguan
(hari bisa dipilih). Alarm dipasang native (`Reminders.java`), dipasang ulang setelah HP dinyalakan
ulang / aplikasi diperbarui, dan pengingat terdekat tampil di widget **Berangkat / Pulang**. Mengetuk
notifikasi membuka rute yang sama persis. Android 12+: izinkan **Alarm & pengingat** (tombol di Pengaturan)
agar tepat waktu; tanpa izin, notifikasi bisa mundur beberapa menit.
