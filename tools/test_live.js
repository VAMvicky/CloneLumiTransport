// Uji live.js (klien MQTT posisi bus): node tools/test_live.js
// Mencakup: cadangan topik umum bersifat sementara (v2.15), pembacaan aliran byte berbasis offset,
// dan header x-app-version yang tidak lagi ditanam di kode.
const fs = require("fs"), path = require("path"), vm = require("vm");
const SRC = fs.readFileSync(path.join(__dirname, "..", "app/src/main/assets/www/js/live.js"), "utf8");

let fails = 0;
function check(ok, msg) { if (!ok) { fails++; console.error("GAGAL: " + msg); } else console.log("ok: " + msg); }

function makeEnv() {
  let now = 1_700_000_000_000;
  const timers = [];
  let tid = 0;
  const store = {};
  const sent = [];
  const env = {
    console, TextEncoder, TextDecoder, Uint8Array, JSON, Math, Promise, Object, Array, String, Number, RegExp, Error,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    isFinite,
    lumiLog: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    setTimeout: (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0, clearInterval: () => {},
  };
  env.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  env.LUMI_BUILD = { version: "9.9.9", tjClientVersion: "3.1.4" };
  env.LumiNative = {
    opened: 0, closed: 0, filter: null,
    liveOpen() { this.opened++; },
    liveSend(b64) { sent.push(Buffer.from(b64, "base64")); },
    liveFilter(j) { this.filter = JSON.parse(j); },
    liveClose() { this.closed++; },
  };
  env.window = env;
  vm.createContext(env);
  vm.runInContext(SRC, env);
  return {
    env, store, sent, Live: env.LumiLive,
    advance(ms) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > until) break;
        timers.shift(); now = t.at; t.fn();
      }
      now = until;
    },
  };
}

function b64(u8) { return Buffer.from(u8).toString("base64"); }
function remLen(n) { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; }
function publish(topic, obj) {
  const t = Buffer.from(topic), p = Buffer.from(JSON.stringify(obj));
  const body = [t.length >> 8, t.length & 255, ...t, ...p];
  return Uint8Array.from([0x30, ...remLen(body.length), ...body]);
}
const CONNACK = Uint8Array.from([0x20, 2, 0, 0]);
function subscribed(sent) {
  // Topik dari paket SUBSCRIBE (0x82) yang terkirim
  return sent.filter((p) => p[0] === 0x82).map((p) => {
    let i = 1; while (p[i] & 128) i++; i++;
    i += 2; const len = (p[i] << 8) | p[i + 1];
    return p.slice(i + 2, i + 2 + len).toString();
  });
}

/* 1) Pemutusan setelah langganan per rute → topik umum SEMENTARA, tidak tersimpan permanen */
{
  const T = makeEnv();

  const T2 = makeEnv(); T2.store["lumi:liveAll"] = "1";
  // muat ulang dengan sisa kunci lama: harus dibersihkan & tidak memaksa mode umum
  vm.runInContext(SRC, T2.env);
  check(T2.store["lumi:liveAll"] === undefined, "kunci lama lumi:liveAll dibersihkan saat dimuat");
  check(T2.env.LumiLive.allMode() === false, "versi lama tidak lagi memaksa mode umum");

  const got = [];
  const stop = T.Live.watch(["9"], (m) => got.push(m));
  check(T.env.LumiNative.opened === 1, "koneksi native dibuka saat ada pemantau");
  T.Live.__nativeOpen();
  T.Live.__nativeData([b64(CONNACK)]);
  check(subscribed(T.sent).includes("/mobile_armada/+/9/#"), "langganan pertama per rute");
  T.Live.__nativeClose("putus");
  check(T.Live.allMode() === true, "putus setelah langganan per rute → mode umum aktif");
  check(!("lumi:liveAll" in T.store), "mode umum TIDAK disimpan ke localStorage");
  const until = T.Live.allModeUntil() - T.env.Date.now();
  check(until > 29 * 60000 && until <= 30 * 60000, "mode umum berlaku ±30 menit (" + Math.round(until / 60000) + " mnt)");

  T.advance(600);                                      // percobaan ulang
  check(T.env.LumiNative.opened === 2, "menyambung ulang");
  T.sent.length = 0;
  T.Live.__nativeOpen(); T.Live.__nativeData([b64(CONNACK)]);
  check(subscribed(T.sent).includes("/mobile_armada/#"), "sambungan ulang memakai topik umum");
  T.Live.__nativeData([b64(publish("/mobile_armada/1/9/x/TJ001", { route_code: "9", latitude: -6.2, longitude: 106.8 }))]);
  check(got.length === 1, "data rute yang dipantau tetap diteruskan dalam mode umum");

  T.sent.length = 0;
  T.advance(31 * 60000);                               // tenggat lewat → kembali per rute tanpa putus
  check(T.Live.allMode() === false, "setelah 30 menit mode umum berakhir");
  const subs = subscribed(T.sent);
  check(subs.includes("/mobile_armada/+/9/#"), "langganan ditukar kembali ke per rute");
  check(T.sent.some((p) => p[0] === 0xA2), "topik umum di-unsubscribe");

  // per rute ditolak lagi → cadangan berikutnya lebih lama (2 jam)
  T.Live.__nativeClose("putus lagi");
  const until2 = T.Live.allModeUntil() - T.env.Date.now();
  check(until2 > 100 * 60000 && until2 <= 120 * 60000, "kegagalan kedua → cadangan ±2 jam");
  stop();
}

/* 2) Aliran byte: beberapa paket dalam satu potongan + paket terpotong di tengah */
{
  const T = makeEnv();
  const got = [];
  T.Live.watch(["JAK36"], (m) => got.push(m.n));
  T.Live.__nativeOpen(); T.Live.__nativeData([b64(CONNACK)]);
  const pk = [];
  for (let i = 0; i < 50; i++) pk.push(...publish("/mobile_armada/2/JAK36/a/B" + i, { route_code: "JAK36", n: i, pad: "x".repeat(150) }));
  const all = Uint8Array.from(pk);
  // potong acak di posisi yang membelah paket
  const cuts = [7, 333, 334, 2001, 5000, all.length];
  let prev = 0;
  for (const c of cuts) { T.Live.__nativeData([b64(all.slice(prev, c))]); prev = c; }
  check(got.length === 50 && got.every((n, i) => n === i), "50 paket terbaca utuh & berurutan walau terpotong (" + got.length + ")");
}

/* 3) x-app-version dari satu sumber (native → remote config → build.js), tidak tertanam */
{
  const T = makeEnv();
  check(T.Live.tjClientVersion() === "3.1.4", "x-app-version dari LUMI_BUILD (build.js)");
  T.store["lumi:remoteCfg"] = JSON.stringify({ v: 1, tjClientVersion: "2.12.0" });
  check(T.Live.tjClientVersion() === "2.12.0", "remote_config.json bisa menaikkan x-app-version tanpa rilis");
  T.env.LumiNative.tjClientVersion = () => "2.13.0";
  check(T.Live.tjClientVersion() === "2.13.0", "nilai dari native (BuildConfig/override) diutamakan");
  check(!/x-app-version":\s*"\d/.test(SRC), "tidak ada angka versi tertanam di live.js");
}

if (fails) { console.error(fails + " pemeriksaan gagal"); process.exit(1); }
console.log("Semua uji live.js lulus");
