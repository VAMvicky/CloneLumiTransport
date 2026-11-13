# Peta gaya Google & audit titik halte

Catatan v2.19: apa yang dipakai dari Google, dan apa yang sengaja tidak.

## Peta interaktif: petak asli, bukan Static Maps

Pilihan **Google Maps** di Pengaturan memakai petak resmi Google:

```
https://mt{s}.google.com/vt?lyrs=m&hl=id&x={x}&y={y}&z={z}&scale=1     s = 0..3
```

Kenapa ini, dan bukan Static Maps:

| | Static Maps (lama) | Petak `mt*.google.com` (sekarang) |
|---|---|---|
| geser/zoom | kabur (gambar di-scale) lalu berkedip saat di-fetch ulang | mulus, standar slippy, tiap petak dimuat sendiri |
| posisi | meleset, karena pusat petak dihitung sendiri | tepat, Leaflet yang memproyeksikan |
| watermark | berulang di tiap kotak | tidak ada di dalam petak; atribusi dipasang aplikasi |
| biaya | 1 panggilan per petak / per layar | tidak memakai kunci Google sama sekali |

`lyrs=m` = peta jalan. Kalau butuh citra, `lyrs=s` (satelit) dan `lyrs=s,h` (hibrida)
tersedia dari endpoint yang sama, tapi aplikasi hanya memakai `m`.

**Risiko yang disadari**: endpoint ini milik Google dan tidak disediakan untuk
pihak ketiga; pemakaiannya melanggar ToS dan bisa ditolak kapan saja. Karena itu
`baseLayer()` menghitung `tileerror`: setelah 8 petak gagal, aplikasi memberi tahu
sekali dan memindahkan `cfg().basemap` ke `osm`, lalu menggambar ulang. Peta tidak
pernah dibiarkan kosong.

Static Maps tetap dipakai untuk **gambar rute yang dibagikan** — di sana ia memang
alat yang benar: satu potret, bukan permukaan yang digeser.

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

- Petak Google dan kunci Places bukan milik Lumi; keduanya bisa dicabut/ditolak
  kapan saja, dan keduanya punya jalur mundur (OSM, Photon, gambar tanpa peta).
- `path=` pada gambar rute adalah garis lurus antar halte, bukan geometri jalan.
- Static Maps dihitung per panggilan: satu gambar rute = satu panggilan.
- Photon `/reverse` bisa lambat; UI memakai koordinat lebih dulu, nama menyusul.
