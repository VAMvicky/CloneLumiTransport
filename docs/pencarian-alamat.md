# Pencarian alamat: apa yang sebenarnya dipakai Google Maps

Catatan investigasi untuk fitur "ketik alamat → muncul saran seperti Google Maps" di
Lumi Transport. Disusun dari APK Google Maps 26.44.06 (APKMirror bundle), tanpa
menjalankan aplikasi dan tanpa memanggil endpoint internalnya.

> **Diperbarui v2.19.6.** Versi pertama dokumen ini menyimpulkan kunci tidak bisa
> dipakai ulang. Kesimpulan itu **salah** dan sudah dikoreksi di bagian 3: kunci
> memang dibatasi ke paket + sertifikat Google Maps, tetapi pembatasan itu diperiksa
> dari header yang dikirim klien, sehingga bisa ditiru. Bukti ujinya ada di
> [google-api-keys.md](google-api-keys.md).

## Artefak yang diperiksa

| | |
|---|---|
| Berkas | `com.google.android.apps.maps_26.44.06..._apkmirror.com.apkm` (63,7 MB) |
| SHA-256 bundle | `9beffe7bc0581ad677477b164c6b11a9c5d9434b56620954776eddbb89b83e57` |
| `base.apk` | 78.196.674 byte, 4.397 entri |
| Kode | 10 `classes*.dex` (~75 MB) |
| Versi | 26.44.06 (versionCode 1068856906) |

## Temuan

**1. Saran alamat di aplikasi Maps dilayani backend internal, bukan Places API publik.**

Di seluruh 10 dex tidak ada satu pun string `places.googleapis.com` atau
`/maps/api/place`. Yang ada:

- `mobilemaps.googleapis.com`
- `mobilemaps-pa.googleapis.com:443`
- `mobilemaps-pa-gz.googleapis.com:443`

Ketiganya host internal Maps for Android, dipanggil dengan kredensial akun + API
key aplikasi, dan berbicara protobuf — bukan REST JSON publik.

**2. Kelas yang menangani autocomplete memang internal.**

- `com.google.android.apps.gmm.car.destinationinput.autocompletesuggestions.api.AutoCompleteSuggestionsUseCase$AutoCompleteSuggestionsResult`
- `com.google.android.apps.gmm.ui.components.terra.textfield.AutoCompleteAdapter`
- `ADDRESS_AUTOCOMPLETE_CONTROLLER`, `SearchBoxVisibility`, `SearchBoxInteractivity`
- Tipe respons berupa entity protobuf (`...EvPredictionEntity`), bukan
  `AutocompletePrediction` milik Places SDK.

**3. Kunci tertanam dan bisa dipakai ulang lewat header tiruan (dikoreksi).**

Ditemukan beberapa string `AIza…` di dalam dex dan `resources.arsc`. Semuanya
dibatasi ke paket `com.google.android.apps.maps` + sertifikat tanda tangan Google,
dan ke API tertentu di proyek pemiliknya.

Pembatasan aplikasi (paket + sertifikat) **diperiksa dari dua header yang dikirim
klien**, bukan dari bukti kriptografis:

```
X-Android-Package: com.google.android.apps.maps
X-Android-Cert:    <SHA-1 sertifikat penandatangan Google Maps>
```

Dengan dua header itu, endpoint Places legacy (autocomplete, details,
nearby/text search) menerima permintaan dari aplikasi lain. Pembatasan **layanan**
(directions, geocode, routes v2) tetap tidak bisa ditembus dengan cara ini — itu
properti kunci di proyek Google, bukan identitas pemanggil. Rincian hasil uji ada
di [google-api-keys.md](google-api-keys.md).

**4. Meniru endpoint internal tetap bukan jalan yang layak.**

`mobilemaps.googleapis.com` butuh sesi akun Google dan protobuf yang berubah antar
versi. Menyadapnya berarti scraping: rapuh, melanggar ToS, dan bisa memutus akses
pengguna. Ini sengaja **tidak** diuji.

## Artinya untuk Lumi Transport

- Saran alamat memakai Places legacy dengan kunci internal + header tiruan, dengan
  cadangan **Photon/OpenStreetMap** bila kunci ditolak.
- Rute, jarak jalan, dan tarif tetap dari mesin Lumi sendiri + OSRM, bukan Google.
- Risikonya nyata: kunci bukan milik Lumi, bisa dicabut kapan saja. Karena itu
  `js/gmaps.js` mencatat kegagalan **per kemampuan** dan punya cooldown, dan
  aplikasi tetap berjalan tanpa Google.
