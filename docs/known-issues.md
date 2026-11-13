# Daftar isu — satu sumber

Dokumen ini adalah **satu-satunya** daftar isu Lumi Transport: satu nomor per isu,
status jelas, dan siapa yang mengerjakan. Daftar ini yang dipakai, bukan ingatan
dari percakapan.

Status: `SELESAI` (sudah diperbaiki di versi yang disebut), `TERBUKA` (belum),
`DITOLAK` (keputusan sadar untuk tidak dikerjakan), `DI LUAR` (bukan wewenang
pengembang / kunci pihak lain), `BENAR` (diperiksa, ternyata bukan cacat).

Terakhir diperiksa: v2.19.6.

---

## P — kinerja

| id | isu | status | catatan |
|---|---|---|---|
| P-01 | `gtfs.js` 4,14 MB diparse saat boot | TERBUKA | **terukur**: domContentLoaded 1472 ms vs 433 ms tanpa GTFS; heap 54,2 MB vs 18,4 MB (Chromium desktop, median 3×) |
| P-02 | 12 script eager, termasuk `data.js` 605 KB dan `stopfix.js` 40 KB | TERBUKA | satu paket perbaikan dengan P-01 |
| P-03 | tidak ada anggaran ukuran/parse di CI | TERBUKA | usul: benchmark boot sebagai tes, gagal bila > ambang |

## S — keamanan

| id | isu | status | catatan |
|---|---|---|---|
| S-01 | `openExternal()` menjalankan `intent:` URI dari halaman/JSON jauh | TERBUKA | intent redirection; usul daftar putih skema |
| S-02 | WebView probe (`probeNow`) tidak mematikan akses berkas | TERBUKA | default `true` di Android 8–10 |
| S-03 | `UpdateInstaller.check()` tidak membandingkan sertifikat | TERBUKA | Android tetap menolak beda tanda tangan, tapi centang sendiri lebih baik |
| S-04 | tidak ada penangkap crash / laporan | TERBUKA | 84 `catch` di Java, sebagian menelan error |
| S-05 | WebView utama `setAllowFileAccess(true)` | DITOLAK | diperlukan untuk aset `file://`; alternatif WebViewAssetLoader dinilai tidak sepadan |

## K — kode & ketahanan

| id | isu | status | catatan |
|---|---|---|---|
| K-01 | session token Places tidak kedaluwarsa idle | TERBUKA | token dipakai lagi berjam-jam bila Details tak pernah dipanggil |
| K-02 | `ROUTE_SRC` tidak diperbarui setelah unduhan GTFS | TERBUKA | kartu "Perbarui rute" muncul lagi di Pengaturan sampai aplikasi dibuka ulang |
| K-03 | `TILES_DOWN` hanya pulih saat event `online` | TERBUKA | kegagalan sesaat mematikan gaya Google sampai restart |
| K-04 | `static` ada di `CAPS` tapi tak pernah ditandai | TERBUKA | membuat `isDown()` tanpa argumen menyesatkan |
| K-05 | 23 pemakaian `localStorage` langsung di luar `store()` | TERBUKA | kuota penuh / mode privat bisa melempar |
| K-06 | 4 `innerHTML` gabungan tanpa `esc()` (app.js 1342, 1457, 2209, 3132) | TERBUKA | perlu dibaca per baris sebelum diubah |
| K-07 | 6 `catch` kosong di JS | TERBUKA | 2 di antaranya menelan error diagnostik |
| K-08 | 84 `catch` di Java, sebagian menelan error | TERBUKA | menyulitkan diagnosa lapangan (lihat S-04) |
| K-09 | 6 tombol berikon tanpa `aria-label` | TERBUKA | pembaca layar menyebut "tombol" saja |
| K-10 | `lumi:pcache` tidak ikut `BACKUP_KEYS` | TERBUKA | setelah restore, saran alamat memanggil Google dari nol |

## G — lapisan Google

| id | isu | status | catatan |
|---|---|---|---|
| G-01 | satu kegagalan mematikan seluruh lapisan | SELESAI | 2.19.5: `fault` per kapabilitas |
| G-02 | `OVER_QUERY_LIMIT` mematikan permanen | SELESAI | 2.19.5: cooldown 60 s →15 mnt |
| G-03 | `GL_DOWN` dipakai bersama petak | SELESAI | 2.19.5: `TILES_DOWN` dipisah |
| G-04 | tanpa `sessiontoken` | SELESAI | 2.19.5 |
| G-05 | tanpa cache `place_id` | SELESAI | 2.19.5 (30 hari, 400 entri) |
| G-06 | kunci dipamerkan di dokumen publik | SELESAI | 2.19.5 + `f4c6930` |
| G-07 | petak `scale=2` selalu | SELESAI | 2.19.6: kondisional `devicePixelRatio ≥ 2` |
| G-08 | peta gaya Google dari Static Maps: geser/miring/watermark | SELESAI | 2.19.3: petak resmi `mt*.google.com` |
| G-09 | gambar rute tanpa warna per ruas | SELESAI | 2.19.2: satu `path` per ruas |
| G-10 | gambar rute terpotong | SELESAI | 2.19.2: `center`/`zoom` dihitung sendiri |
| G-11 | pin A/B terpotong tepi | SELESAI | 2.19.2: titik digambar di kanvas |
| G-12 | kunci & petak milik Google, bisa dicabut | DI LUAR | diterima; ada jalur mundur Photon/OSM |
| G-13 | nyadap `mobilemaps` untuk jadwal kereta | DITOLAK | butuh sesi akun + protobuf per versi; jadwal diambil dari operator |

## F — fitur yang diubah atas permintaan

| id | isu | status | catatan |
|---|---|---|---|
| F-01 | foto halte | SELESAI | dicabut 2.19.1 (permintaan) |
| F-02 | halte di sekitar | SELESAI | dicabut 2.19.1 (permintaan) |
| F-03 | popup "berangkat/pergi" saat ketuk peta | SELESAI | ditambah 2.19.2, dicabut 2.19.4 (permintaan) |
| F-04 | lencana "mungkin sudah pindah · xx m" | SELESAI | dicabut 2.19.4 (permintaan) |
| F-05 | keterangan izin baru muncul setelah diketuk | SELESAI | 2.19.4: langkah pemadatan `c1` dibuang |
| F-06 | layar izin mengunci sampai "latar belakang" | SELESAI | 2.19.6: hanya lokasi + notifikasi |
| F-07 | kartu unduh GTFS menetap setelah selesai | SELESAI | 2.19.4: banner + kartu disembunyikan |
| F-08 | kartu "Perbarui rute" balik di Pengaturan | TERBUKA | = K-02 |

## R — rilis & proses

| id | isu | status | catatan |
|---|---|---|---|
| R-01 | APK rilis tidak membawa GTFS | SELESAI | 2.19.6: backfill mengambil GTFS; APK 907 KB → 1,64 MB |
| R-02 | jalur rilis tanpa gerbang tes | SELESAI | 2.19.6: job `Uji sebelum terbit` + `needs` |
| R-03 | tanda tangan rilis memakai kunci debug | DI LUAR | butuh `LUMI_KEYSTORE_BASE64` + password |
| R-04 | push tidak memicu CI | DI LUAR | 8 run, semuanya `workflow_dispatch`; uji commit kosong: nol run |
| R-05 | `ui_check` (4 mnt) belum ikut gerbang rilis | TERBUKA | keputusan: rilis rela menunggu atau tidak |
| R-06 | label "Latest" tidak dipindah otomatis | TERBUKA | backfill memakai `make_latest: false`; usul langkah `gh release edit --latest` |
| R-07 | commit kosong `f4261f7` di histori | TERBUKA | uji pemicu CI; dihapus hanya lewat force-push |

## D — data

| id | isu | status | catatan |
|---|---|---|---|
| D-01 | 327 arah rute tanpa `shape` | TERBUKA | garis jatuh ke fallback lurus; perlu laporan mana saja |
| D-02 | 42 nama halte kembar dengan titik >1,5 km | TERBUKA | terjauh "Jembatan Merah" 8.369 m; perlu disambiguasi di pencarian |
| D-03 | 6.991 titik halte, 3.277 unik | BENAR | bukan cacat |
| D-04 | koordinat di luar Jabodetabek | BENAR | 0 |
| D-05 | rute dengan <2 halte | BENAR | 0 |
| D-06 | moda tanpa tarif | BENAR | 0 |

## T — tes

| id | isu | status | catatan |
|---|---|---|---|
| T-01 | `MainActivity` (84 KB), `GtfsImporter`, `BusWatchService`, `Reminders`, `NavService`, `OfflineMap` tanpa tes | TERBUKA | 9 kelas tes untuk 28 kelas utama |
| T-02 | `app.js` 4.600 baris hanya lewat smoke UI | TERBUKA | `test_engine.js` + `test_gmaps.js` menutup mesin & Google |
| T-03 | lapisan Google tanpa tes | SELESAI | 2.19.6: `tools/test_gmaps.js`, 15 pemeriksaan |

## OK — diperiksa, ternyata benar

| id | hal |
|---|---|
| OK-01 | manifest: 14 izin, 3 exported (2 dilindungi permission), `allowBackup=false`, cleartext mati |
| OK-02 | `foregroundServiceType` ada di `NavService` (location) dan `BusWatchService` (dataSync) |
| OK-03 | `OfflineMap.serve()` aman dari path traversal (canonical + prefiks + `tiles.pmtiles` dikecualikan) |
| OK-04 | `live.js` punya backoff eksponensial 2 s → 30 s |
| OK-05 | `ShareProvider` menolak `/` dan `..` |
| OK-06 | alarm reminder memakai `setExactAndAllowWhileIdle` + cek `canScheduleExactAlarms` |
| OK-07 | R8 + shrinkResources aktif; lint `abortOnError` + `warningsAsErrors` |
| OK-08 | 0 `console.log` tersisa di JS |
| OK-09 | 0 id ganda di `index.html` |
| OK-10 | 0 input tanpa label/aria di `index.html` |
