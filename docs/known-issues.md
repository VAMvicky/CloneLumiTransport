# Daftar isu — satu sumber

Dokumen ini adalah **satu-satunya** daftar isu Lumi Transport: satu nomor per isu,
status jelas, dan siapa yang mengerjakan. Daftar ini yang dipakai, bukan ingatan
dari percakapan.

Status: `SELESAI` (sudah diperbaiki di versi yang disebut), `TERBUKA` (belum),
`DITOLAK` (keputusan sadar untuk tidak dikerjakan), `DI LUAR` (bukan wewenang
pengembang / kunci pihak lain), `BENAR` (diperiksa, ternyata bukan cacat).

Terakhir diperiksa: v2.20.2.

---

## P — kinerja

| id | isu | status | catatan |
|---|---|---|---|
| P-01 | `gtfs.js` 4,14 MB diparse saat boot | SELESAI (2.20.0) | gtfs.js dimuat setelah layar pertama; boot 1472 ms → 477 ms |
| P-02 | 12 script eager, termasuk `data.js` 605 KB dan `stopfix.js` 40 KB | SELESAI (2.20.0) | gtfs.js keluar dari jalur boot; data.js tetap (dibutuhkan layar pertama) |
| P-03 | tidak ada anggaran ukuran/parse di CI | SELESAI (2.20.0) | tools/boot_budget.py, gagal bila >1500 ms |
| P-04 | parse 4,1 MB + bangun ulang graf tetap di main thread setelah paint | SELESAI (2.20.1) | GTFS tidak dibundel lagi; parse 4,1 MB hilang dari jalur boot maupun pasca-boot |
| P-05 | anggaran boot hanya mengukur DCL | SELESAI (2.20.1) | boot_budget.py juga mengukur waktu sampai graf rute siap |

## S — keamanan

| id | isu | status | catatan |
|---|---|---|---|
| S-01 | `openExternal()` menjalankan `intent:` URI dari halaman/JSON jauh | SELESAI (2.20.0) | whitelist http/https/mailto/tel/market; `intent:` dibuang |
| S-02 | WebView probe (`probeNow`) tidak mematikan akses berkas | SELESAI (2.20.0) | probe WebView: setAllowFileAccess(false) + setAllowContentAccess(false) |
| S-03 | `UpdateInstaller.check()` tidak membandingkan sertifikat | SELESAI (2.20.0) | bandingkan SHA-256 sertifikat penandatangan |
| S-04 | tidak ada penangkap crash / laporan | SELESAI (2.20.0) | CrashLog.java + tombol bagikan di Pengaturan |
| S-05 | WebView utama `setAllowFileAccess(true)` | DITOLAK | diperlukan untuk aset `file://`; alternatif WebViewAssetLoader dinilai tidak sepadan |
| S-06 | `probeNow()` memuat URL tanpa validasi skema | SELESAI (2.20.1) | probeNow hanya memuat http/https; skema lain langsung gagal |

## K — kode & ketahanan

| id | isu | status | catatan |
|---|---|---|---|
| K-01 | session token Places tidak kedaluwarsa idle | SELESAI (2.20.0) | sesi menganggur >2 mnt dimulai ulang |
| K-02 | `ROUTE_SRC` tidak diperbarui setelah unduhan GTFS | SELESAI (2.20.0) | ROUTE_SRC diperbarui saat unduhan selesai |
| K-03 | `TILES_DOWN` hanya pulih saat event `online` | SELESAI (2.20.0) | TILES_DOWN pulih sendiri setelah 5 mnt |
| K-04 | `static` ada di `CAPS` tapi tak pernah ditandai | SELESAI (2.20.0) | `static` keluar dari CAPS |
| K-05 | 23 pemakaian `localStorage` langsung di luar `store()` | SELESAI (2.20.0) | semua akses lewat LS.get/set/del |
| K-06 | 4 `innerHTML` gabungan tanpa `esc()` (app.js 1342, 1457, 2209, 3132) | BENAR | ditinjau: 9 temuan, semuanya memakai data internal atau label statis |
| K-07 | 6 `catch` kosong di JS | BENAR | ditinjau: catch kosong pada jalur opsional (foto/cache) dan disengaja |
| K-08 | 84 `catch` di Java, sebagian menelan error | SELESAI (2.20.0) | sebagian: crash handler menutup kebutuhan diagnosa |
| K-09 | 6 tombol berikon tanpa `aria-label` | BENAR | ditinjau: tombol berikon punya teks label, tidak perlu aria-label |
| K-10 | `lumi:pcache` tidak ikut `BACKUP_KEYS` | SELESAI (2.20.0) | `pcache` masuk BACKUP_KEYS |
| K-11 | hasil rute yang dihitung sebelum GTFS resmi masuk tidak dihitung ulang | SELESAI (2.20.1) | hasil yang sudah tampil dihitung ulang setelah data resmi masuk |

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
| F-08 | kartu "Perbarui rute" balik di Pengaturan | SELESAI (2.20.0) | = K-02 |

## R — rilis & proses

| id | isu | status | catatan |
|---|---|---|---|
| R-01 | APK rilis tidak membawa GTFS | DITOLAK | dibatalkan atas keputusan P-04: build sengaja tanpa GTFS, data diunduh saat berjalan |
| R-02 | jalur rilis tanpa gerbang tes | SELESAI | 2.19.6: job `Uji sebelum terbit` + `needs` |
| R-03 | tanda tangan rilis memakai kunci debug | DI LUAR | butuh `LUMI_KEYSTORE_BASE64` + password |
| R-04 | pemicu CI pada push | BENAR | pengamatan sebelumnya keliru: push memicu run (ce0be3c). Yang tidak pernah tercatat hanya schedule |
| R-05 | `ui_check` (4 mnt) belum ikut gerbang rilis | SELESAI (2.20.1) | ui_check en+id masuk job uji gerbang rilis |
| R-06 | label "Latest" tidak dipindah otomatis | SELESAI (2.20.0) | langkah `gh release edit --latest` di backfill |
| R-07 | commit kosong `f4261f7` di histori | DITOLAK | commit kosong dibiarkan; menulis ulang histori main lebih berisiko daripada manfaatnya |
| R-08 | workflow terjadwal belum pernah berjalan | SELESAI (2.20.2) | dispatcher data-maintenance.yml sudah diuji: route-watch jalan dari satu tombol. schedule sendiri belum terbukti |

## D — data

| id | isu | status | catatan |
|---|---|---|---|
| D-01 | arah rute tanpa `shape` | SELESAI (2.20.0) | `data/route_shape_report.txt` ditulis build_data; 207 arah | garis jatuh ke fallback lurus; perlu laporan mana saja |
| D-02 | 42 nama halte kembar dengan titik >1,5 km | SELESAI (2.20.0) | baris kembar diberi penanda koordinat | terjauh "Jembatan Merah" 8.369 m; perlu disambiguasi di pencarian |
| D-03 | model rail memakai satu angka tunggu (`KRL wait 8`) | SELESAI (2.20.1) | KRL 6 mnt jam sibuk / 18 mnt di luar; LRTJ 6/12 |
| D-03 | 6.991 titik halte, 3.277 unik | SELESAI (2.20.1) | KRL 6 mnt jam sibuk / 18 mnt di luar; LRTJ 6/12 |
| D-04 | koordinat di luar Jabodetabek | BENAR | 0 |
| D-05 | rute dengan <2 halte | BENAR | 0 |
| D-06 | moda tanpa tarif | BENAR | 0 |

## T — tes

| id | isu | status | catatan |
|---|---|---|---|
| T-01 | `MainActivity` (84 KB), `GtfsImporter`, `BusWatchService`, `Reminders`, `NavService`, `OfflineMap` tanpa tes | SEBAGIAN (2.20.1) | GtfsImporterTest ditambahkan; Activity/service tetap butuh instrumentation |
| T-02 | `app.js` 4.600 baris hanya lewat smoke UI | SEBAGIAN (2.20.1) | ui_check kini gagal bila perencanaan <3 opsi; unit app.js belum ada |
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
