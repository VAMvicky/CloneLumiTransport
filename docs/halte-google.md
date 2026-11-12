# Peta gaya Google & audit titik halte

Dua hal di v2.19 yang memakai kunci Google Maps yang sama dengan saran alamat
(lihat [google-api-keys.md](google-api-keys.md)). Keduanya pelengkap: tanpa kunci,
tanpa jaringan, atau saat kuota habis, aplikasi tetap berjalan seperti biasa.

## 1. Peta dasar gaya Google — satu gambar per layar

`LumiGoogle.overlayLayer()` di `js/gmaps.js`.

Static Maps **bukan tile server**. Setiap gambar yang diminta adalah render peta
utuh lengkap dengan logo dan "Map data ©… Google" miliknya sendiri. Menyusunnya
sebagai petak 256 px menghasilkan dua cacat:

- titik bergeser, karena pusat petak harus `(x+0.5, y+0.5)` di skema slippy —
  memakai `(x, y)` menggeser gambar setengah petak, dan besar geserannya berubah
  di setiap tingkat zoom;
- watermark berulang di setiap kotak.

Karena itu gaya ini sekarang memakai **satu gambar 640 px per layar**:

```
zoom gambar = floor(zoom peta + log2(640 / sisiTerpanjang))
```

Batas geografis gambar dihitung dari pusat peta + zoom gambar itu, lalu dipasang
sebagai `L.ImageOverlay`. Hasilnya: satu atribusi per layar, posisi tepat, dan
gambar disegarkan setiap `moveend` / `zoomend`. Biayanya satu permintaan per
gerakan peta yang berhenti — bukan satu per petak.

## 2. Peta pada gambar rute yang dibagikan

`LumiGoogle.staticRouteUrl()` + `tripImage()`.

- `center` dan `zoom` **dihitung sendiri** (`fitView`), tidak mengandalkan auto-fit
  Static Maps — auto-fit tidak selalu memasukkan `path` ke perhitungan bounds,
  sehingga rute bisa terpotong.
- Ukuran gambar 640×246, rasio yang sama dengan pita peta di kartu (992×380),
  jadi tidak ada piksel yang dipotong.
- Titik **A** dan **B** digambar di kanvas kartu, bukan sebagai `markers` Static
  Maps: pin di ujung rute selalu terpotong tepi pita.
- Gambar diambil dengan `crossOrigin="anonymous"`; `MainActivity.googleFetch()`
  mengirim `Access-Control-Allow-Origin: *` supaya kanvas tidak "ternoda" dan
  `toDataURL()` tetap bekerja.
- Batas waktu 4,5 detik: kalau gambar tidak datang, kartu tetap dibuat tanpa peta.

## 3. Audit titik halte

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

`build_data.py` menyalin berkas itu ke `js/stopcheck.js`
(`window.LUMI_STOPCHECK`), dan lembar halte menampilkan lencananya. Kunci memakai
**nama yang dinormalkan** (`nmKey`), bukan koordinat, supaya lencana tidak hilang
saat GTFS menggeser titik halte sedikit.

Audit tidak dijalankan di CI: butuh jaringan dan memakai kuota proyek Google
pemilik kunci. Jalankan manual bila data GTFS berubah banyak, lalu commit
`data/stop_check.json`.

## Batas yang disadari

- Kunci bukan milik Lumi dan bisa dicabut kapan saja.
- `nearbysearch` hanya mengenal tempat yang ada di Google; halte baru bisa
  berstatus `missing` — itu informasi, bukan vonis.
- Static Maps dihitung per panggilan. Satu gambar rute = satu panggilan, dan peta
  dasar gaya Google = satu panggilan per gerakan peta yang berhenti.
- `path=` pada gambar rute adalah garis lurus antar halte, bukan geometri jalan.
  Untuk garis yang mengikuti aspal, titiknya harus diambil dari shape GTFS.
