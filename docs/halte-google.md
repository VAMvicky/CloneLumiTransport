# Foto halte, halte sekitar, dan audit titik

Dokumen ini menjelaskan tiga fitur v2.19 yang memakai kunci Google Maps yang sama
dengan saran alamat (lihat [google-api-keys.md](google-api-keys.md)). Semuanya
**pelengkap**: tanpa kunci, tanpa jaringan, atau saat kuota habis, fitur hilang
sendiri dan aplikasi tetap berjalan.

## 1. Foto halte di lembar halte

Alur: buka lembar halte → `LumiGoogle.nearby(p, "transit_station", 150)` →
bila tidak ada hasil, `LumiGoogle.search(nama, p)` → `photo_reference` →
`place/photo?maxwidth=640`.

- Hasil disimpan di cache memori `STOP_META` (maksimal 240 titik) dengan kunci
  `lat,lng` 4 desimal, jadi membuka halte yang sama dua kali hanya satu panggilan.
- Foto dipasang lewat `<img>`; header penyamaran ditambahkan oleh
  `shouldInterceptRequest` di `MainActivity`, bukan oleh JavaScript.
- Kredit "Foto: Google" selalu tampil bersama foto.
- Bila `img.onerror` menyala (kunci mati/kuota habis), kotak foto disembunyikan
  dan lembar halte tampil seperti versi lama.

## 2. Halte di sekitar saya

Tab **Halte** → tombol **Halte di sekitar saya** → `locate()` (GPS) →
`place/nearbysearch` `type=transit_station`, radius 1.500 m.

Tiap kartu menampilkan: foto, nama tempat Google, jarak dari posisi, dan —
bila ada halte Lumi dalam 120 m — nama halte Lumi beserta selisihnya
(`≈ Bundaran HI · 24 m`). Ketuk kartu untuk membuka lembar halte biasa, sehingga
"berangkat dari sini" dan "pergi ke sini" bekerja sama seperti pada halte Lumi.

Nama halte dari Google **tidak** dipakai sebagai nama resmi; itu hanya pembanding.
Data rute dan tarif tetap dari GTFS Transjakarta.

## 3. Peta di gambar rute yang dibagikan

`shareTrip()` kini mengambil Static Maps lebih dulu:

```
path=color:0x1565D8ff|weight:6|lat1,lng1|lat2,lng2|...
markers=...label:A|latA,lngA      (titik berangkat)
markers=...label:B|latB,lngB      (titik tujuan)
size=600x360&scale=1
```

- Titik diambil dari halte tiap ruas naik (`leg.stops`), lalu diencerkan ke
  maksimal 40 titik supaya URL tetap di bawah batas 8.192 karakter.
- Gambar dimuat dengan `crossOrigin="anonymous"`. Agar `<canvas>` tidak "ternoda",
  `MainActivity.googleFetch()` mengirim `Access-Control-Allow-Origin: *`
  pada jawaban Google. Tanpa header itu `toDataURL()` gagal dan peta tidak bisa
  ditempel ke kartu.
- Batas waktu 4,5 detik: kalau petak tidak datang, kartu tetap dibuat tanpa peta.
- Atribusi "Peta © Google" digambar di pojok peta, sesuai ketentuan Static Maps.

## 4. Audit titik halte

```bash
python3 tools/validate_stops.py --limit 120    # bawaan: 120 halte per jalan
python3 tools/validate_stops.py --all          # semua 3.277 halte (kuota!)
python3 tools/validate_stops.py --refresh      # abaikan cache
python3 tools/validate_stops.py --dry-run      # lihat rencana saja
```

Alur: baca halte unik dari `js/data.js` → `place/nearbysearch` radius 400 m →
jarak terdekat ke titik Lumi → tulis `data/stop_check.json`
(dan cache `data/stop_check_cache.json`).

Klasifikasi:

| nilai | arti | ambang |
|---|---|---|
| `ok` | titik cocok dengan halte Google | ≤ 60 m |
| `moved` | kemungkinan halte sudah pindah | 60–400 m |
| `missing` | tidak ada halte Google di sekitar | > 400 m |

`build_data.py` menyalin berkas itu ke `js/stopcheck.js`
(`window.LUMI_STOPCHECK`), dan lembar halte menampilkan lencananya. Kunci
menggunakan **nama yang dinormalkan** (`nmKey`), bukan koordinat, supaya lencana
tidak hilang saat GTFS sedikit menggeser titik halte.

Audit ini tidak dijalankan di CI: butuh jaringan dan memakai kuota proyek Google
pemilik kunci. Jalankan manual bila data GTFS berubah banyak, lalu commit
`data/stop_check.json`.

## Batas yang disadari

- Kunci bukan milik Lumi dan bisa dicabut kapan saja. Semua fitur di atas punya
  jalur mundur tanpa kunci.
- `nearbysearch` hanya mengembalikan tempat yang dikenal Google; halte baru yang
  belum masuk Google akan berstatus `missing` — itu informasi, bukan vonis.
- Foto berasal dari kontributor Google dan ditampilkan sesuai ketentuan Places;
  jangan disimpan permanen atau dipakai di luar aplikasi.
- Static Maps dihitung per panggilan. Satu gambar rute = satu panggilan; tidak ada
  pemakaian sebagai peta dasar.
