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
  const r = P.plan(a, b, null, dep);
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
