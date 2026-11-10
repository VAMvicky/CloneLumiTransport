/* Lumi Transport — bahasa antarmuka (Indonesia / Inggris).
 *
 * Teks sumber aplikasi ditulis dalam bahasa Indonesia. Saat bahasa Inggris dipilih:
 *  1. Teks statis (judul, tombol, keterangan) diterjemahkan langsung di DOM lewat kamus `D`
 *     (cocok utuh per simpul teks) dan aturan `R` (teks dari data, mis. catatan rute dan jam operasi).
 *     MutationObserver menerjemahkan apa pun yang dirender belakangan, termasuk toast dan pop-up.
 *  2. Kalimat yang memuat nama/angka dirakit di app.js lewat LumiI18n.L("teks id", "english text").
 *  3. Teks yang keluar dari halaman (bagikan, gambar rute, suara, notifikasi) memakai LumiI18n.t().
 * Nama halte, stasiun, dan trayek tidak diterjemahkan.
 */
(function (root) {
  "use strict";
  var lang = "id";
  try {
    var c = JSON.parse(localStorage.getItem("lumi:cfg") || "null");
    if (c && (c.lang === "en" || c.lang === "id")) lang = c.lang;
    else lang = (navigator.language || "id").toLowerCase().indexOf("id") === 0 ? "id" : "en";
  } catch (e) { lumiLog(e); }
  var EN = lang === "en";

  /* ------------------------------------------------------------ kamus: teks utuh */
  var D = {
    // header, nav, tab
    "Semua moda Jabodetabek, satu rute": "Every Greater Jakarta mode, one route",
    "Dari": "From", "Ke": "To", "Cari rute": "Find route", "Lokasi saya": "My location", "Pakai lokasi saya": "Use my location",
    "Berangkat sekarang": "Leaving now", "Pengaturan": "Settings", "Tukar asal dan tujuan": "Swap origin and destination",
    "Hapus asal": "Clear origin", "Hapus tujuan": "Clear destination",
    "Cari asal: alamat, halte, atau tempat": "From: address, stop, or place",
    "Cari tujuan: alamat, halte, atau tempat": "To: address, stop, or place",
    "Perjalanan": "Trip", "Rute": "Routes", "Halte": "Stops", "Tarif": "Fares", "Riwayat": "History",
    "Info rute": "Route info", "Pilih rute untuk melihat halte dan stasiun yang dilewati.": "Pick a route to see the stops and stations it serves.",
    "Cari rute: 9, 13C, Bogor, MRT, Blok M…": "Search routes: 9, 13C, Bogor, MRT, Blok M…",
    "Tarif & info": "Fares & info", "Tarif dan info": "Fares and info",
    "Perkiraan tarif yang dipakai Lumi untuk menghitung biaya perjalanan.": "Fare estimates Lumi uses to work out trip costs.",
    "Halte & stasiun": "Stops & stations", "Halte dan stasiun": "Stops and stations",
    "Cari halte Transjakarta atau stasiun KRL, MRT, LRT, dan KA Bandara.": "Find a Transjakarta stop or a KRL, MRT, LRT or Airport Rail station.",
    "Cari halte atau stasiun": "Search stops or stations",
    "Riwayat perjalanan": "Trip history", "Perjalanan yang pernah kamu mulai, beserta ongkosnya.": "Trips you have started, with what they cost.",
    "Kembali": "Back", "Bagikan": "Share", "Detail perjalanan": "Trip details", "Tutup": "Close",
    // beranda
    "Bus di sekitarmu": "Buses near you", "LANGSUNG": "LIVE",
    "Lihat posisi bus Transjakarta & Mikrotrans saat ini di peta.": "See where Transjakarta & Mikrotrans buses are right now on the map.",
    "Rute favorit": "Favourite routes", "Pencarian terakhir": "Recent searches", "Moda yang tercakup": "Modes covered",
    "Yang Lumi hitungkan untukmu": "What Lumi plans for you",
    "Belum ada rute favorit. Cari rute, lalu ketuk ☆ Simpan di hasil pencarian.": "No favourite routes yet. Plan a route, then tap ☆ Save in the results.",
    "ke": "to",
    "BRT, non-BRT, Royaltrans": "BRT, non-BRT, Royaltrans",
    "LRT Jakarta & Jabodebek": "LRT Jakarta & Jabodebek",
    "Angkot JakLingko, gratis": "JakLingko minibuses, free",
    "Ojol motor & mobil": "Ride-hailing bike & car", "Estimasi tarif Gojek / Grab": "Gojek / Grab fare estimates",
    "Kereta cepat Jakarta – Bandung": "Jakarta – Bandung high-speed rail",
    "Isi asal & tujuan, estimasi ojol muncul di hasil": "Enter origin & destination; ride-hailing estimates appear in the results",
    // jam berangkat
    "Kapan berangkat?": "When are you leaving?", "Sekarang": "Now", "Berangkat jam": "Leave at", "Tiba sebelum": "Arrive by",
    "Lumi hanya menyarankan moda yang beroperasi pada jam tersebut. Tengah malam, yang tersedia hanya Transjakarta koridor 1–14 (AMARI), Mikrotrans JAK36/47/52/75, dan ojol.":
      "Lumi only suggests modes running at that time. Around midnight only Transjakarta corridors 1–14 (AMARI), Mikrotrans JAK36/47/52/75 and ride-hailing are available.",
    "Pakai waktu ini": "Use this time",
    // bagikan dari Google Maps
    "Lokasi diterima": "Location received", "Membaca tautan…": "Reading link…", "Simpan ke tempat tersimpan": "Save to saved places",
    "Jadikan asal": "Set as origin", "Jadikan tujuan": "Set as destination",
    "Membaca lokasi dari tautan…": "Reading location from the link…", "Lokasi dari Google Maps": "Location from Google Maps",
    "Koordinat tidak terbaca dari tautan — geser pin ke lokasinya": "Couldn't read coordinates from the link — drag the pin to the place",
    "Koordinat tidak terbaca dari tautan. Pilih titiknya di peta (nama sudah terisi).": "Couldn't read coordinates from the link. Pick the point on the map (the name is already filled in).",
    // pilih titik
    "Pilih titik di peta": "Pick a point on the map", "Ke lokasi saya": "Go to my location",
    "Geser peta sampai pin tepat di lokasimu": "Move the map until the pin sits on your location",
    "Simpan sebagai tempat": "Save as a place", "Nama tempat, mis. Laundry Alsusco": "Place name, e.g. Alsusco Laundry",
    "Pakai titik ini": "Use this point", "Pilih titik asal": "Pick the origin point", "Pilih titik tujuan": "Pick the destination point",
    "Melepas pin…": "Dropping pin…", "Isi nama tempat untuk menyimpan": "Enter a place name to save it",
    // saran
    "Cari alamat di Google Maps": "Search for an address on Google Maps",
    "Pilih tempatnya, lalu Bagikan → Lumi Transport": "Pick the place, then Share → Lumi Transport",
    "Lokasi saya sekarang": "My current location", "Pakai GPS ponsel": "Use the phone's GPS",
    "Dari Google Maps": "From Google Maps", "Gunakan lokasi dari tautan Google Maps": "Use the location from the Google Maps link",
    "Saran alamat: OpenStreetMap": "Address suggestions: OpenStreetMap",
    "Mencari lokasi…": "Finding location…",
    // toast umum
    "Isi titik asal dulu": "Enter an origin first", "Isi tujuan dulu": "Enter a destination first",
    "Isi asal dan tujuan dulu": "Enter an origin and destination first",
    "Rute ini sudah ada di favorit": "This route is already a favourite", "Rute disimpan ke favorit": "Route saved to favourites",
    "Rute favorit disimpan.": "Favourite route saved.", "Favorit dihapus.": "Favourite removed.",
    "Cadangan dibagikan · simpan ke file atau catatan": "Backup shared · save it to a file or note",
    "Data dipulihkan": "Data restored", "Teks cadangan tidak dikenali": "Backup text not recognised",
    "Di Google Maps: pilih tempatnya → Bagikan → Lumi Transport": "In Google Maps: pick the place → Share → Lumi Transport",
    "GPS aktif": "GPS on", "GPS belum aktif": "GPS is off",
    "Mode pendampingan hanya tersedia di aplikasi Android": "Guidance mode is only available in the Android app",
    "Pendampingan dihentikan": "Guidance stopped",
    "Pendampingan sudah berjalan — lihat kartu biru di bawah": "Guidance is already running — see the blue card below",
    "Rute disalin": "Route copied", "Gambar rute diunduh": "Route image downloaded", "Membuat gambar rute…": "Creating route image…",
    "Riwayat perjalanan dihapus": "Trip history cleared", "Riwayat perjalanan dihapus.": "Trip history cleared.",
    "Belum ada rilis untuk dibandingkan": "No release to compare against yet", "Tidak bisa memeriksa update (offline?)": "Couldn't check for updates (offline?)",
    "Memeriksa…": "Checking…",
    "Pembaruan data hanya tersedia di aplikasi Android": "Data updates are only available in the Android app",
    "Menghubungi server Transjakarta…": "Contacting the Transjakarta server…",
    "Data rute resmi sudah diperbarui — berlaku saat aplikasi dibuka ulang": "Official route data updated — takes effect when the app is reopened",
    "Selesai. Memuat ulang…": "Done. Reloading…",
    "Izin diatur di aplikasi Android": "Permissions are managed in the Android app", "Hanya di aplikasi Android": "Android app only",
    "Izinkan lokasi, notifikasi, dan latar belakang dulu": "Allow location, notifications and background first",
    "Mencari lokasimu…": "Finding your location…", "Lokasi tidak tersedia": "Location unavailable", "Izin lokasi ditolak": "Location permission denied",
    "Aktifkan GPS lalu coba lagi.": "Turn on GPS and try again.",
    // GPS
    "Aktifkan Lokasi (GPS) di HP agar Lumi bisa menemukan posisimu untuk “Lokasi saya” dan mode pendampingan.":
      "Turn on Location (GPS) on your phone so Lumi can find where you are for “My location” and guidance mode.",
    "Aktifkan GPS": "Turn on GPS", "Nanti saja": "Not now",
    // bus langsung
    "Terhubung · menunggu data bus…": "Connected · waiting for bus data…", "Menghubungkan…": "Connecting…",
    "Menyambung ulang…": "Reconnecting…", "Gagal terhubung": "Connection failed",
    "Belum bisa terhubung ke data armada": "Can't connect to the fleet feed yet", "Lumi akan mencoba lagi otomatis.": "Lumi will retry automatically.",
    "Buka aplikasi TJ": "Open the TJ app",
    "Lumi akan menampilkan bus Transjakarta, Mikrotrans, dan Royaltrans yang melintas di sekitarmu.": "Lumi will show Transjakarta, Mikrotrans and Royaltrans buses passing near you.",
    "Tidak ada rute bus di dekatmu": "No bus routes near you", "Coba di dekat halte Transjakarta atau jalur Mikrotrans.": "Try near a Transjakarta stop or a Mikrotrans route.",
    "Menunggu posisi bus…": "Waiting for bus positions…", "Data muncul begitu bus mengirim posisi (biasanya beberapa detik).": "Data appears as soon as buses report their position (usually a few seconds).",
    "Posisi dari feed armada Transjakarta (diperbarui tiap beberapa detik). Lumi tidak berafiliasi dengan Transjakarta.":
      "Positions from the Transjakarta fleet feed (updated every few seconds). Lumi is not affiliated with Transjakarta.",
    "Posisi bus langsung": "Live bus positions", "Menghubungkan ke data armada…": "Connecting to the fleet feed…",
    "Belum bisa terhubung ke data armada.": "Can't connect to the fleet feed yet.",
    // perubahan rute
    "Baru": "New", "Dihapus": "Removed", "Berubah": "Changed", "Sebelum & sesudah": "Before & after", "Lihat rute": "View route",
    "Perubahan rute": "Route changes", "Rute baru": "New route", "Rute dihapus": "Route removed", "Rute berubah": "Route changed",
    "Nama trayek": "Route name", "Urutan halte berubah": "Stop order changed",
    "Perbandingan": "Comparison", "Sebelum": "Before", "Sesudah": "After",
    "Halte baru": "New stops", "Tidak dilewati lagi": "No longer served", "Tetap": "Unchanged", "baru": "new", "dihapus": "removed",
    "Urutan halte sebelum perubahan ini belum tersimpan (tercatat sebelum fitur ini ada). Di bawah: halte yang berubah dan rute saat ini.":
      "The stop order before this change wasn't saved (it was recorded before this feature existed). Below: the stops that changed and the current route.",
    "Semua perubahan": "All changes", "Oke, mengerti": "OK, got it",
    "Belum ada perubahan tercatat sejak data pertama diunduh.": "No changes recorded since the data was first downloaded.",
    // pendampingan
    "Mulai pendampingan": "Start guidance", "Pendampingan sedang berjalan": "Guidance is running",
    "Mencari posisi GPS…": "Finding GPS position…", "Kamu akan diberi tahu sebelum harus turun.": "You'll be told before you need to get off.",
    "Pendampingan berjalan": "Guidance running", "Menunggu posisi GPS…": "Waiting for GPS position…",
    "Pusatkan": "Recentre", "pemberhentian lagi": "stops to go", "jalan kaki lagi": "left to walk",
    "SELESAI": "DONE", "PENDAMPINGAN": "GUIDANCE", "Berhenti": "Stop", "Mode jendela kecil (PiP)": "Picture-in-picture mode (PiP)",
    // hasil
    "Mencari rute…": "Finding routes…", "Ubah": "Edit", "Bersihkan": "Clear", "Bersihkan dan kembali ke beranda": "Clear and go back home",
    "Rekomendasi": "Recommended", "Tercepat": "Fastest", "Termurah": "Cheapest", "Minim transit": "Fewest transfers",
    "Urutkan": "Sort", "Moda": "Modes", "Ojol": "Ride-hail",
    "Coba lepas salah satu filter moda.": "Try removing one of the mode filters.",
    "Yang tersedia: Transjakarta koridor 1–14 (AMARI, tiap ±20–40 menit), Mikrotrans JAK36/JAK47/JAK52/JAK75, dan ojol.":
      "Available: Transjakarta corridors 1–14 (AMARI, every ±20–40 min), Mikrotrans JAK36/JAK47/JAK52/JAK75 and ride-hailing.",
    "Tarif Transjakarta pukul 05.00–07.00 hanya Rp2.000.": "Transjakarta fares are only Rp2,000 from 05.00 to 07.00.",
    "Belum ada angkutan umum yang cocok pada jam ini": "No suitable public transport at this time",
    "Banyak moda sudah/belum beroperasi. Coba ubah jam berangkat, atau pakai ojol.": "Many modes have stopped or haven't started yet. Try another departure time, or use ride-hailing.",
    "Lokasi mungkin terlalu dekat atau di luar jangkauan data. Ojol bisa jadi pilihan.": "The places may be too close together or outside the data coverage. Ride-hailing could be an option.",
    "mnt": "min", "j": "h", "Tanpa pindah": "No transfers", "tanpa pindah": "no transfers",
    "Bagikan rute": "Share route", "Bagikan rute ini": "Share this route", "Buka Gojek": "Open Gojek", "Buka Grab": "Open Grab",
    "jalan kaki": "walking",
    "Waktu dan tarif adalah perkiraan. Tarif ojol mengikuti batas tarif Kemenhub zona Jabodetabek ditambah biaya jasa; harga di aplikasi bisa berbeda saat jam sibuk.":
      "Times and fares are estimates. Ride-hailing fares follow the Ministry of Transport's Greater Jakarta fare limits plus a service fee; in-app prices can differ at peak times.",
    "Ojol motor": "Ride-hail bike", "Ojol mobil": "Ride-hail car", "Ojol + bus": "Ride-hail + bus", "Ojol + KRL": "Ride-hail + KRL",
    "Ojol + MRT": "Ride-hail + MRT", "Ojol + LRT": "Ride-hail + LRT", "Ojol + KA Bandara": "Ride-hail + Airport Rail", "Ojol + Whoosh": "Ride-hail + Whoosh",
    "KA Bandara": "KA Bandara (Airport Rail)",
    // detail perjalanan
    "Arah": "Towards", "Turun di sini": "Get off here", "Sampai tujuan": "Arrived at destination", "sudah termasuk": "already paid",
    "Bisa juga naik": "Also possible:", "Bagikan rute (gambar)": "Share route (image)",
    "Jadwal tidak real-time. Cek pengumuman operator untuk gangguan atau perubahan rute.": "Schedules are not real-time. Check operator announcements for disruptions or route changes.",
    "Laporkan halte/rute salah": "Report a wrong stop/route", "Sembunyikan pemberhentian": "Hide stops",
    "Mobil": "Car", "Motor": "Bike", "AMARI": "AMARI",
    // daftar & detail rute
    "Semua": "All", "TJ non-BRT": "TJ non-BRT", "Royaltrans & Jabodetabek": "Royaltrans & Jabodetabek",
    "Transjakarta · koridor utama (24 jam)": "Transjakarta · main corridors (24 hours)", "Transjakarta · lintas koridor BRT": "Transjakarta · cross-corridor BRT",
    "Transjakarta · angkutan rusun": "Transjakarta · public-housing feeders", "Transjakarta · bus wisata": "Transjakarta · tourist buses",
    "Transjakarta · angkutan pengumpan": "Transjakarta · feeder services", "Transjakarta non-BRT": "Transjakarta non-BRT",
    "Rute tidak ditemukan": "No routes found", "Coba kode seperti 9, 13C, JAK.10, atau nama halte/stasiun.": "Try a code such as 9, 13C, JAK.10, or a stop/station name.",
    "24 jam": "24 hours", "Jam operasional": "Operating hours", "Buka peta rute di transjakarta.co.id": "Open the route map on transjakarta.co.id",
    "Berangkat dari sini": "Leave from here", "Pergi ke sini": "Go here",
    // tarif & info
    "Transjakarta koridor 1–14": "Transjakarta corridors 1–14", "24 jam (AMARI 22.00–05.00)": "24 hours (AMARI 22.00–05.00)",
    "TJ lintas koridor & pengumpan": "TJ cross-corridor & feeders", "Mikrotrans JAK36, JAK47, JAK52, JAK75": "Mikrotrans JAK36, JAK47, JAK52, JAK75",
    "Mikrotrans lainnya": "Other Mikrotrans", "Royaltrans & Transjabodetabek": "Royaltrans & Transjabodetabek",
    "Saat kamu memilih jam berangkat, Lumi hanya memakai moda yang beroperasi pada jam itu. Jadwal bisa berubah saat libur nasional.":
      "When you pick a departure time, Lumi only uses modes running at that time. Schedules can change on public holidays.",
    "BRT, non-BRT & Transjabodetabek (mis. T31, P11, SH1)": "BRT, non-BRT & Transjabodetabek (e.g. T31, P11, SH1)",
    "Pukul 05.00–07.00": "From 05.00 to 07.00", "Pindah rute tanpa keluar halte": "Change routes without leaving the stop", "Gratis": "Free",
    "Turun di luar halte lalu naik lagi": "Exit the stop and board again", "Bayar lagi (tap ulang)": "Pay again (tap again)",
    "SH2 Blok M – Bandara Soetta (sejak 1 Sep 2026)": "SH2 Blok M – Soetta Airport (since 1 Sep 2026)",
    "Mikrotrans (JakLingko)": "Mikrotrans (JakLingko)",
    "Bayar pakai kartu uang elektronik atau aplikasi JakLingko/TJ:IKA. Pemprov DKI mengumumkan penyesuaian tarif Transjakarta mulai 1 Januari 2027; besarannya belum diumumkan.":
      "Pay with an e-money card or the JakLingko/TJ:IKA app. The Jakarta government has announced a Transjakarta fare adjustment from 1 January 2027; the new amount hasn't been announced yet.",
    "25 km pertama": "First 25 km", "Tiap 10 km berikutnya": "Each further 10 km",
    "Tidak naik pada 2026. Kartu Multi Trip, uang elektronik, atau QR di aplikasi Access by KAI.": "No increase in 2026. Multi Trip Card, e-money, or QR in the Access by KAI app.",
    "1 stasiun (mis. Lebak Bulus – Fatmawati)": "1 station (e.g. Lebak Bulus – Fatmawati)", "Tiap stasiun berikutnya": "Each further station",
    "Maksimum (mis. Lebak Bulus – Bundaran HI)": "Maximum (e.g. Lebak Bulus – Bundaran HI)",
    "LRT Jakarta, termasuk Velodrome – Manggarai (flat)": "LRT Jakarta, including Velodrome – Manggarai (flat)",
    "LRT Jabodebek, 1 km pertama": "LRT Jabodebek, first 1 km", "LRT Jabodebek, per km berikutnya": "LRT Jabodebek, each further km",
    "LRT Jabodebek, jam sibuk (Sen–Jum 06.00–08.59 & 16.00–19.59)": "LRT Jabodebek, peak hours (Mon–Fri 06.00–08.59 & 16.00–19.59)",
    "LRT Jabodebek, di luar jam sibuk, Sabtu, Minggu & libur": "LRT Jabodebek, off-peak, Saturday, Sunday & holidays",
    "maks. Rp20.000": "max. Rp20,000", "maks. Rp10.000": "max. Rp10,000",
    "Pemprov DKI menyebut tarif baru LRT Jakarta akan segera ditetapkan; sampai itu tetap flat Rp5.000.": "The Jakarta government says a new LRT Jakarta fare will be set soon; until then it stays a flat Rp5,000.",
    "KA Bandara & Whoosh": "Airport Rail & Whoosh",
    "KA Bandara Manggarai / BNI City / Duri – Soetta": "Airport Rail Manggarai / BNI City / Duri – Soetta",
    "KA Bandara Rawa Buaya / Batu Ceper – Soetta": "Airport Rail Rawa Buaya / Batu Ceper – Soetta",
    "KA Bandara Manggarai – BNI City": "Airport Rail Manggarai – BNI City", "mulai Rp250.000": "from Rp250,000",
    "Whoosh memakai tarif dinamis (bergantung kelas, hari, dan jam); Lumi memakai tarif terendah Rp250.000.": "Whoosh uses dynamic pricing (by class, day and time); Lumi uses the lowest fare, Rp250,000.",
    "Ojol (estimasi)": "Ride-hailing (estimate)", "Motor per km (zona Jabodetabek)": "Bike per km (Greater Jakarta zone)",
    "Motor minimum (4 km pertama)": "Bike minimum (first 4 km)", "Mobil per km (perkiraan)": "Car per km (estimate)", "Biaya jasa aplikasi": "App service fee",
    "Batas tarif motor mengacu pada KP Menhub 564/2022 (masih berlaku; Perpres 27/2026 menetapkan potongan aplikasi 8% dan tarif baru akan diatur Kemenhub). Harga akhir ditentukan aplikasi dan bisa naik saat jam sibuk atau hujan.":
      "Bike fare limits follow Transport Ministerial Decree 564/2022 (still in force; Presidential Regulation 27/2026 sets an 8% app commission and new fares will be set by the ministry). Final prices are set by the apps and can rise at peak times or in rain.",
    "Sumber data rute": "Route data sources", "Daftar & kode rute Transjakarta:": "Transjakarta route list & codes:",
    "(diakses 10 Okt 2026).": "(accessed 10 Oct 2026).",
    "Halte & rute BRT Transjakarta: GTFS resmi Transjakarta (unduhan 26 Jan 2024) via": "Transjakarta BRT stops & routes: official Transjakarta GTFS (downloaded 26 Jan 2024) via",
    "Rute non-BRT, Mikrotrans, Royaltrans: GTFS Transjakarta 2021 via": "Non-BRT, Mikrotrans and Royaltrans routes: Transjakarta GTFS 2021 via",
    "— sebagian rute mungkin sudah berubah.": "— some routes may have changed since.",
    "Koordinat stasiun KA: data sarana prasarana Kemenhub via": "Rail station coordinates: Ministry of Transport infrastructure data via",
    "Urutan stasiun KRL, MRT, LRT, KA Bandara: Wikipedia & pengumuman operator (2026).": "KRL, MRT, LRT and Airport Rail station order: Wikipedia & operator announcements (2026).",
    "Peta: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors. Alamat: Google Maps (dibagikan ke Lumi). Jarak jalan untuk ojol: OSRM.":
      "Map: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors. Addresses: Google Maps (shared to Lumi). Road distances for ride-hailing: OSRM.",
    "Aktif:": "Active:",
    // pengaturan
    "Data rute: GTFS resmi Transjakarta": "Route data: official Transjakarta GTFS", "Perbarui rute Transjakarta": "Update Transjakarta routes",
    "Data bawaan memakai halte BRT 2024 dan rute non-BRT 2021, sehingga sebagian rute (mis. 9H, T31, P11) belum ada/sesuai. Lumi mengunduh GTFS resmi Transjakarta otomatis; tekan tombol di bawah bila belum berhasil.":
      "The built-in data uses 2024 BRT stops and 2021 non-BRT routes, so some routes (e.g. 9H, T31, P11) are missing or out of date. Lumi downloads the official Transjakarta GTFS automatically; tap the button below if that hasn't worked yet.",
    "Perbarui lagi": "Update again", "Unduh data rute resmi": "Download official route data",
    "Peta": "Map", "Gratis tanpa API key:": "Free, no API key:", "OpenFreeMap": "OpenFreeMap",
    "(data OpenStreetMap). Tajam di semua zoom dan halus saat digeser.": "(OpenStreetMap data). Sharp at every zoom level and smooth when panning.",
    "Gaya peta": "Map style", "Liberty (berwarna)": "Liberty (colourful)", "Bright (kontras)": "Bright (high contrast)",
    "Positron (terang, polos)": "Positron (light, plain)", "OpenStreetMap standar": "Standard OpenStreetMap",
    "Perangkat ini tidak mendukung WebGL, jadi peta memakai OpenStreetMap standar.": "This device doesn't support WebGL, so the map uses standard OpenStreetMap.",
    "Mencari alamat": "Finding addresses",
    "Cari di Google Maps": "Search on Google Maps", "Lumi Transport": "Lumi Transport",
    "Tempat tersimpan": "Saved places", "Tempat yang pernah kamu bagikan dari Google Maps. Muncul saat mengetik di kolom Dari/Ke.": "Places you have shared from Google Maps. They appear as you type in the From/To fields.",
    "Hapus": "Delete", "Belum ada tempat tersimpan.": "No saved places yet.",
    "Belum ada perjalanan. Begitu kamu memulai pendampingan pada sebuah rute, perjalanan itu tercatat di sini beserta ongkosnya.":
      "No trips yet. As soon as you start guidance on a route, the trip is recorded here with its cost.",
    "Hapus riwayat": "Clear history",
    "Rute tersimpan": "Saved route", "Pakai": "Use", 
    "Simpan rute yang sedang aktif": "Save the current route",
    "Cadangkan & pulihkan": "Back up & restore", "Cadangan berisi pengaturan, rute favorit, riwayat perjalanan, dan tempat tersimpan.": "The backup contains settings, favourite routes, trip history and saved places.",
    "Cadangkan (bagikan)": "Back up (share)", "Tempel teks cadangan di sini, lalu ketuk Pulihkan": "Paste the backup text here, then tap Restore",
    "Pulihkan dari teks": "Restore from text",
    "Aksesibilitas": "Accessibility", "Mode aksesibel": "Accessible mode", "Panduan suara": "Voice guidance",
    "Huruf lebih besar, tombol lebih tinggi, dan animasi dikurangi. Panduan suara membacakan langkah saat pendampingan berjalan.":
      "Larger text, taller buttons and less animation. Voice guidance reads the steps aloud while guidance is running.",
    "Mode aksesibel aktif.": "Accessible mode on.", "Mode aksesibel dimatikan.": "Accessible mode off.",
    "Panduan suara aktif.": "Voice guidance on.", "Panduan suara dimatikan.": "Voice guidance off.",
    "Bahasa / Language": "Language / Bahasa", "Bahasa aplikasi": "App language", "Bahasa Indonesia": "Bahasa Indonesia", "English": "English",
    "Semua teks aplikasi ikut berganti, termasuk hasil rute, notifikasi, dan panduan suara.": "All app text switches, including route results, notifications and voice guidance.",
    "Language set to English.": "Language set to English.",
    "Tentang Lumi": "About Lumi", "Lisensi": "Licence", "Repo GitHub": "GitHub repo", "Cek update": "Check for updates", "Laporkan masalah": "Report a problem",
    "Lihat": "Show", "Sembunyi": "Hide",
    // sambutan
    "Semua transportasi Jabodetabek dalam satu rute: Transjakarta, Mikrotrans, KRL, MRT, LRT, sampai ojol.": "All Greater Jakarta transport in one route: Transjakarta, Mikrotrans, KRL, MRT, LRT, even ride-hailing.",
    "Semua kombinasi rute": "Every route combination", "Tercepat, termurah, atau minim transit, lengkap dengan tarif dan waktu tiba.": "Fastest, cheapest or fewest transfers, complete with fares and arrival times.",
    "Pendampingan GPS": "GPS guidance", "Tahu posisimu, sisa pemberhentian, dan diingatkan saat harus turun.": "Knows where you are and how many stops are left, and reminds you when to get off.",
    "Rute selalu terbaru": "Always up-to-date routes", "Data resmi Transjakarta dicek berkala, kamu diberi tahu bila ada rute berubah.": "Official Transjakarta data is checked regularly, and you're told when a route changes.",
    "Mulai": "Get started",
    "Alamat dicari lewat Google Maps lalu dibagikan ke Lumi. Lokasimu hanya disimpan di HP ini.": "Addresses are found in Google Maps and shared to Lumi. Your location is only stored on this phone.",
    "Satu langkah lagi": "One more step", "Izinkan agar Lumi bisa mendampingi perjalanan dan memberi tahu saat harus turun.": "Allow these so Lumi can guide your trip and tell you when to get off.",
    "Izinkan lokasi": "Allow location", "Untuk “Lokasi saya” dan pendampingan GPS.": "For “My location” and GPS guidance.",
    "Izinkan notifikasi": "Allow notifications", "Peringatan turun dan info rute berubah.": "Get-off alerts and route-change news.",
    "Berjalan di latar belakang": "Run in the background", "Agar pendampingan tetap jalan saat layar mati.": "So guidance keeps running when the screen is off.",
    "opsional": "optional", "✓ Sudah diizinkan": "✓ Allowed",
    "Aktifkan “Mulai otomatis” agar Lumi tidak ditutup oleh HP.": "Turn on “Autostart” so the phone doesn't close Lumi.",
    "Buka pengaturan Mulai otomatis": "Open Autostart settings", "Mulai cari rute": "Start planning",
    "Izinkan ketiga akses di atas dulu untuk melanjutkan.": "Allow all three permissions above to continue.",
    // engine: catatan tarif & moda tutup
    "transit di dalam halte, tanpa tap ulang": "transfer inside the stop, no second tap",
    "tap lagi: turun di luar halte": "tap again: you exit the stop",
    "jam sibuk: Rp5.000 + Rp700/km": "peak: Rp5,000 + Rp700/km",
    "akhir pekan: maks. Rp10.000": "weekend: max. Rp10,000", "di luar jam sibuk: maks. Rp10.000": "off-peak: max. Rp10,000",
    "Transjakarta BRT (selain koridor 1–14)": "Transjakarta BRT (except corridors 1–14)", "Mikrotrans (kecuali JAK36/47/52/75)": "Mikrotrans (except JAK36/47/52/75)",
    // jam operasi & catatan rute (data)
    "05.00–22.00": "05.00–22.00",
    "24 jam. Pukul 22.00–05.00 dilayani bus AMARI (malam), tiap ±20–40 menit.": "24 hours. From 22.00 to 05.00 served by AMARI night buses, every ±20–40 min.",
    "24 jam (layanan AMARI Mikrotrans).": "24 hours (Mikrotrans AMARI service).",
    "±05.00–21.00 (sebagian rute hanya jam sibuk)": "±05.00–21.00 (some routes peak hours only)",
    "05.00–21.40, tiap ±20 menit": "05.00–21.40, every ±20 min",
    "±04.00–24.00 (kereta terakhir ±23.30)": "±04.00–24.00 (last train ±23.30)",
    "±05.00–23.00 (dari bandara 05.57–22.57, tiap 30–60 menit)": "±05.00–23.00 (from the airport 05.57–22.57, every 30–60 min)",
    "05.00–24.00. Jam sibuk tiap 5 menit, di luar itu tiap 10 menit.": "05.00–24.00. Every 5 min at peak times, otherwise every 10 min.",
    "05.30–00.20 (masa uji coba umum fase 1B)": "05.30–00.20 (phase 1B public trial period)",
    "Sen–Jum 05.30–23.00 · Sabtu 05.45–23.00 · Minggu/libur 06.00–22.30": "Mon–Fri 05.30–23.00 · Sat 05.45–23.00 · Sun/holidays 06.00–22.30",
    "±06.00–21.30 (cek jadwal KCIC)": "±06.00–21.30 (check the KCIC timetable)",
    "Koridor utama BRT. Halte: GTFS resmi Transjakarta (Jan 2024).": "Main BRT corridor. Stops: official Transjakarta GTFS (Jan 2024).",
    "Rute lintas koridor BRT. Halte: GTFS resmi Transjakarta (Jan 2024).": "Cross-corridor BRT route. Stops: official Transjakarta GTFS (Jan 2024).",
    "Angkutan pengumpan (non-BRT). Urutan halte dari GTFS 2021 — bisa berbeda dengan rute saat ini.": "Feeder service (non-BRT). Stop order from GTFS 2021 — may differ from the current route.",
    "Angkutan rusun. Urutan halte dari GTFS 2021 — bisa berbeda dengan rute saat ini.": "Public-housing service. Stop order from GTFS 2021 — may differ from the current route.",
    "Mikrotrans. Urutan halte dari GTFS 2021 — bisa berbeda dengan rute saat ini.": "Mikrotrans. Stop order from GTFS 2021 — may differ from the current route.",
    "Royaltrans. Urutan halte dari GTFS 2021 — bisa berbeda dengan rute saat ini.": "Royaltrans. Stop order from GTFS 2021 — may differ from the current route.",
    "Transjabodetabek (via Tol). Halte PIK 2 belum lengkap; halte Jakarta & PIK 1 dari daftar resmi (2026).": "Transjabodetabek (via toll road). PIK 2 stops are incomplete; Jakarta & PIK 1 stops from the official list (2026).",
    "Transjabodetabek Blok M–Bogor (via Tol Jagorawi). Halte di Bogor/Sentul belum lengkap.": "Transjabodetabek Blok M–Bogor (via the Jagorawi toll road). Bogor/Sentul stops are incomplete.",
    "Rute BRT. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "BRT route. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Angkutan pengumpan (non-BRT). Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Feeder service (non-BRT). The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Royaltrans. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Royaltrans. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Bus wisata. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Tourist bus. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Mikrotrans. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Mikrotrans. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Angkutan rusun. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Public-housing service. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Transjabodetabek. Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.": "Transjabodetabek. The stop list isn't in Lumi's offline data yet; see the official route map.",
    "Jakarta Kota – Bogor. Kereta setiap 5–10 menit pada jam sibuk.": "Jakarta Kota – Bogor. Trains every 5–10 min at peak times.",
    "Jakarta Kota/Angke – Nambo, bercabang di Citayam. Kereta tiap 60–120 menit.": "Jakarta Kota/Angke – Nambo, branching at Citayam. Trains every 60–120 min.",
    "Loop Cikarang – Manggarai – Tanah Abang – Kampung Bandan.": "Loop Cikarang – Manggarai – Tanah Abang – Kampung Bandan.",
    "Loop arah Pasar Senen – Kampung Bandan (searah jarum jam berlawanan).": "Loop via Pasar Senen – Kampung Bandan (anticlockwise).",
    "Tanah Abang – Rangkasbitung, sebagian perjalanan berakhir di Serpong/Parung Panjang/Maja.": "Tanah Abang – Rangkasbitung; some trips end at Serpong/Parung Panjang/Maja.",
    "Duri – Tangerang.": "Duri – Tangerang.",
    "Jakarta Kota – Tanjung Priok via Ancol & JIS.": "Jakarta Kota – Tanjung Priok via Ancol & JIS.",
    "Manggarai – Bandara Soekarno-Hatta (Terminal 1/2/3 via Skytrain). Kereta tiap ±30–60 menit.": "Manggarai – Soekarno-Hatta Airport (Terminals 1/2/3 via Skytrain). Trains every ±30–60 min.",
    "Lebak Bulus – Bundaran HI. Perpanjangan ke Monas ditargetkan akhir 2027.": "Lebak Bulus – Bundaran HI. The extension to Monas is targeted for late 2027.",
    "Pegangsaan Dua – Manggarai. Segmen Velodrome–Manggarai (fase 1B) uji coba umum mulai 12 Okt 2026.": "Pegangsaan Dua – Manggarai. The Velodrome–Manggarai segment (phase 1B) opened for public trial on 12 Oct 2026.",
    "Dukuh Atas – Harjamukti (Cibubur).": "Dukuh Atas – Harjamukti (Cibubur).",
    "Dukuh Atas – Jati Mulya (Bekasi).": "Dukuh Atas – Jati Mulya (Bekasi).",
    "Jakarta (Halim) – Bandung (Tegalluar/Padalarang). Wajib beli tiket & pilih kursi.": "Jakarta (Halim) – Bandung (Tegalluar/Padalarang). Tickets and seat selection required.",
    "Arah balik": "Return direction",
    "Lihat posisi bus": "See bus positions", "Stasiun": "Station", "Simpan ke favorit": "Save to favourites", "Tersimpan di favorit": "Saved to favourites",
    "Hapus dari favorit": "Remove from favourites", "Simpan": "Save", "Tersimpan": "Saved"
  };

  /* ------------------------------------------------------------ aturan: teks dari data */
  var MON = { Jan: "Jan", Feb: "Feb", Mar: "Mar", Apr: "Apr", Mei: "May", Jun: "Jun", Jul: "Jul", Agu: "Aug", Sep: "Sep", Okt: "Oct", Nov: "Nov", Des: "Dec" };
  function variantText(s) {
    // "tidak berhenti di A, B dll.; lewat C" / "mulai X, lewat Y, tanpa Z, s.d. W" (nama tetap)
    return s.replace(/\btidak berhenti di /g, "doesn't stop at ").replace(/\blewat /g, "via ").replace(/\bmulai /g, "starts at ")
      .replace(/\btanpa /g, "skips ").replace(/\bs\.d\. /g, "to ").replace(/ dll\./g, " etc.").replace(/\(sebagian bus\)/g, "(some buses)")
      .replace(/ via Tol\b/g, " via toll road").replace(/^via Tol\b/, "via toll road");
  }
  function diffText(s) {
    return s.replace(/Rute baru: /g, "New route: ").replace(/Nama trayek: /g, "Route name: ").replace(/Halte baru: /g, "New stops: ")
      .replace(/Tidak lagi lewat: /g, "No longer stops at: ").replace(/Urutan halte berubah/g, "Stop order changed")
      .replace(/Pola perjalanan bertambah/g, "More trip patterns").replace(/Pola perjalanan berkurang/g, "Fewer trip patterns")
      .replace(/, mis\. varian lewat tol\)/g, ", e.g. toll-road variants)").replace(/Rute tidak ada lagi di data resmi/g, "Route no longer in the official data")
      .replace(/ dll\. \(/g, " etc. (").replace(/ dll\./g, " etc.");
  }
  var R = [
    [/^Varian: (.+)$/, function (m) { return "Variant: " + variantText(m[1]); }],
    [/^Via Tol( \(sebagian bus\))?: (.+)$/, function (m) { return "Via toll road" + (m[1] ? " (some buses)" : "") + ": " + variantText(m[2]); }],
    [/^(via Tol|pola lain)$/, function (m) { return m[1] === "via Tol" ? "via toll road" : "other pattern"; }],
    [/^(?:(?:mulai|lewat|tanpa|s\.d\.) .+?|via Tol)(?: · (?:(?:mulai|lewat|tanpa|s\.d\.) .+|via Tol))?$/, function (m) { return variantText(m[0]); }],
    [/^(Rute baru|Nama trayek|Halte baru|Tidak lagi lewat|Urutan halte berubah|Pola perjalanan|Rute tidak ada lagi)/, function (m) { return diffText(m.input); }],
    [/^Halte: GTFS resmi Transjakarta \(diunduh (.+)\)\.$/, function (m) { return "Stops: official Transjakarta GTFS (downloaded " + m[1] + ")."; }],
    [/^(\d{1,2}) (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des) (\d{4})(, \d{2}\.\d{2})?$/, function (m) { return m[1] + " " + MON[m[2]] + " " + m[3] + (m[4] || ""); }],
    [/^(Ojol|Bus|Mikrotrans) \+ (.+)$/, function (m) { return (m[1] === "Ojol" ? "Ride-hail" : m[1]) + " + " + (m[2] === "bus" ? "bus" : m[2] === "KA Bandara" ? "Airport Rail" : m[2]); }]
  ];

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }
  /** Terjemahkan satu teks utuh. Mengembalikan teks asli bila tidak dikenal. */
  function t(s) {
    if (!EN || s == null) return s;
    s = String(s);
    if (s.indexOf("\n") >= 0) return s.split("\n").map(t).join("\n");
    var k = norm(s);
    if (!k) return s;
    var out = D.hasOwnProperty(k) ? D[k] : null;
    if (out == null) {
      for (var i = 0; i < R.length; i++) {
        var m = k.match(R[i][0]);
        if (m) { out = R[i][1](m); break; }
      }
    }
    if (out == null || out === k) return s;
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + out + trail;
  }
  function L(id, en) { return EN ? en : id; }

  /* ------------------------------------------------------------ penerjemah DOM */
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  var SKIP = { SCRIPT: 1, STYLE: 1, svg: 1 };
  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.nodeName] || e.getAttribute("translate") === "no") return true;
      var c = e.classList;
      if (c && (c.contains("leaflet-tile-pane") || c.contains("maplibregl-canvas-container") || c.contains("leaflet-control-attribution"))) return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !/[A-Za-z]/.test(v)) return;
    var x = t(v);
    if (x !== v) n.nodeValue = x;
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a) { var x = t(a); if (x !== a) el.setAttribute(ATTRS[i], x); }
    }
    if (el.nodeName === "OPTION") { var o = el.textContent, y = t(o); if (y !== o) el.textContent = y; }
  }
  function walk(node) {
    if (node.nodeType === 3) { if (node.parentNode && !skipEl(node.parentNode)) doText(node); return; }
    if (node.nodeType !== 1 || skipEl(node)) return;
    doAttrs(node);
    var w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return SKIP[n.nodeName] || n.getAttribute("translate") === "no" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function start() {
    document.documentElement.lang = lang;
    if (!EN) return;
    walk(document.body);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === "characterData") { if (!skipEl(m.target.parentNode)) doText(m.target); }
        else if (m.type === "attributes") { if (!skipEl(m.target)) doAttrs(m.target); }
        else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  root.LumiI18n = { lang: lang, en: EN, t: t, L: L, start: start, diff: function (s) { return EN ? diffText(s) : s; } };
  // Bagian native (notifikasi, suara, pendampingan) mengikuti bahasa yang sama.
  try { if (root.LumiNative && root.LumiNative.setLang) root.LumiNative.setLang(lang); } catch (e) { lumiLog(e); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window);
