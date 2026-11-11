# Gangguan layanan, pengingat, pantau bus, saldo kartu & aksesibilitas (v2.16)

Panduan pengelola untuk fitur yang datanya diatur dari repo (tanpa rilis APK baru).

| Berkas | Diambil aplikasi | Isi |
|---|---|---|
| `data/remote_config.json` | tiap ≥ 6 jam | versi klien TJ (`x-app-version`), nama berkas gangguan |
| `data/disruptions.json` | aplikasi: tiap ≥ 30 mnt saat terbuka · latar: tiap ±30 mnt | info gangguan layanan |
| `data/accessibility.json` | tiap ≥ 3 hari | lift, eskalator, akses kursi roda per halte/stasiun (OSM) |

Semua diperiksa dulu di aplikasi; aturannya sama dengan `tools/check_remote.py` & `tools/osm_access.py --check` (dijalankan CI).

## 1. Versi klien Transjakarta

Angka `x-app-version` hanya ditulis di `gradle.properties` (`lumi.tjClientVersion`). Bila TJ menaikkan versi
minimum sebelum rilis berikutnya, ubah `"tjClientVersion"` di `data/remote_config.json`.

## 2. Info gangguan (`data/disruptions.json`)

```json
{ "v": 1, "updated": "2026-11-11", "items": [
  { "id": "krl-bogor-2026-11-11", "mode": "KRL", "lines": ["B"], "severity": "warn",
    "title": { "id": "KRL Bogor tertahan", "en": "Bogor line held" },
    "text":  { "id": "Gangguan sinyal di Manggarai, tertahan ±15 menit.", "en": "Signal fault at Manggarai, held ±15 min." },
    "from": "2026-11-11T05:00+07:00", "until": "2026-11-11T12:00+07:00", "url": "https://commuterline.id" } ] }
```

- `lines`: kode rute Lumi (`"9"`, `"B"`, `"JAK36"`) atau id (`"krl-b"`); kosong = seluruh `mode`.
- `severity`: `info` | `warn` | `severe`. `from`/`until` wajib berzona waktu; jam yang tidak terbaca → item diabaikan.
- Tampil di beranda, kartu hasil, detail perjalanan & rute. **Tanpa membuka aplikasi**: tugas latar
  (`Disruptions.Job`, ±30 mnt) memberi notifikasi sekali per gangguan bila mengenai rute di **perjalanan favorit**
  atau **pengingat berangkat** pengguna.

## 3. Pengingat berangkat yang mengecek kondisi terbaru

- 30 menit sebelum notifikasi: cek gangguan di rute pengingat → notifikasi "berangkat lebih awal" (hanya bila ada).
- Saat waktunya: notifikasi menyebut gangguan yang masih berlaku, dan bila ruas pertama naik bus TJ/Mikrotrans,
  **pemantau bus** langsung berjalan (butuh izin "Alarm & pengingat"; tanpa izin ada tombol **Pantau bus**).

## 4. Bus makin dekat saat layar mati

`BusWatchService` (layanan latar depan) memegang koneksi feed armada sendiri dan memberi tahu ±10/±5/±2 menit
dan saat bus tiba di halte naik — juga saat layar mati. Mulai dari tombol di detail perjalanan, otomatis saat
pendampingan dimulai, atau dari pengingat. Berhenti setelah bus tiba, 90 menit, atau tombol **Berhenti**.
Hanya bus searah (halte turun masih ada di sisa perjalanan bus) yang dihitung.

## 5. Cek saldo kartu (NFC, eksperimental)

Tab **Tarif** / beranda → **Cek saldo kartu**. Membaca saldo di chip (hanya baca): Mandiri e-money, BNI TapCash,
BRI Brizzi, BCA Flazz generasi 2, JakCard, KMT (FeliCa). Perintah APDU dari OSP KUE Reader (Apache-2.0, lihat
`NOTICE`). Uji: `tools/CardReaderTest.java` (kartu tiruan). Belum diuji dengan semua jenis kartu fisik.

## 6. Aksesibilitas & rute ramah kursi roda

- `tools/osm_access.py` (workflow **stop-fix**, mingguan) menghitung lift (`highway=elevator`), eskalator
  (`highway=steps` + `conveying`) dan tag `wheelchair` OSM di sekitar stasiun & halte BRT.
- Ketentuan umum yang pasti: semua stasiun MRT Jakarta, LRT Jabodebek, LRT Jakarta punya lift & eskalator;
  Mikrotrans tanpa ramp. Selain itu (mis. KRL) hanya dari data OSM — bila belum ada ditulis "belum ada data".
- Saringan **Ramah kursi roda** di hasil: tanpa Mikrotrans/ojol motor, jalan kaki ≤ 1,2 km (satu ruas ≤ 800 m),
  maks. 2× pindah, tidak naik/turun di titik bertanda "tidak untuk kursi roda". Bila tak ada yang lolos, opsi
  dengan jalan kaki paling sedikit ditampilkan dengan penjelasan. Mode aksesibel menyalakannya otomatis.
