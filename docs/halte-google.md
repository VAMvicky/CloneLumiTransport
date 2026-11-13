# Peta gaya Google & audit titik halte

Catatan v2.19 soal apa yang masih dipakai dari kunci Google Maps (lihat
[google-api-keys.md](google-api-keys.md)), dan apa yang sengaja dibuang.

## Peta interaktif: BUKAN Static Maps

Sejak v2.19.2 pilihan "Google Maps (raster)" dihapus. Alasannya teknis, bukan
selera:

- Static Maps **bukan tile server**. Menyusunnya jadi petak menghasilkan
  watermark berulang di setiap kotak, dan pusat petak yang salah membuat titik
  bergeser makin jauh tiap tingkat zoom.
- Satu gambar per layar (percobaan v2.19.1) memperbaiki posisi dan watermark,
  tetapi tetap **kabur saat di-zoom** dan berkedip saat digeser — sifat raster
  yang di-scale.

Peta interaktif sekarang hanya memakai sumber yang memang tile/vektor:
OpenFreeMap (`liberty`, `bright`, `positron`), OSM raster, dan PMTiles offline.
Semua mulus di setiap zoom, tanpa watermark berulang.

Static Maps tetap dipakai untuk **gambar rute yang dibagikan** — di sana ia
memang alat yang tepat: satu potret, bukan permukaan yang digeser.

## Gambar rute berwarna per ruas

`LumiGoogle.staticRouteSegs()` + `tripImage()`.

- `segs` = satu entri per ruas naik: `{ pts, color, weight }`. Tiap ruas jadi satu
  parameter `path=` dengan warna trayeknya, jadi perpindahan kelihatan sebagai
  pergantian warna (merah TJ, biru MRT, ungu LRT, cokelat KRL).
- `center` dan `zoom` dihitung sendiri (`fitView`) — auto-fit Static Maps tidak
  selalu memasukkan `path` ke bounds, sehingga rute bisa terpotong.
- Gambar 640×298 dengan pita kartu 992×460: rasio sama, tidak ada piksel dipotong.
- Titik **A** dan **B** digambar di kanvas kartu, bukan `markers` Static Maps —
  pin di ujung rute selalu terpotong tepi pita.
- `crossOrigin="anonymous"` + `Access-Control-Allow-Origin: *` dari
  `MainActivity.googleFetch()` supaya kanvas tidak ternoda.
- Batas waktu 4,5 detik: tanpa gambar, kartu tetap dibuat.

## Ketuk peta: asal / tujuan

`mapTapActions()` di `app.js`, dipasang di `makeMap()`.

Ketuk mana pun (kecuali di peta pemilih `#pickMap` dan di atas penanda/popup)
memunculkan popup berisi nama tempat + dua tombol. Nama diambil dari Photon
`/reverse` (tanpa kunci); kalau gagal, dipakai koordinat. Tombol mengisi kolom
asal/tujuan lewat `setPoint()` lalu `afterPick()`.

## Audit titik halte

```bash
python3 tools/validate_stops.py --limit 120    # bawaan: 120 halte per jalan
python3 tools/validate_stops.py --all          # semua 3.277 halte (kuota!)
python3 tools/validate_stops.py --refresh      # abaikan cache
python3 tools/validate_stops.py --dry-run      # lihat rencana saja
```

Alur: baca halte unik dari `js/data.js` → `place/nearbysearch` radius 400 m →
jarak terdekat ke titik Lumi → tulis `data/stop_check.json`
(cache: `data/stop_check_cache.json`, tidak di-commit).

| nilai | arti | ambang |
|---|---|---|
| `ok` | titik cocok dengan halte Google | ≤ 60 m |
| `moved` | kemungkinan halte sudah pindah | 60–400 m |
| `missing` | tidak ada halte Google di sekitar | > 400 m |

`build_data.py` menyalinnya ke `js/stopcheck.js` (`window.LUMI_STOPCHECK`) dan
lembar halte menampilkan lencananya. Kunci memakai nama yang dinormalkan
(`nmKey`), bukan koordinat, supaya lencana tidak hilang saat GTFS menggeser titik.

## Batas yang disadari

- Kunci bukan milik Lumi dan bisa dicabut kapan saja; semua fitur Google punya
  jalur mundur.
- `path=` pada gambar rute adalah garis lurus antar halte, bukan geometri jalan.
- Static Maps dihitung per panggilan: satu gambar rute = satu panggilan.
- Photon `/reverse` bisa lambat; UI memakai koordinat lebih dulu, nama menyusul.
