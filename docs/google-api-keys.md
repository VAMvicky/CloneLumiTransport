# Kunci API internal Google Maps (hasil RE)

Catatan ini menjelaskan kunci apa saja yang diambil dari APK Google Maps, dari mana
persisnya, dan yang paling penting: cara memakainya dari aplikasi lain.

| | |
|---|---|
| Berkas | `com.google.android.apps.maps_26.44.06.1006895251-1068856906_1arch_3dpi_24lang_…_apkmirror.com.apkm` |
| Paket | `com.google.android.apps.maps` |
| Versi | 26.44.06.1006895251 (versionCode 1068856906) |
| Basis | `base.apk` di dalam bundel `.apkm` |

Alat bantu: pembongkaran ZIP, pembaca AXML untuk `AndroidManifest.xml`, pembaca string
pool DEX, dan pembaca blok tanda tangan APK (v2/v3). Tidak ada APK yang dijalankan.

## 0. Catatan

Sejak v2.19.5 dokumen ini **tidak lagi memuat nilai kunci**, hanya lokasinya.
Repositori ini publik; menaruh kunci di dokumentasi mempercepat kunci itu
dicabut. Kunci yang dipakai aplikasi tetap ada di `GoogleKeys.java` dan
`js/gmaps.js` — ambil sendiri dari APK Google Maps dengan langkah di bagian 5.

## 1. Kunci yang ditemukan

| Kunci | Lokasi | Dugaan pemakaian |
|---|---|---|
| `<kunci dari APK>` | `resources.arsc` @131129 — string resource, di antara entri `AI …` | **Places API (legacy) + Static Maps** — inilah kunci yang benar-benar jalan |
| `<kunci dari APK>` | `AndroidManifest.xml` — `<meta-data android:name="com.google.android.geo.API_KEY">` dan `com.google.location.beacon.API_KEY`; juga `classes.dex` @7629103 | Maps SDK for Android milik aplikasi |
| `<kunci dari APK>` | `classes2.dex` @8058645, tepat sebelum `gmscompliance-pa.googleapis.com` | backend kepatuhan GMS (produksi) |
| `<kunci dari APK>` | `classes2.dex` @8058735, sebelum `/staging-gmscompliance-pa.sandbox.googleapis.com` | backend kepatuhan GMS (sandbox) |
| `<kunci dari APK>` | `classes2.dex` @8111109, dekat `chime-sdk` dan `1:747654520220:android:…` | Google Meet / Chime SDK |
| `<kunci dari APK>` | `classes2.dex` @8204964, di rombongan konstanta analitik | analitik |
| `<kunci dari APK>` | `classes2.dex` @8205005, di rombongan konstanta analitik | analitik |

Sertifikat penandatangan resmi (dari blok APK Signature Scheme v3, sertifikat dengan
`CN=Google Inc., OU=Android`):

```
SHA-1  38918A453D07199354F8B19AF05EC6562CED5788
SHA-256  (lihat cert.der pada ekstraksi; ikut di dokumen ini bila perlu)
```

Ada satu sertifikat lagi di rantai rotasi v3.1 — `BD32424203E0FB25F36B57E5AA356F9BDD1DA998`.
Yang dipakai di kode adalah yang pertama, karena itu yang cocok dengan pembatasan kunci.

## 2. Kenapa harus "menyamarkan diri"

Semua kunci di atas dibatasi ke aplikasi Google Maps (pembatasan aplikasi Android:
nama paket + sidik sertifikat). Panggilan REST biasa dari mesin lain ditolak:

```
GET https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Monas&key=<kunci dari APK>
→ REQUEST_DENIED  "This IP, site or mobile application is not authorized to use this API key.
                    Request received from IP address 110.138.95.50, with empty referer"
```

Yang diperiksa server adalah dua header ini, dan keduanya bisa dipalsukan:

```
X-Android-Package: com.google.android.apps.maps
X-Android-Cert:    38918A453D07199354F8B19AF05EC6562CED5788
```

Dengan kedua header itu, kunci menerima permintaan dari aplikasi mana pun:

```
GET …/place/autocomplete/json?input=Monas&language=id
    -H "X-Android-Package: com.google.android.apps.maps"
    -H "X-Android-Cert: 38918A453D07199354F8B19AF05EC6562CED5788"
→ 200 OK, prediksi "Monas, Gambir, Kota Jakarta Pusat, …"
```

Jadi pembatasan paket/sertifikat di sini hanya formalitas: aplikasi Lumi tetap
bernama `id.lumi.transport` dengan sertifikatnya sendiri, cukup headernya yang ditiru.

## 3. Apa yang benar-benar terbuka (diuji 11 Nov 2026)

Kunci `<kunci dari APK>` dengan header penyamaran:

| Endpoint | Hasil |
|---|---|
| `place/autocomplete/json` | **OK** (prediksi lengkap) |
| `place/details/json` | **OK** (koordinat, nama, alamat) |
| `place/nearbysearch/json` | **OK** (mis. `type=transit_station` di sekitar Monas) |
| `place/textsearch/json` | **OK** |
| `place/queryautocomplete/json` | **OK** |
| `staticmap` | **OK** (PNG 400×400, ±63 KB) |
| `place/photo` | butuh `photo_reference` yang sah (di luar uji) |
| `directions/json` | `REQUEST_DENIED` — API legacy tidak diaktifkan |
| `distancematrix/json` | `REQUEST_DENIED` |
| `geocode/json` | `REQUEST_DENIED` — API tidak diaktifkan |
| `timezone/json`, `streetview/*` | `REQUEST_DENIED` |
| `places.googleapis.com/v1/places:searchText` | `PERMISSION_DENIED` — `API_KEY_SERVICE_BLOCKED` |
| `routes.googleapis.com/directions/v2:computeRoutes` | `PERMISSION_DENIED` — `API_KEY_SERVICE_BLOCKED` |

Konsekuensi desain di Lumi:

* Pencarian alamat memakai **Place Autocomplete → Place Details**. Details dipakai
  untuk mengambil koordinat, karena Geocoding API tertutup.
* Peta Google memakai **Static Maps** sebagai petak raster (satu panggilan per petak
  256 px). Bukan tiles vektor, tapi hasilnya tetap peta Google.
* Rute, jarak jalan, dan tarif tetap dari mesin Lumi sendiri + OSRM, bukan dari Google.

Kunci `com.google.android.geo.API_KEY` (SDK) juga dicoba: endpoint legacy menjawab
"you must enable Billing", jadi hanya disimpan sebagai cadangan.

## 4. Risiko

* Kunci bukan milik Lumi. Google bisa mencabutnya kapan saja; aplikasi akan jatuh ke
  saran alamat Photon/OpenStreetMap dan peta OpenFreeMap (jalur bawaan tetap utuh).
* Kuota milik proyek Google: Static Maps satu panggilan per petak, jadi menyeret peta
  menghabiskan kuota lebih cepat daripada peta vektor.
* Kunci tidak punya siklus hidup untuk Lumi, jadi tidak ada jaminan jangka panjang.

## 5. Cara mengambil ulang kalau kunci mati

1. Unduh APK Google Maps terbaru (APKMirror/Play).
2. Buka `base.apk`, ambil `resources.arsc`, `AndroidManifest.xml`, dan semua `classes*.dex`.
3. Cari pola `AIza[0-9A-Za-z_\-]{35}` (UTF-8 dan UTF-16LE) pada berkas-berkas itu.
4. Ambil sertifikat penandatangan dari blok `APK Sig Block 42` (skema v3), hitung SHA-1
   DER sertifikat `CN=Google Inc.`.
5. Uji cepat dengan `curl -H "X-Android-Package: com.google.android.apps.maps"
   -H "X-Android-Cert: <sha1>" …/place/autocomplete/json?input=Monas&key=<kunci>`.
6. Ganti konstanta di `GoogleKeys.java` dan `js/gmaps.js`.
