// Uji mesin rute: node tools/test_engine.js
const fs = require("fs"), path = require("path");
const W = path.join(__dirname, "..", "app/src/main/assets/www/js");
const src = fs.readFileSync(path.join(W, "data.js"), "utf8");
const data = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
const E = require(path.join(W, "engine.js"));
let t = Date.now();
const P = new E.Planner(data);
console.log("nodes", P.nodes.length, "edges", P.edgeCount, "build ms", Date.now() - t);
const cases = [
  ["Monas -> Blok M", [-6.1754, 106.8272], [-6.2443, 106.8001]],
  ["Bogor -> Sudirman", [-6.5950, 106.7900], [-6.2088, 106.8200]],
  ["Bekasi -> Grogol", [-6.2383, 106.9925], [-6.1675, 106.7900]],
  ["Kelapa Gading -> Bandara", [-6.1580, 106.9060], [-6.1256, 106.6559]],
  ["Lebak Bulus -> Kota Tua", [-6.2893, 106.7744], [-6.1352, 106.8133]],
  ["Ciledug -> Pancoran", [-6.2295, 106.7170], [-6.2430, 106.8445]],
];
const TIMES = (process.env.TIMES || "480,30").split(",").map(Number);
for (const dep of TIMES) for (const [name, a, b] of cases) {
  t = Date.now();
  const r = P.plan(a, b, null, dep, 2);   // Selasa: hasil tidak bergantung hari saat uji dijalankan
  console.log("\n==", name, "berangkat", String(Math.floor(dep/60)).padStart(2,"0") + ":" + String(dep%60).padStart(2,"0"), (Date.now() - t) + "ms");
  for (const it of r) {
    console.log(` [${it.tags.join(",")}] ${it.min} mnt Rp${it.fareLo}-${it.fareHi} transit ${it.transfers}: ` +
      it.legs.map(l => l.type === "ride" ? `${l.line.mode} ${l.line.code} ${l.from}→${l.to}(${l.stops.length - 1})` :
        l.type === "ojol" ? `ojol ${l.km.toFixed(1)}km` : `${l.type} ${Math.round(l.km * 1000)}m`).join(" | "));
  }
}
console.log("tutup 00:30:", P.closedAt(30));
console.log(P.searchLines("9").slice(0, 3).map(l => l.code + " " + l.name));
console.log(P.searchStops("dukuh").map(s => s.name + " / " + s.sub));

/* ---------------------------------------------------------------- pemeriksaan (B4)
 * Skrip di atas hanya mencetak. Bagian ini membuat CI merah bila hasil mesin rute tidak masuk akal. */
let fails = 0;
function check(ok, msg) { if (!ok) { fails++; console.error("GAGAL: " + msg); } }
const RAIL = new Set(["KRL", "MRT", "LRT", "LRTJ", "KABANDARA", "WHOOSH"]);
const NIGHT_MIKRO = new Set(["JAK36", "JAK47", "JAK52", "JAK75"]);
const rides = (it) => it.legs.filter((l) => l.type === "ride");
const transit = (r) => r.filter((it) => rides(it).length);

for (const [name, a, b] of cases) {
  // Siang (08.00)
  const day = P.plan(a, b, null, 480, 2), tr = transit(day);
  check(tr.length >= 3, `${name} 08.00: minimal 3 opsi angkutan umum (dapat ${tr.length})`);
  const fastest = Math.min(...tr.map((x) => x.min));
  check(fastest >= 10 && fastest <= 200, `${name} 08.00: waktu tercepat masuk akal (dapat ${fastest} mnt)`);
  check(day.some((x) => x.tags.includes("Tercepat")) && day.some((x) => x.tags.includes("Termurah")), `${name} 08.00: ada label Tercepat & Termurah`);
  for (const it of day) {
    check(it.min > 0 && it.min < 400, `${name}: durasi ${it.min} mnt di luar rentang`);
    check(it.fareLo >= 0 && it.fareLo <= it.fareHi && it.fareHi <= 400000, `${name}: tarif ${it.fareLo}-${it.fareHi} tidak wajar`);
    check(it.legs.length > 0, `${name}: hasil tanpa ruas`);
  }
  // Tengah malam (00.30): hanya Transjakarta koridor utama, Mikrotrans AMARI, dan ojol
  const night = P.plan(a, b, null, 30, 2);
  check(night.length >= 1, `${name} 00.30: minimal ada opsi ojol`);
  for (const it of night) for (const l of rides(it)) {
    check(!RAIL.has(l.line.mode), `${name} 00.30: kereta ${l.line.mode} ${l.line.code} muncul padahal tutup`);
    if (l.line.mode === "MIKRO") check(NIGHT_MIKRO.has(String(l.line.code).replace(/\W/g, "")), `${name} 00.30: Mikrotrans ${l.line.code} muncul padahal tutup`);
    if (l.line.mode === "TJ") check(!!l.line.main, `${name} 00.30: TJ ${l.line.code} (bukan koridor 1–14) muncul padahal tutup`);
    check(l.line.mode !== "ROYAL", `${name} 00.30: Royaltrans muncul padahal tutup`);
  }
}
check(P.closedAt(480).length === 0, "08.00: tidak boleh ada moda yang tutup");
check(P.closedAt(30).some((x) => /KRL/.test(x)), "00.30: KRL harus tercatat tutup");
// Tarif pagi Transjakarta (05.00–07.00) lebih murah dari siang untuk perjalanan bus saja
const busOnly = (r) => transit(r).filter((it) => rides(it).every((l) => l.line.mode === "TJ"));
const cheap = (r) => Math.min(...busOnly(r).map((x) => x.fareLo));
const [cn, ca, cb] = cases[5];
check(cheap(P.plan(ca, cb, null, 360, 2)) < cheap(P.plan(ca, cb, null, 480, 2)), `${cn}: tarif TJ 06.00 harus lebih murah dari 08.00`);
check(P.searchLines("9")[0] && P.searchLines("9")[0].code === "9", "cari rute \"9\": hasil pertama harus rute 9");
check(P.searchStops("dukuh").length > 0, "cari halte \"dukuh\": harus ada hasil");

// v2.17: tarif dengan tanggal berlaku (fares.schedule)
{
  const base = JSON.parse(JSON.stringify(data.fares));
  base.schedule = [
    { from: "2027-01-01", set: { tj: { base: 4500, premium: [["^SH2$", 18000]] } }, note: { id: "Tarif baru", en: "New fare" } },
    { from: "2027-06-01", set: { krl: { base: 3500 } } },
    { from: "bukan-tanggal", set: { tj: { base: 1 } } }
  ];
  const P2 = new E.Planner(Object.assign({}, data, { fares: base }));
  E.setFareDate("2026-12-31");
  check(E.fares().tj.base === data.fares.tj.base, "tarif 31 Des 2026 harus tarif lama");
  E.setFareDate("2027-01-01");
  check(E.fares().tj.base === 4500, "tarif 1 Jan 2027 harus tarif baru");
  check(E.fares().tj.morning === data.fares.tj.morning, "kunci yang tidak diubah tetap (tarif pagi)");
  check(E.fares().tj.premium.length === 1 && E.fares().tj.premium[0][1] === 18000, "larik diganti utuh");
  check(E.fares().krl.base === data.fares.krl.base, "perubahan Juni belum berlaku di Januari");
  check(E.fares("2027-07-01").krl.base === 3500 && E.fares("2027-07-01").tj.base === 4500, "dua perubahan bertumpuk berurutan");
  check(E.upcomingFares("2026-11-11").length === 2 && E.upcomingFares("2027-02-01").length === 1, "daftar perubahan yang akan datang");
  const [sn, sa, sb] = cases[5];
  E.setFareDate("2026-12-31"); const oldFare = cheap(P2.plan(sa, sb, null, 480, 2));
  E.setFareDate("2027-01-02"); const newFare = cheap(P2.plan(sa, sb, null, 480, 2));
  check(newFare > oldFare, `${sn}: tarif TJ setelah 1 Jan 2027 (${newFare}) harus lebih mahal dari sebelumnya (${oldFare})`);
  E.setFareDate(null);
  check(/^\d{4}-\d{2}-\d{2}$/.test(E.ymdWib()), "ymdWib berbentuk yyyy-mm-dd");
  check(E.ymdWib(Date.UTC(2026, 11, 31, 17, 30)) === "2027-01-01", "ymdWib memakai WIB (UTC+7)");
}

if (fails) { console.error(`\n${fails} pemeriksaan gagal`); process.exit(1); }
console.log("\nSemua pemeriksaan mesin rute lulus");
