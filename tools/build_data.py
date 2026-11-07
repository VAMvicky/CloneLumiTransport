#!/usr/bin/env python3
"""
Lumi Transportation — data builder.

Menggabungkan sumber data mentah di folder data-raw/ menjadi satu file
app/src/main/assets/www/js/data.js yang dipakai aplikasi secara offline.

Sumber:
  * data-raw/tj_brt_2024.js      : rute + halte BRT Transjakarta (GTFS resmi Transjakarta,
                                   unduhan 26 Jan 2024, dikemas oleh github.com/altilunium/BRT-tj)
  * data-raw/tj_gtfs_2021/       : GTFS Transjakarta non-BRT, Mikrotrans, Royaltrans
                                   (github.com/akherlan/transjakartagtfs, 2021)
  * data-raw/stasiun_ka.geojson  : koordinat stasiun KA nasional (Kemenhub, via
                                   github.com/Rebornian48/map-visualizer)
  * RAIL_LINES di bawah          : urutan stasiun KRL / MRT / LRT / KA Bandara / Whoosh,
                                   disusun dari Wikipedia & berita operator (2026)
Jalankan:  python3 tools/build_data.py
"""
import csv, json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data-raw")
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "www", "js", "data.js")


def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def r5(x):
    return round(float(x), 5)


# ---------------------------------------------------------------- rail ----
ka = json.load(open(os.path.join(RAW, "stasiun_ka.geojson")))["features"]
KA = {}
for f in ka:
    p = f["properties"]
    lon, lat = f["geometry"]["coordinates"][:2]
    if -6.7 < lat < -5.95 and 106.1 < lon < 107.25 and p.get("remark") == "Aktif":
        KA[p["namobj"].lower()] = (r5(lat), r5(lon))

# Koordinat tambahan (stasiun baru / bukan stasiun KAI). Sumber: Wikipedia (infobox) dan
# perkiraan dari peta untuk stasiun yang belum tercantum di data Kemenhub.
EXTRA = {
    "bekasi timur": (-6.24700, 107.01810), "pondok rajeg": (-6.45730, 106.82180),
    "gunung putri": (-6.46520, 106.89250), "tanah tinggi": (-6.17420, 106.65030),
    "bni city": (-6.20270, 106.82100), "matraman": (-6.21170, 106.85830),
    "jatake": (-6.33660, 106.59350), "jakarta international stadium": (-6.12480, 106.85660),
    "bandara soekarno-hatta": (-6.12720, 106.65550),
    # MRT Jakarta
    "mrt lebak bulus": (-6.28930, 106.77440), "mrt fatmawati": (-6.29230, 106.79320),
    "mrt cipete raya": (-6.27820, 106.79730), "mrt haji nawi": (-6.26680, 106.79732),
    "mrt blok a": (-6.25560, 106.79720), "mrt blok m": (-6.24430, 106.79820),
    "mrt asean": (-6.23840, 106.79850), "mrt senayan": (-6.22668, 106.80246),
    "mrt istora": (-6.22233, 106.80857), "mrt bendungan hilir": (-6.21545, 106.81732),
    "mrt setiabudi": (-6.20920, 106.82170), "mrt dukuh atas": (-6.20079, 106.82275),
    "mrt bundaran hi": (-6.19180, 106.82300),
    # LRT Jakarta
    "lrt pegangsaan dua": (-6.15720, 106.90800), "lrt boulevard utara": (-6.16260, 106.90370),
    "lrt boulevard selatan": (-6.16900, 106.89960), "lrt pulomas": (-6.17650, 106.89380),
    "lrt equestrian": (-6.18320, 106.89200), "lrt velodrome": (-6.19140, 106.89130),
    "lrt rawamangun": (-6.19400, 106.88100), "lrt pramuka": (-6.19300, 106.86900),
    "lrt matraman": (-6.20100, 106.85900), "lrt proklamasi": (-6.20250, 106.84650),
    "lrt manggarai": (-6.20880, 106.84900),
    # LRT Jabodebek
    "lrtj dukuh atas": (-6.20270, 106.82440), "lrtj setiabudi": (-6.20930, 106.82780),
    "lrtj rasuna said": (-6.21830, 106.83200), "lrtj kuningan": (-6.23300, 106.83200),
    "lrtj pancoran": (-6.24340, 106.84410), "lrtj cikoko": (-6.24348, 106.85710),
    "lrtj ciliwung": (-6.24330, 106.86350), "lrtj cawang": (-6.24530, 106.86890),
    "lrtj tmii": (-6.29190, 106.88230), "lrtj kampung rambutan": (-6.30980, 106.88260),
    "lrtj ciracas": (-6.32370, 106.88670), "lrtj harjamukti": (-6.37399, 106.89562),
    "lrtj halim": (-6.25850, 106.89080), "lrtj jati bening baru": (-6.25778, 106.92768),
    "lrtj cikunir 1": (-6.25600, 106.95050), "lrtj cikunir 2": (-6.25320, 106.96720),
    "lrtj bekasi barat": (-6.25293, 106.99008), "lrtj jati mulya": (-6.26395, 107.02143),
    # Whoosh
    "whoosh halim": (-6.26170, 106.89090), "whoosh karawang": (-6.36870, 107.32460),
    "whoosh padalarang": (-6.84320, 107.49640), "whoosh tegalluar": (-6.96650, 107.75330),
}
ALIAS = {"gang sentiong": "sentiong", "batu ceper": "batuceper", "jurangmangu": "jurang mangu",
         "kampung bandan": "kampung bandan atas", "metland telaga murni": "metland telaga murni"}


def coord(name, prefix=""):
    k = (prefix + name).lower()
    if k in EXTRA:
        return EXTRA[k]
    k2 = ALIAS.get(name.lower(), name.lower())
    if k2 in KA:
        return KA[k2]
    if k2 in EXTRA:
        return EXTRA[k2]
    sys.exit("Koordinat tidak ditemukan: " + prefix + name)


BOGOR = ["Jakarta Kota", "Jayakarta", "Mangga Besar", "Sawah Besar", "Juanda", "Gondangdia", "Cikini",
         "Manggarai", "Tebet", "Cawang", "Duren Kalibata", "Pasar Minggu Baru", "Pasar Minggu",
         "Tanjung Barat", "Lenteng Agung", "Universitas Pancasila", "Universitas Indonesia",
         "Pondok Cina", "Depok Baru", "Depok", "Citayam"]
CKR_EAST = ["Cikarang", "Metland Telaga Murni", "Cibitung", "Tambun", "Bekasi Timur", "Bekasi", "Kranji",
            "Cakung", "Klender Baru", "Buaran", "Klender", "Jatinegara"]

RAIL_LINES = [
    # id, mode, code, name, color, stations, prefix, meta
    ("krl-b", "KRL", "B", "Commuter Line Bogor", "#E2231A", BOGOR + ["Bojong Gede", "Cilebut", "Bogor"], "",
     "Jakarta Kota – Bogor. Kereta setiap 5–10 menit pada jam sibuk."),
    ("krl-nb", "KRL", "B·N", "Commuter Line Bogor (cabang Nambo)", "#F06C64",
     BOGOR + ["Pondok Rajeg", "Cibinong", "Gunung Putri", "Nambo"], "",
     "Jakarta Kota/Angke – Nambo, bercabang di Citayam. Kereta tiap 60–120 menit."),
    ("krl-cm", "KRL", "C", "Commuter Line Cikarang (via Manggarai)", "#1E73BE",
     CKR_EAST + ["Matraman", "Manggarai", "Sudirman", "Karet", "Tanah Abang", "Duri", "Angke", "Kampung Bandan"], "",
     "Loop Cikarang – Manggarai – Tanah Abang – Kampung Bandan."),
    ("krl-cs", "KRL", "C·S", "Commuter Line Cikarang (via Pasar Senen)", "#4D9DE0",
     CKR_EAST + ["Pondok Jati", "Kramat", "Gang Sentiong", "Pasar Senen", "Kemayoran", "Rajawali", "Kampung Bandan"], "",
     "Loop arah Pasar Senen – Kampung Bandan (searah jarum jam berlawanan)."),
    ("krl-r", "KRL", "R", "Commuter Line Rangkasbitung", "#1A8F3C",
     ["Tanah Abang", "Palmerah", "Kebayoran", "Pondok Ranji", "Jurangmangu", "Sudimara", "Rawa Buntu", "Serpong",
      "Cisauk", "Cicayur", "Jatake", "Parung Panjang", "Cilejit", "Daru", "Tenjo", "Tigaraksa", "Cikoya", "Maja",
      "Citeras", "Rangkasbitung"], "", "Tanah Abang – Rangkasbitung, sebagian perjalanan berakhir di Serpong/Parung Panjang/Maja."),
    ("krl-t", "KRL", "T", "Commuter Line Tangerang", "#8B5A2B",
     ["Duri", "Grogol", "Pesing", "Taman Kota", "Bojong Indah", "Rawa Buaya", "Kalideres", "Poris", "Batu Ceper",
      "Tanah Tinggi", "Tangerang"], "", "Duri – Tangerang."),
    ("krl-tp", "KRL", "TP", "Commuter Line Tanjung Priok", "#D6338A",
     ["Jakarta Kota", "Kampung Bandan", "Ancol", "Jakarta International Stadium", "Tanjung Priok"], "",
     "Jakarta Kota – Tanjung Priok via Ancol & JIS."),
    ("ka-bandara", "KABANDARA", "BST", "KA Bandara Soekarno-Hatta", "#0F5E9C",
     ["Manggarai", "BNI City", "Duri", "Rawa Buaya", "Batu Ceper", "Bandara Soekarno-Hatta"], "",
     "Manggarai – Bandara Soekarno-Hatta (Terminal 1/2/3 via Skytrain). Kereta tiap ±30–60 menit."),
    ("mrt-ns", "MRT", "M", "MRT Jakarta Lin Utara–Selatan", "#0069B4",
     ["Lebak Bulus", "Fatmawati", "Cipete Raya", "Haji Nawi", "Blok A", "Blok M", "ASEAN", "Senayan", "Istora",
      "Bendungan Hilir", "Setiabudi", "Dukuh Atas", "Bundaran HI"], "mrt ",
     "Lebak Bulus – Bundaran HI. Perpanjangan ke Monas ditargetkan akhir 2027."),
    ("lrt-jkt", "LRT", "L1", "LRT Jakarta", "#E5502E",
     ["Pegangsaan Dua", "Boulevard Utara", "Boulevard Selatan", "Pulomas", "Equestrian", "Velodrome", "Rawamangun",
      "Pramuka", "Matraman", "Proklamasi", "Manggarai"], "lrt ",
     "Pegangsaan Dua – Manggarai. Segmen Velodrome–Manggarai (fase 1B) uji coba umum mulai 12 Okt 2026."),
    ("lrt-cbr", "LRTJ", "Cb", "LRT Jabodebek Lin Cibubur", "#2C9E8E",
     ["Dukuh Atas", "Setiabudi", "Rasuna Said", "Kuningan", "Pancoran", "Cikoko", "Ciliwung", "Cawang", "TMII",
      "Kampung Rambutan", "Ciracas", "Harjamukti"], "lrtj ", "Dukuh Atas – Harjamukti (Cibubur)."),
    ("lrt-bks", "LRTJ", "Bk", "LRT Jabodebek Lin Bekasi", "#7A4FA3",
     ["Dukuh Atas", "Setiabudi", "Rasuna Said", "Kuningan", "Pancoran", "Cikoko", "Ciliwung", "Cawang", "Halim",
      "Jati Bening Baru", "Cikunir 1", "Cikunir 2", "Bekasi Barat", "Jati Mulya"], "lrtj ",
     "Dukuh Atas – Jati Mulya (Bekasi)."),
    ("whoosh", "WHOOSH", "W", "Kereta Cepat Whoosh", "#C8102E",
     ["Halim", "Karawang", "Padalarang", "Tegalluar"], "whoosh ",
     "Jakarta (Halim) – Bandung (Tegalluar/Padalarang). Wajib beli tiket & pilih kursi."),
]

# ------------------------------------------------------------- TJ BRT ----
def clean_halte(n):
    n = re.sub(r"\s+Arah\s+(Barat|Timur|Utara|Selatan)$", "", n.strip(), flags=re.I)
    return n


s = open(os.path.join(RAW, "tj_brt_2024.js")).read()
brt = json.loads(s[s.index("["):].rstrip().rstrip(";"))

# ---------------------------------------------- daftar rute resmi 2026 ----
OFFICIAL = {}   # kode -> (kategori, nama)
for ln in open(os.path.join(RAW, "tj_rute_resmi_2026.txt"), encoding="utf-8"):
    ln = ln.strip()
    if not ln or ln.startswith("#"):
        continue
    cat, code, name = ln.split("|", 2)
    OFFICIAL[code] = (cat, name)


def norm_code(c):
    """Samakan penulisan kode: JAK.10 / JAK-10 -> JAK10, JAK.01 -> JAK01."""
    c = c.strip().upper().replace(".", "").replace("-", "")
    return c


# Jam operasional (menit sejak 00.00; akhir boleh > 1440 = lewat tengah malam).
# Sumber: transjakarta.co.id, Kompas/GoodStats/Home Credit (2026), MRT Jakarta, KAI Commuter,
# Bisnis.com (KA Bandara, LRT Jabodebek), CNBC Indonesia (KRL).
H24 = [[0, 1440]]
HOURS = {
    "TJ_MAIN": (H24, "24 jam. Pukul 22.00–05.00 dilayani bus AMARI (malam), tiap ±20–40 menit."),
    "TJ_BRT": ([[300, 1320]], "05.00–22.00"),
    "PENGUMPAN": ([[300, 1320]], "05.00–22.00"),
    "RUSUN": ([[300, 1320]], "05.00–22.00"),
    "WISATA": ([[540, 1020]], "±09.00–17.00"),
    "ROYAL": ([[300, 1260]], "±05.00–21.00 (sebagian rute hanya jam sibuk)"),
    "JABODETABEK": ([[300, 1260]], "±05.00–21.00 (sebagian rute hanya jam sibuk)"),
    "MIKRO": ([[300, 1320]], "05.00–22.00"),
    "MIKRO_24": (H24, "24 jam (layanan AMARI Mikrotrans)."),
    "KRL": ([[240, 1440]], "±04.00–24.00 (kereta terakhir ±23.30)"),
    "MRT": ([[300, 1440]], "05.00–24.00. Jam sibuk tiap 5 menit, di luar itu tiap 10 menit."),
    "LRT": ([[330, 1460]], "05.30–00.20 (masa uji coba umum fase 1B)"),
    "LRTJ": ([[330, 1380]], "Sen–Jum 05.30–23.00 · Sabtu 05.45–23.00 · Minggu/libur 06.00–22.30"),
    "KABANDARA": ([[300, 1380]], "±05.00–23.00 (dari bandara 05.57–22.57, tiap 30–60 menit)"),
    "WHOOSH": ([[360, 1290]], "±06.00–21.30 (cek jadwal KCIC)"),
}
MIKRO_24 = {"JAK36", "JAK47", "JAK52", "JAK75"}
MAIN_CODES = {str(i) for i in range(1, 15)}

# Kode BRT berdasarkan nama asal–tujuan pada GTFS Jan 2024, dicocokkan ke daftar resmi 2026.
BRT_CODES = {
    "Blok M - Kota": "1", "Pulo Gadung - Monas": "2", "Kalideres - Monas via Veteran": "3",
    "Pulo Gadung - Galunggung": "4", "Kampung Melayu - Ancol": "5", "Ragunan - Galunggung": "6",
    "Kampung Rambutan - Kampung Melayu": "7", "Lebak Bulus - Pasar Baru": "8", "Pinang Ranti - Pluit": "9",
    "Tanjung Priok - PGC": "10", "Pulo Gebang - Kampung Melayu": "11", "Tanjung Priok - Pluit": "12",
    "Ciledug - Tegal Mampang": "13", "Jakarta International Stadium - Senen": "14",
    "Tanjung Priok - Blok M": "10H",
    "Pulo Gadung - Rawa Buaya via Balai Kota": "2A", "Kalideres - Gelora Bung Karno": "3F",
    "St. Pesing - Kota": "3H", "Pulo Gadung - Kuningan": "4D", "Cililitan - Juanda": "5C",
    "Ragunan - Balai Kota via Kuningan": "6A",
    "Ragunan - Balai Kota via Semanggi": "6B", "Ragunan - Gelora Bung Karno": "6V",
    "Kampung Rambutan - Juanda via Cempaka Putih": "7F",
    "Cililitan - Kali Grogol": "9A", "Pinang Ranti - Bundaran Senayan": "9C",
    "Pinang Ranti - Simpang Cawang": "9N",
    "Puri Beta 2 - Flyover Kuningan (Express)": "L13E",
    # Rute lama yang tidak ada lagi di daftar resmi 2026 (10D, 13C, 13D, 5D, 8A) sengaja tidak dipakai.
}
MAIN_COLORS = {"1": "#C1272D", "2": "#1D3E8F", "3": "#E8B500", "4": "#5B2C6F", "5": "#C2571A",
               "6": "#2E8B3E", "7": "#E0457B", "8": "#C21C8E", "9": "#2F9C95", "10": "#8E1B1E",
               "11": "#2F4FA2", "12": "#4FA35A", "13": "#5C359D", "14": "#F28C28"}


def simplify(pts, step_m=40):
    out = [pts[0]]
    for p in pts[1:]:
        if hav(out[-1], p) * 1000 >= step_m:
            out.append(p)
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def variant_label(dirs, stops):
    """Bandingkan varian dengan pola utama yang ujungnya sama → 'tidak berhenti di A, B' / 'juga lewat C'."""
    base = None
    for d in dirs:
        if d["s"][-1]["n"] == stops[-1]["n"] or d["s"][0]["n"] == stops[0]["n"]:
            base = d
            break
    if not base:
        return "Varian rute"
    bn = [x["n"] for x in base["s"]]
    vn = [x["n"] for x in stops]
    skip = [n for n in bn if n not in vn]
    extra = [n for n in vn if n not in bn]
    parts = []
    if skip:
        parts.append("tidak berhenti di " + ", ".join(skip[:3]) + (" dll." if len(skip) > 3 else ""))
    if extra:
        parts.append("lewat " + ", ".join(extra[:3]) + (" dll." if len(extra) > 3 else ""))
    return "Varian: " + ("; ".join(parts) if parts else "pola halte berbeda")


# Varian operasional yang diumumkan Transjakarta tetapi belum ada di GTFS bawaan.
# Koridor 9 arah Pluit: sebagian bus lewat Tol (Petamburan) dan tidak berhenti di
# Halte Kemanggisan s.d. Jembatan Dua (Suara.com, 7 Jan 2026; akun X @PT_Transjakarta).
MANUAL_VARIANTS = {
    "9": [{"toward": "Pluit", "skip_from": "Kemanggisan", "skip_to": "Jembatan Dua",
           "v": "Via Tol (sebagian bus): tidak berhenti di Kemanggisan s.d. Jembatan Dua"}],
}


def add_manual_variants(line):
    for mv in MANUAL_VARIANTS.get(line["code"], []):
        for d in list(line["dirs"]):
            names = [x["n"] for x in d["s"]]
            if names[-1] != mv["toward"] or mv["skip_from"] not in names or mv["skip_to"] not in names:
                continue
            i, j = names.index(mv["skip_from"]), names.index(mv["skip_to"])
            if i > j:
                continue
            line["dirs"].append({"h": d["h"] + " (via Tol)", "s": d["s"][:i] + d["s"][j + 1:], "shape": None, "v": mv["v"]})
            break


# Jam yang berbeda per hari (0 = Minggu, 6 = Sabtu); hari lain memakai HOURS.
HOURS_DOW = {"LRTJ": {"6": [[345, 1380]], "0": [[360, 1350]]}}


def with_hours(line, key):
    h, txt = HOURS[key]
    line["hours"] = h
    line["hoursText"] = txt
    if key in HOURS_DOW:
        line["hoursDow"] = HOURS_DOW[key]
    return line


lines = []
seen_names = set()
for c in brt:
    name = c["name"]
    if name in seen_names:          # entri ganda = layanan AMARI malam (M1–M14)
        continue
    seen_names.add(name)
    code = BRT_CODES.get(name)
    if not code or code not in OFFICIAL:
        continue
    dirs = []
    for r in c["routes"][:2] if len(c["routes"]) <= 2 else [x for x in c["routes"] if x["name"].startswith("HR") or x["name"].startswith("SH") or x["name"].startswith("HK")][:2]:
        stops = [{"n": clean_halte(s_["name"]), "p": [r5(s_["coords"][0]), r5(s_["coords"][1])]} for s_ in r["stops"]]
        shape = simplify([(r5(a), r5(b)) for a, b in r.get("coords", [])]) if r.get("coords") else None
        dirs.append({"h": r["name"].split(":", 1)[-1], "s": stops, "shape": shape})
    # Varian pola halte (mis. hari kerja/akhir pekan) dari GTFS yang sama, selain CFD.
    used = {tuple(x["n"] for x in d["s"]) for d in dirs}
    for r in c["routes"]:
        if "CFD" in r["name"]:
            continue
        stops = [{"n": clean_halte(s_["name"]), "p": [r5(s_["coords"][0]), r5(s_["coords"][1])]} for s_ in r["stops"]]
        key = tuple(x["n"] for x in stops)
        if key in used or len(stops) < 2:
            continue
        used.add(key)
        shape = simplify([(r5(a), r5(b)) for a, b in r.get("coords", [])]) if r.get("coords") else None
        dirs.append({"h": r["name"].split(":", 1)[-1], "s": stops, "shape": shape, "v": variant_label(dirs, stops)})
    main = code in MAIN_CODES
    num = re.search(r"\d+", code).group(0)
    color = MAIN_COLORS.get(code) or MAIN_COLORS.get(num, "#C1272D")
    lines.append(with_hours({"id": "tj-" + code.lower(), "mode": "TJ", "code": code, "name": OFFICIAL[code][1],
                  "color": color, "brt": True, "main": main, "cat": "BRT",
                  "note": ("Koridor utama BRT" if main else "Rute lintas koridor BRT") +
                          ". Halte: GTFS resmi Transjakarta (Jan 2024).",
                  "dirs": dirs}, "TJ_MAIN" if main else "TJ_BRT"))
    add_manual_variants(lines[-1])

have = {l["code"] for l in lines}

# -------------------------------------------------- TJ non-BRT (2021) ----
G = os.path.join(RAW, "tj_gtfs_2021")
stops = {r["stop_id"]: r for r in csv.DictReader(open(os.path.join(G, "stops.txt")))}
routes = list(csv.DictReader(open(os.path.join(G, "routes.txt"))))
trips = list(csv.DictReader(open(os.path.join(G, "trips.txt"))))
# trip_id di GTFS 2021 tidak unik antar rute (mis. "a-b"). Blok stop_times muncul
# berurutan sesuai urutan trips.txt, jadi kita pecah per blok (stop_sequence kembali ke 1)
# lalu pasangkan ke trip sesuai urutan kemunculan.
blocks, prev = {}, None
for r in csv.DictReader(open(os.path.join(G, "stop_times.txt"))):
    tid, seq = r["trip_id"], int(r["stop_sequence"])
    if tid != prev or seq == 1:
        blocks.setdefault(tid, []).append([])
    blocks[tid][-1].append((seq, r["stop_id"]))
    prev = tid
st, used = {}, {}
for i, t in enumerate(trips):
    k = "%s#%d" % (t["trip_id"], i)
    n = used.get(t["trip_id"], 0)
    used[t["trip_id"]] = n + 1
    lst = blocks.get(t["trip_id"], [])
    st[k] = lst[n] if n < len(lst) else []
    t["trip_id"] = k
_STOPW = {"TERMINAL", "STASIUN", "VIA", "RUSUN", "JALAN", "JL", "PASAR", "PS", "KAMPUNG", "DAN"}


def _toks(x):
    return {t for t in re.findall(r"[A-Z0-9]+", x.upper()) if t not in _STOPW and len(t) > 2}


def same_route(old, new):
    """Trayek 2021 dianggap masih sama bila kedua ujungnya muncul di nama resmi 2026."""
    a = [_toks(x) for x in old.split(" - ")]
    b = [_toks(x) for x in new.split(" - ")]
    ends_new = b[0] | b[-1]
    return bool(a[0] & ends_new) and bool(a[-1] & ends_new)


CAT_STYLE = {
    "PENGUMPAN": ("Angkutan pengumpan (non-BRT)", "TJ", None),
    "RUSUN": ("Angkutan rusun", "TJ", "#8D8482"),
    "WISATA": ("Bus wisata", "TJ", "#2B8F3F"),
    "ROYAL": ("Royaltrans", "ROYAL", "#1B2A49"),
    "JABODETABEK": ("Transjabodetabek", "ROYAL", "#3B4A6B"),
    "MIKRO": ("Mikrotrans", "MIKRO", "#00A3E0"),
    "BRT": ("Rute BRT", "TJ", None),
}
for r in routes:
    code = norm_code(r["route_short_name"])
    if code not in OFFICIAL or code in have:
        continue                      # rute 2021 yang sudah tidak ada di daftar resmi 2026
    cat = OFFICIAL[code][0]
    if cat == "BRT":
        continue
    if not same_route(r["route_long_name"], OFFICIAL[code][1]):
        continue                      # kode sama tapi trayek sudah diubah (mis. 9H) → jangan pakai halte 2021
    rtrips = [t for t in trips if t["route_id"] == r["route_id"]]
    dirs = []
    for d in ("0", "1"):
        tt = [t for t in rtrips if t["direction_id"] == d]
        if not tt:
            continue
        best = max(tt, key=lambda t: len(st.get(t["trip_id"], [])))
        seq = [sid for _, sid in sorted(st.get(best["trip_id"], []))]
        ss = []
        for sid in seq:
            sp = stops.get(sid)
            if not sp:
                continue
            nm = re.sub(r",\s*platform.*$|\s+\d+$", "", sp["stop_name"]).strip()
            p = [r5(sp["stop_lat"]), r5(sp["stop_lon"])]
            if ss and ss[-1]["n"] == nm:
                continue
            ss.append({"n": nm, "p": p})
        if len(ss) >= 2:
            dirs.append({"h": best["trip_headsign"] or r["route_long_name"], "s": ss, "shape": None})
    if not dirs:
        continue
    sub, mode, color = CAT_STYLE[cat]
    if color is None:
        color = "#" + (r["route_color"] or "8D8482")
    hkey = "MIKRO_24" if code in MIKRO_24 else cat
    lines.append(with_hours({"id": "tj-" + code.lower(), "mode": mode, "code": code,
                  "name": OFFICIAL[code][1], "color": color, "brt": False, "main": False, "cat": cat,
                  "note": sub + ". Urutan halte dari GTFS 2021 — bisa berbeda dengan rute saat ini.",
                  "dirs": dirs}, hkey))
    have.add(code)

# Rute Transjabodetabek yang disusun manual dari daftar halte di media (Dealls, Apr/Agu 2026), hanya
# halte yang koordinatnya sudah ada di data (halte TJ yang sama / GTFS 2021). Halte di PIK 2 dan Bogor
# belum berkoordinat; data lengkap didapat dari "Unduh data rute resmi" di aplikasi.
MANUAL_LINES = {
    "T31": {"note": "Transjabodetabek (via Tol). Halte PIK 2 belum lengkap; halte Jakarta & PIK 1 dari daftar resmi (2026).",
            "hours": ([[300, 1320]], "05.00–22.00"),
            "dirs": [
                ("PIK → Blok M", [("Fresh Market PIK", -6.10312, 106.74109), ("PIK Avenue", -6.10857, 106.73964),
                                   ("Kemanggisan", -6.18978, 106.79726), ("Petamburan", -6.20196, 106.79981),
                                   ("Senayan Bank Jakarta", -6.22421, 106.80573), ("Masjid Agung", -6.23648, 106.79848),
                                   ("Kejaksaan Agung", -6.24046, 106.79848), ("Blok M", -6.24336, 106.8019)]),
                ("Blok M → PIK", [("Blok M", -6.24336, 106.8019), ("ASEAN", -6.23986, 106.79896),
                                   ("Masjid Agung", -6.23648, 106.79848), ("Senayan Bank Jakarta", -6.22421, 106.80573),
                                   ("Petamburan", -6.20196, 106.79981), ("Buddha Tzu Chi", -6.10799, 106.73943),
                                   ("Gold Coast", -6.10308, 106.74059)]),
            ]},
    "P11": {"note": "Transjabodetabek Blok M–Bogor (via Tol Jagorawi). Halte di Bogor/Sentul belum lengkap.",
            "hours": ([[300, 1300]], "05.00–21.40, tiap ±20 menit"),
            "dirs": [
                ("Blok M → Bogor", [("Blok M Jalur 5", -6.24336, 106.8019), ("Pasar Santa", -6.23917, 106.80777),
                                     ("Rawa Barat", -6.23891, 106.81619), ("Pancoran", -6.2434, 106.8441)]),
                ("Bogor → Blok M", [("Cibubur Junction", -6.36896, 106.89362), ("Pancoran", -6.2434, 106.8441),
                                     ("Tegal Mampang", -6.24022, 106.83088), ("Rawa Barat", -6.23891, 106.81619),
                                     ("Pasar Santa", -6.23917, 106.80777), ("Kejaksaan Agung", -6.24046, 106.79848),
                                     ("Blok M Jalur 5", -6.24336, 106.8019)]),
            ]},
}
for code, ml in MANUAL_LINES.items():
    if code in have:
        continue
    cat, name = OFFICIAL[code]
    lines.append({"id": "tj-" + code.lower(), "mode": "ROYAL", "code": code, "name": name, "color": "#3B4A6B",
                  "brt": False, "main": False, "cat": cat, "note": ml["note"], "hours": ml["hours"][0],
                  "hoursText": ml["hours"][1],
                  "dirs": [{"h": h, "s": [{"n": n, "p": [la, lo]} for n, la, lo in st], "shape": None} for h, st in ml["dirs"]]})
    have.add(code)

# Rute resmi 2026 yang belum ada data haltenya: tetap ditampilkan di Info Rute.
for code, (cat, name) in OFFICIAL.items():
    if code in have:
        continue
    sub, mode, color = CAT_STYLE[cat]
    if cat == "BRT":
        num = re.search(r"\d+", code).group(0)
        color = MAIN_COLORS.get(num, "#C1272D")
    hkey = "MIKRO_24" if code in MIKRO_24 else ("TJ_BRT" if cat == "BRT" else cat)
    lines.append(with_hours({"id": "tj-" + code.lower(), "mode": mode, "code": code, "name": name,
                  "color": color or "#8D8482", "brt": cat == "BRT", "main": False, "cat": cat,
                  "note": sub + ". Daftar halte belum tersedia di data offline Lumi; lihat peta rute resmi.",
                  "noStops": True, "dirs": []}, hkey))

# --------------------------------------------------------- rail lines ----
for (lid, mode, code, name, color, stns, prefix, note) in RAIL_LINES:
    s1 = [{"n": n, "p": list(coord(n, prefix))} for n in stns]
    s2 = list(reversed(s1))
    lines.append(with_hours({"id": lid, "mode": mode, "code": code, "name": name, "color": color, "brt": False,
                  "main": True, "note": note,
                  "dirs": [{"h": stns[0] + " → " + stns[-1], "s": s1, "shape": None},
                           {"h": stns[-1] + " → " + stns[0], "s": s2, "shape": None}]}, mode))

# Pastikan tiap rute punya 2 arah
for l in lines:
    if len(l["dirs"]) == 1:
        d = l["dirs"][0]
        l["dirs"].append({"h": "Arah balik", "s": list(reversed(d["s"])),
                          "shape": list(reversed(d["shape"])) if d["shape"] else None})
    for d in l["dirs"]:
        if d["shape"]:
            d["shape"] = [list(p) for p in d["shape"]]

meta = {"built": "2026-10-10", "counts": {}, "noStops": sum(1 for l in lines if l.get("noStops"))}
for l in lines:
    if not l.get("noStops"):
        meta["counts"][l["mode"]] = meta["counts"].get(l["mode"], 0) + 1

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("/* Dibuat otomatis oleh tools/build_data.py — jangan diedit manual. */\n")
    f.write("window.LUMI_DATA=")
    json.dump({"meta": meta, "lines": lines}, f, separators=(",", ":"), ensure_ascii=False)
    f.write(";\n")
print("OK", OUT, os.path.getsize(OUT), "bytes", meta["counts"])
