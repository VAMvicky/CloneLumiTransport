#!/usr/bin/env python3
"""Uji pipeline jadwal kereta (tools/rail_schedule.py) + pemakaiannya di mesin rute (engine.js).
   python3 tools/test_rail.py
Memakai data tiruan (GTFS zip & respons Comuline di folder sementara) dengan nama stasiun Lumi asli."""
import importlib.util, io, json, os, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("rs", os.path.join(HERE, "rail_schedule.py"))
rs = importlib.util.module_from_spec(spec); spec.loader.exec_module(rs)

fails = 0
def check(ok, msg):
    global fails
    print(("ok: " if ok else "GAGAL: ") + msg)
    if not ok: fails += 1

lines = rs.load_lumi_lines()
by = {l["id"]: l for l in lines}
mrt = by["mrt-ns"]; d0 = mrt["dirs"][0]["s"]
krl = by["krl-b"]; k0 = krl["dirs"][0]["s"]

tmp = tempfile.mkdtemp()
# --- GTFS tiruan MRT: 3 perjalanan arah 0 (tiap 10 mnt dari 06.00, 2 mnt antarstasiun) + 1 sampah
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z:
    z.writestr("stops.txt", "stop_id,stop_name\n" + "".join("S%d,Stasiun %s\n" % (i, s["n"]) for i, s in enumerate(d0)) + "X1,Antah Berantah\nX2,Entah\n")
    z.writestr("trips.txt", "route_id,service_id,trip_id,trip_short_name\nM,W,t1,101\nM,W,t2,103\nM,W,t3,105\nM,W,junk,999\n")
    st = ["trip_id,arrival_time,departure_time,stop_id,stop_sequence"]
    for k, tid in enumerate(["t1", "t2", "t3"]):
        for i in range(len(d0)):
            m = 360 + k * 10 + i * 2
            st.append("%s,%02d:%02d:00,%02d:%02d:00,S%d,%d" % (tid, m // 60, m % 60, m // 60, m % 60, i, i + 1))
    st += ["junk,07:00:00,07:00:00,X1,1", "junk,07:05:00,07:05:00,X2,2"]
    z.writestr("stop_times.txt", "\n".join(st) + "\n")
gz = os.path.join(tmp, "mrt.zip"); open(gz, "wb").write(buf.getvalue())
trains = rs.trains_from_gtfs(open(gz, "rb").read(), "MRT")
check(len(trains) == 4, "GTFS: 4 perjalanan terbaca dari stop_times")

# --- Comuline tiruan: KRL Bogor arah 0, satu KA lewat tengah malam
cdir = os.path.join(tmp, "comuline"); os.makedirs(os.path.join(cdir, "schedule"))
stations = [{"id": "ST%d" % i, "name": s["n"].upper(), "type": "KRL"} for i, s in enumerate(k0)]
json.dump({"data": stations}, open(os.path.join(cdir, "station"), "w"))
for i, s in enumerate(k0):
    rows = []
    for ka, start in (("1001", 300), ("1003", 23 * 60 + 40)):
        m = start + i * 3
        day = 10 + m // 1440; m %= 1440
        rows.append({"train_id": ka, "line": "COMMUTER LINE BOGOR", "route": "X-Y",
                     "departs_at": "2026-11-%02dT%02d:%02d:00+07:00" % (day, m // 60, m % 60)})
    json.dump({"data": rows}, open(os.path.join(cdir, "schedule", "ST%d" % i), "w"))
ktrains = rs.trains_from_comuline(cdir)
check(len(ktrains) == 2, "Comuline: 2 KA digabung dari jadwal per stasiun")
late = [t for t in ktrains if t["label"] == "KA 1003"][0]
check(all(b[1] > a[1] for a, b in zip(late["stops"], late["stops"][1:])), "KA lewat tengah malam: jam tetap naik (>= 1440)")

built, unmatched = rs.build(trains + ktrains, lines)
check(unmatched == 1, "perjalanan dengan stasiun tak dikenal dibuang (%d)" % unmatched)
check("mrt-ns" in built and len(built["mrt-ns"]["d"][0]["trips"]) == 3, "MRT dicocokkan ke mrt-ns arah 0")
check("krl-b" in built and len(built["krl-b"]["d"][0]["trips"]) == 2, "KRL dicocokkan ke krl-b arah 0")
doc = {"v": 1, "updated": "2026-11-11", "lines": built}
errs = rs.validate(doc, lines)
check(not errs, "validasi lolos" + (": " + "; ".join(errs) if errs else ""))
bad = json.loads(json.dumps(doc)); bad["lines"]["mrt-ns"]["d"][0]["n"] += 1
check(rs.validate(bad, lines), "jumlah stasiun tidak cocok → ditolak")

# --- Mesin rute memakai jadwal: Lebak Bulus → Bundaran HI berangkat 06.05 → kereta 06.10 (t2)
sp = os.path.join(tmp, "sched.json"); json.dump(doc, open(sp, "w"))
js = r"""
const fs=require('fs'),path=require('path');
const W=process.argv[2], sched=JSON.parse(fs.readFileSync(process.argv[3]));
const src=fs.readFileSync(path.join(W,'data.js'),'utf8');
const data=JSON.parse(src.slice(src.indexOf('=')+1).trim().replace(/;$/,''));
const E=require(path.join(W,'engine.js'));
const P=new E.Planner(data);
const mrt=data.lines.find(l=>l.id==='mrt-ns'), s=mrt.dirs[0].s;
const out={};
out.ok=E.useSchedule(sched);
const sc=E.schedTrip(P.lines.find(l=>l.id==='mrt-ns'),0,0,s.length-1,365);
out.trip=sc;
out.none=E.schedTrip(P.lines.find(l=>l.id==='mrt-ns'),0,0,s.length-1,23*60);
out.next=E.nextDepartures(P.lines.find(l=>l.id==='mrt-ns'),0,0,355,5);
const r=P.plan(s[0].p, s[s.length-1].p, null, 360, 2);
const it=r.find(x=>x.legs.some(l=>l.type==='ride'&&l.line.id==='mrt-ns'&&l.fromK===0));
const leg=it&&it.legs.find(l=>l.type==='ride'&&l.line.id==='mrt-ns');
out.leg=leg?{wait:leg.wait,min:leg.min,sched:leg.sched,fromK:leg.fromK,toK:leg.toK}:null;
out.bad=E.useSchedule({v:1,lines:{x:{d:[{n:2,trips:[["a",[1]]]}]}}});
console.log(JSON.stringify(out));
"""
jp = os.path.join(tmp, "t.js"); open(jp, "w").write(js)
W = os.path.join(HERE, "..", "app", "src", "main", "assets", "www", "js")
res = json.loads(subprocess.check_output(["node", jp, W, sp]).decode())
check(res["ok"] is True, "engine.useSchedule menerima jadwal")
check(res["trip"] and res["trip"]["dep"] == 370 and res["trip"]["wait"] == 5, "schedTrip 06.05 → kereta 06.10, tunggu 5 mnt (%s)" % res["trip"])
check(res["none"] == {"none": True}, "setelah kereta terakhir → {none:true}")
check([x["dep"] for x in res["next"]] == [360, 370, 380], "nextDepartures 05.55 → 06.00, 06.10, 06.20")
leg = res["leg"]
check(leg is not None and leg["sched"] is not None, "rencana perjalanan memakai jadwal pada ruas MRT")
if leg and leg["sched"]:
    n = leg["toK"] - leg["fromK"]
    check(abs(leg["min"] - n * 2) < 0.01, "lama di kereta = selisih jadwal (%s mnt)" % leg["min"])
check(res["bad"] is False, "jadwal rusak ditolak engine")

if fails:
    print(fails, "pemeriksaan gagal"); sys.exit(1)
print("Semua uji jadwal kereta lulus")
