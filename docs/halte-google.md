# Peta gaya Google & audit titik halte

Catatan v2.19: apa yang dipakai dari Google, dan apa yang tidak.

## Peta interaktif: petak asli, HD

Pilihan **Google Maps** di Pengaturan memakai petak resmi Google:

```
https://mt{s}.google.com/vt?lyrs=m&hl=id&x={x}&y={y}&z={z}&scale=2     s = 0..3
```

- `scale=2` mengembalikan **512×512** untuk satu petak 256 px, jadi tajam di layar
  berkerapatan tinggi. Leaflet tetap memakai `tileSize` 256 dan mengecilkan
  gambarnya — hasilnya sama seperti petak retina.
- Skema slippy standar: posisi titik, halte, dan rute tepat karena Leaflet yang
  memproyeksikan, dan geser/zoom mulus karena tiap petak dimuat sendiri.
- Tidak ada watermark di dalam petak.

**Atribusi** tidak lagi digambar di atas peta. Kreditnya ada di halaman
Pengaturan (`© OpenStreetMap contributors · Peta © Google`, kelas `.set-credit`),
supaya peta bersih tanpa menghilangkan kewajiban atribusi.

**Risiko**: endpoint ini milik Google dan tidak disediakan untuk pihak ketiga.
Kalau Google menolak petaknya (`tileerror` 8 kali), aplikasi memberi tahu sekali,
memindahkan `cfg().basemap` ke `osm`, lalu menggambar ulang — peta tidak kosong.

## Gambar rute berwarna per ruas

`LumiGoogle.staticRouteSegs()` + `tripImage()`.

- Satu `path=` per ruas naik, warna mengikuti trayek (merah TJ, biru MRT, ungu
  LRT, cokelat KRL) — jumlah pindah terbaca dari gambar.
- `center`/`zoom` dihitung sendiri (`fitView`); auto-fit Static Maps bisa
  memotong rute.
- Gambar 640×298, pita kartu 992×460 — rasio sama, tanpa crop.
- Titik A/B digambar di kanvas kartu, bukan pin Static Maps.
- `crossOrigin="anonymous"` + CORS dari `MainActivity.googleFetch()`.

## Ketuk peta: dihapus (v2.19.4)

Popup "Berangkat dari sini / Pergi ke sini" dicabut atas permintaan. `reverse()`
(Photon) tetap ada dan masih dipakai layar **Pilih titik di peta**.

## Audit titik halte (alat, tanpa UI)

```bash
python3 tools/validate_stops.py --limit 120    # bawaan: 120 halte per jalan
python3 tools/validate_stops.py --all          # semua 3.277 halte (kuota!)
python3 tools/validate_stops.py --refresh      # abaikan cache
python3 tools/validate_stops.py --dry-run      # lihat rencana saja
```

Menulis `data/stop_check.json` + cache lokal. Sejak v2.19.4 hasilnya **tidak**
lagi ditanam ke APK dan lencananya dicabut dari lembar halte; berkasnya tetap
berguna sebagai laporan audit manual bila data GTFS berubah banyak.

## Batas yang disadari

- Petak Google dan kunci Places bukan milik Lumi; keduanya bisa ditolak kapan saja,
  dan keduanya punya jalur mundur (OSM, Photon, gambar tanpa peta).
- `path=` pada gambar rute adalah garis lurus antar halte, bukan geometri jalan.
- Static Maps dihitung per panggilan: satu gambar rute = satu panggilan.
- Photon `/reverse` bisa lambat; layar pemilih memakai koordinat lebih dulu.
