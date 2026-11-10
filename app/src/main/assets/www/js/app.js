/* Lumi Transport — logika antarmuka */
(function () {
  "use strict";
  var E = window.LumiEngine, DATA = window.LUMI_DATA;
  var MODES = E.MODES, RAIL = E.RAIL;
  /* ----------------------------------------------------------------
   * Data rute Transjakarta hasil unduhan GTFS resmi (diproses di HP) menggantikan data bawaan.
   * -------------------------------------------------------------- */
  var ROUTE_SRC = { kind: "bawaan" };
  function hav2(a, b) { return E.hav(a, b); }
  /* Pola memutar: halte awal = halte akhir (atau berdekatan). */
  function isLoop(d) {
    if (!d || !d.s || d.s.length < 4) return false;
    var a = d.s[0], b = d.s[d.s.length - 1];
    return a.n === b.n || hav2(a.p, b.p) < 0.35;
  }
  /* Indeks titik balik: halte terjauh dari halte awal. */
  function turnIndex(d) {
    var best = 0, bd = -1;
    d.s.forEach(function (x, i) { var k = hav2(d.s[0].p, x.p); if (k > bd) { bd = k; best = i; } });
    return best;
  }
  function splitLoop(d) {
    var t = turnIndex(d);
    if (t <= 0 || t >= d.s.length - 1) return [d];
    function cutShape(from, to) {
      if (!d.shape || d.shape.length < 2) return null;
      function near(p) { var bi = 0, bd = 1e9; d.shape.forEach(function (q, i) { var k = hav2(p, q); if (k < bd) { bd = k; bi = i; } }); return bi; }
      var i0 = from === 0 ? 0 : near(d.s[from].p), i1 = to === d.s.length - 1 ? d.shape.length - 1 : near(d.s[to].p);
      return i1 > i0 ? d.shape.slice(i0, i1 + 1) : null;
    }
    var a = { h: d.s[t].n, dir: d.dir, main: true, s: d.s.slice(0, t + 1), shape: cutShape(0, t) };
    var b = { h: d.s[d.s.length - 1].n, dir: d.dir, main: true, s: d.s.slice(t), shape: cutShape(t, d.s.length - 1) };
    return [a, b];
  }
  (function mergeOfficial() {
    var raw = null;
    try { raw = window.LumiNative && window.LumiNative.getRouteData && window.LumiNative.getRouteData(); } catch (e) { lumiLog(e); }
    if (!raw) { try { raw = localStorage.getItem("lumi:gtfsTest"); } catch (e) { lumiLog(e); } }   // untuk uji di browser
    // R6: belum ada unduhan → pakai ringkasan GTFS resmi yang ikut di APK (js/gtfs.js).
    var g = null, bundled = false;
    if (raw) { try { g = JSON.parse(raw); } catch (e) { lumiLog(e, "gtfs"); } }
    if (!g && window.LUMI_GTFS) { g = window.LUMI_GTFS; bundled = true; }
    window.LUMI_GTFS = null;   // lepaskan memori; DATA.lines sudah memegang yang dipakai
    if (!g || !g.lines || !g.lines.length) return;
    var MAIN = {}; for (var i = 1; i <= 14; i++) MAIN[String(i)] = 1;
    var M24 = { JAK36: 1, JAK47: 1, JAK52: 1, JAK75: 1 };
    var H = {
      MAIN: [[[0, 1440]], "24 jam. Pukul 22.00–05.00 dilayani bus AMARI (malam), tiap ±20–40 menit."],
      DAY: [[[300, 1320]], "05.00–22.00"], ROYAL: [[[300, 1260]], "±05.00–21.00 (sebagian rute hanya jam sibuk)"],
      M24: [[[0, 1440]], "24 jam (layanan AMARI Mikrotrans)."], WISATA: [[[540, 1020]], "±09.00–17.00"]
    };
    function norm(c) { return String(c || "").toUpperCase().replace(/[.\-\s]/g, ""); }
    var byCode = {};
    DATA.lines.forEach(function (l) { if (l.mode === "TJ" || l.mode === "MIKRO" || l.mode === "ROYAL") byCode[norm(l.code)] = l; });
    var MAINC = { "1": "#C1272D", "2": "#1D3E8F", "3": "#E8B500", "4": "#5B2C6F", "5": "#C2571A", "6": "#2E8B3E", "7": "#E0457B",
      "8": "#C21C8E", "9": "#2F9C95", "10": "#8E1B1E", "11": "#2F4FA2", "12": "#4FA35A", "13": "#5C359D", "14": "#F28C28" };
    var replaced = {}, added = [];
    g.lines.forEach(function (r) {
      var code = norm(r.code);
      if (!code || /^M\d+[A-Z]?$/.test(code)) return;          // layanan AMARI (M1–M14): koridor utama sudah 24 jam
      var old = byCode[code];
      var desc = (r.desc || "").toUpperCase();
      var cat = old && old.cat ? old.cat :
        (/^JAK/.test(code) ? "MIKRO" : /^HC\d/.test(code) ? "ROYAL" : /BRT/.test(desc) ? "BRT" : /ROYAL/.test(desc) ? "ROYAL" : /JABODETABEK/.test(desc) ? "JABODETABEK" :
         /RUSUN/.test(desc) ? "RUSUN" : /WISATA/.test(desc) ? "WISATA" : "PENGUMPAN");
      var mode = cat === "MIKRO" ? "MIKRO" : (cat === "ROYAL" || cat === "JABODETABEK") ? "ROYAL" : "TJ";
      var brt = cat === "BRT", main = brt && !!MAIN[code];
      var hk = main ? "MAIN" : M24[code] ? "M24" : mode === "ROYAL" ? "ROYAL" : cat === "WISATA" ? "WISATA" : "DAY";
      var dirs = (r.dirs || []).filter(function (d) { return d.s && d.s.length >= 2; });
      if (!dirs.length) return;
      // GTFS resmi sering menyimpan satu perjalanan pulang-pergi sebagai satu pola memutar
      // (mis. 9: Pluit → Cawang → Pluit; JAK.36: Cilangkap → PGC → Cilangkap). Semua pola memutar
      // dipecah di titik balik, lalu dipilih dua arah utama yang saling berlawanan; pola lain jadi varian.
      function names(d) { return d.s.map(function (x) { return x.n; }); }
      function isSlice(sub, full) { return full.join("\u0001").indexOf(sub.join("\u0001")) >= 0; }
      function near(a, b) { return a.n === b.n || hav2(a.p, b.p) < 0.6; }
      var exp = [];
      dirs.forEach(function (d, i) {
        var parts = isLoop(d) ? splitLoop(d) : [d];
        parts.forEach(function (h, j) {
          exp.push({ h: h.h || d.h, dir: String(d.dir || "0") + (parts.length > 1 ? (j ? "b" : "a") : ""), main: d.main !== false,
            s: h.s, shape: h.shape !== undefined ? h.shape : d.shape, ord: i });
        });
      });
      // buang pola duplikat (urutan halte sama)
      var seenSeq = {};
      exp = exp.filter(function (d) { var k = names(d).join("\u0001"); if (seenSeq[k]) return false; seenSeq[k] = 1; return true; });
      exp.sort(function (x, y) { return (y.s.length - x.s.length) || ((y.main ? 1 : 0) - (x.main ? 1 : 0)) || (x.ord - y.ord); });
      // Arah utama A = pola terpanjang; B = pola terpanjang yang berangkat dari ujung A (arah sebaliknya).
      var A = exp[0];
      function nearKm(a, b, km) { return a.n === b.n || hav2(a.p, b.p) < km; }
      var B = exp.filter(function (d) { return d !== A && nearKm(d.s[0], A.s[A.s.length - 1], 0.6) && nearKm(d.s[d.s.length - 1], A.s[0], 0.6); })[0] ||
              exp.filter(function (d) { return d !== A && nearKm(d.s[0], A.s[A.s.length - 1], 1.2); })[0] ||
              exp.filter(function (d) { return d !== A && nearKm(d.s[d.s.length - 1], A.s[0], 1.2); })[0] || null;
      var mainsD = B ? [A, B] : [A];
      var variants = [];
      exp.forEach(function (d) {
        if (mainsD.indexOf(d) >= 0) return;
        var nm = names(d);
        if (mainsD.some(function (m) { return isSlice(nm, names(m)); })) return;
        var vEnd = d.s[d.s.length - 1], vBeg = d.s[0];
        var base = mainsD.filter(function (m) { return near(m.s[m.s.length - 1], vEnd); })[0] ||
                   mainsD.filter(function (m) { return near(m.s[0], vBeg); })[0] || A;
        var bn = names(base);
        var skip = bn.filter(function (x) { return nm.indexOf(x) < 0 && bn.indexOf(x) > bn.indexOf(nm[0]) && bn.indexOf(x) < bn.indexOf(nm[nm.length - 1]); });
        var extra = nm.filter(function (x) { return bn.indexOf(x) < 0; });
        var isTol = /tol/i.test(d.h || "");
        var parts = [];
        if (skip.length) parts.push("tidak berhenti di " + skip.slice(0, 3).join(", ") + (skip.length > 3 ? " dll." : ""));
        if (extra.length) parts.push("lewat " + extra.slice(0, 3).join(", ") + (extra.length > 3 ? " dll." : ""));
        var bLast = bn[bn.length - 1], vLast = nm[nm.length - 1], vFirst = nm[0];
        var vp = [];
        if (isTol) vp.push("via Tol");
        if (!near(vBeg, base.s[0])) vp.push("mulai " + vFirst);
        var ex2 = extra.filter(function (x) { return x !== vFirst && x !== vLast; });
        if (ex2.length) vp.push("lewat " + ex2[0] + (ex2.length > 1 ? " dll." : ""));
        if (skip.length && !isTol) vp.push("tanpa " + skip[0] + (skip.length > 1 ? " dll." : ""));
        if (!near(vEnd, base.s[base.s.length - 1])) vp.push("s.d. " + vLast);
        if (!vp.length) return;                               // tidak ada beda yang berarti
        d.v = (isTol ? "Via Tol: " : "Varian: ") + (parts.join("; ") || vp.join(", "));
        d.vs = vp.slice(0, 2).join(" · ");
        d.vbase = mainsD.indexOf(base);
        variants.push(d);
      });
      // satu varian per keterangan, urut sesuai arah utamanya
      var seenVs = {};
      variants = variants.filter(function (d) { var k = d.vbase + "|" + d.vs; if (seenVs[k]) return false; seenVs[k] = 1; return true; });
      variants.sort(function (x, y) { return (x.vbase - y.vbase) || (y.s.length - x.s.length); });
      dirs = mainsD.concat(variants.slice(0, 6)).map(function (d) { return { h: d.h, dir: d.dir, main: mainsD.indexOf(d) >= 0, s: d.s, shape: d.shape, v: d.v, vs: d.vs }; });
      if (dirs.length === 1) dirs.push({ h: "Arah balik", s: dirs[0].s.slice().reverse(), shape: dirs[0].shape ? dirs[0].shape.slice().reverse() : null });
      var color = r.color && /^[0-9A-Fa-f]{6}$/.test(r.color) ? "#" + r.color : (old && old.color) || MAINC[(code.match(/\d+/) || [""])[0]] || "#8D8482";
      if (brt && MAINC[code]) color = MAINC[code];
      var line = { id: "tj-" + code.toLowerCase(), mode: mode, code: old ? old.code : r.code, name: (old && old.name) || r.name, color: color,
        brt: brt, main: main, cat: cat, hours: H[hk][0], hoursText: H[hk][1],
        note: "Halte: GTFS resmi Transjakarta (diunduh " + g.date + ").", dirs: dirs };
      replaced[code] = line;
    });
    var lines = [];
    DATA.lines.forEach(function (l) {
      var c = norm(l.code);
      if ((l.mode === "TJ" || l.mode === "MIKRO" || l.mode === "ROYAL") && replaced[c]) { lines.push(replaced[c]); delete replaced[c]; }
      else lines.push(l);
    });
    for (var k in replaced) lines.push(replaced[k]);
    DATA.lines = lines;
    var n = 0; lines.forEach(function (l) { if (/^GTFS resmi/.test(String(l.note).replace("Halte: ", ""))) n++; });
    ROUTE_SRC = { kind: "gtfs", date: g.date, count: g.lines.length, bundled: bundled };
  })();
  /*
   * Titik halte/stasiun diselaraskan dengan OpenStreetMap (peta yang kamu lihat). Berlaku untuk data bawaan
   * maupun GTFS resmi yang diunduh harian: dicocokkan per nama + jarak ≤80 m dari titik asal.
   * Daftar terbaru diambil dari GitHub (diperbarui tiap minggu) dan dipakai sejak aplikasi dibuka berikutnya.
   */
  /* R10: data yang diambil dari GitHub diperiksa dulu (bentuk, jumlah, rentang nilai) sebelum disimpan/dipakai. */
  function inJabo(lat, lon) { return lat > -7.2 && lat < -5.7 && lon > 105.9 && lon < 107.6; }
  function validStopFix(j) {
    if (!j || j.v !== 2 || !j.fix || typeof j.fix !== "object" || !/^\d{4}-\d{2}-\d{2}/.test(String(j.date || ""))) return false;
    var keys = Object.keys(j.fix), n = 0;
    if (keys.length > 20000) return false;
    for (var i = 0; i < keys.length; i++) {
      var arr = j.fix[keys[i]];
      if (!Array.isArray(arr) || keys[i].length > 120) return false;
      for (var k = 0; k < arr.length; k++) {
        var e = arr[k];
        if (!Array.isArray(e) || e.length !== 4 || !e.every(function (x) { return typeof x === "number" && isFinite(x); })) return false;
        if (!inJabo(e[0], e[1]) || !inJabo(e[2], e[3]) || E.hav([e[0], e[1]], [e[2], e[3]]) > 1.5) return false;   // geser maks. 1,5 km
        if (++n > 50000) return false;
      }
    }
    return true;
  }
  function validFares(f) {
    if (!f || f.v !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.updated || ""))) return false;
    var need = ["tj", "krl", "mrt", "lrt", "lrtj", "kaBandara", "whoosh", "ojol"];
    for (var i = 0; i < need.length; i++) if (!f[need[i]] || typeof f[need[i]] !== "object") return false;
    var ok = true;
    (function walk(o, d) {
      if (d > 5) { ok = false; return; }
      for (var k in o) {
        var v = o[k];
        if (typeof v === "number") { if (!isFinite(v) || v < 0 || v > 1000000) ok = false; }
        else if (v && typeof v === "object" && k !== "notes") walk(v, d + 1);
      }
    })(f, 0);
    if (!ok || !Array.isArray(f.tj.free) || !Array.isArray(f.tj.premium) || !Array.isArray(f.lrtj.peak)) return false;
    try { f.tj.premium.forEach(function (p) { new RegExp(p[0]); }); } catch (e) { return false; }
    return true;
  }
  /* Tarif terbaru dari repo (data/fares.json) menggantikan tarif bawaan bila lebih baru (R8). */
  (function applyFares() {
    try {
      var f = JSON.parse(localStorage.getItem("lumi:fares") || "null");
      if (f && validFares(f) && f.updated > ((DATA.fares || {}).updated || "")) DATA.fares = f;
    } catch (e) { lumiLog(e); }
  })();
  (function applyStopFix() {
    var F = window.LUMI_STOPFIX;
    try { var c = JSON.parse(localStorage.getItem("lumi:stopfix") || "null"); if (c && validStopFix(c) && (!F || c.date > F.date)) F = c; } catch (e) { lumiLog(e); }
    if (!F || !F.fix || F.v !== 2) return;
    var n = 0;
    DATA.lines.forEach(function (l) {
      (l.dirs || []).forEach(function (d) {
        (d.s || []).forEach(function (st) {
          var arr = F.fix[st.n]; if (!arr) return;
          for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (E.hav([e[0], e[1]], st.p) <= 0.08) { st.p = [e[2], e[3]]; n++; break; }
          }
        });
      });
    });
    window.__lumiStopFix = { date: F.date, applied: n };
  })();
  var planner = new E.Planner(DATA);
  // B10: kait uji hanya aktif di browser (bukan aplikasi Android) atau bila localStorage "lumi:debug" = "1".
  var DEBUG = !window.LumiNative; try { if (localStorage.getItem("lumi:debug") === "1") DEBUG = true; } catch (e) { lumiLog(e); }
  if (DEBUG) window.__lumiDebug = { planner: planner, data: DATA, src: function () { return ROUTE_SRC; }, tripZoom: function () { return tripMap ? tripMap.getZoom() : -1; }, liveWalk: function () { return LIVEW; }, busEta: function (b, l, p, f) { return busEta(b, l, p, f); }, routeEta: function (b, l, p) { return routeEta(b, l, p); }, dynKm: function () { return (GT.trip.dyn || []).map(function (d) { return pathKm(d.lines[1].getLatLngs().map(function (q) { return [q.lat, q.lng]; })); }); } };   // untuk pengujian
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var NATIVE = window.LumiNative || null;
  /* Bahasa: tl("teks id", "english") untuk kalimat berisi nama/angka; T() untuk teks yang keluar dari halaman. */
  var I18 = window.LumiI18n || { en: false, t: function (s) { return s; }, L: function (a) { return a; } };
  var EN = I18.en, T = I18.t, tl = I18.L;

  /* ------------------------------------------------------------ util */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function rp(n) { return "Rp" + Math.round(n).toLocaleString(window.LumiI18n && window.LumiI18n.en ? "en-US" : "id-ID"); }
  function fareText(lo, hi) { return lo === hi ? (lo === 0 ? "Gratis" : rp(lo)) : rp(lo) + "–" + rp(hi).replace("Rp", ""); }
  function mins(m) { m = Math.round(m); var u = tl(" mnt", " min"); return m < 60 ? m + u : Math.floor(m / 60) + tl(" j ", " h ") + (m % 60) + u; }
  function dec(x) { return EN ? x.toFixed(1) : x.toFixed(1).replace(".", ","); }
  function km(k) { return k < 1 ? Math.round(k * 1000 / 10) * 10 + " m" : dec(k) + " km"; }
  function clock(d) { return ("0" + d.getHours()).slice(-2) + "." + ("0" + d.getMinutes()).slice(-2); }
  function addMin(d, m) { return new Date(d.getTime() + m * 60000); }
  function textColor(hex) {
    var c = hex.replace("#", ""); var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? "#13234B" : "#fff";
  }
  function badge(line, cls, color) {
    var c = color || line.color;
    return '<span class="badge ' + (cls || "") + '" style="background:' + c + ';color:' + textColor(c) + '">' + esc(line.code) + "</span>";
  }
  /* Warna per langkah: dua rute berturut-turut yang warnanya sama/mirip (mis. JAK36 lalu JAK43B, sama-sama biru
     Mikrotrans) diberi warna pembeda agar jelas di strip, peta, detail, dan gambar bagikan. */
  var ALT_COLORS = ["#0E9384", "#7C4DD8", "#D9601A", "#C2185B", "#2E7D32"];
  function rgb(h) { var c = h.replace("#", ""); return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)]; }
  function near(a, b) { var x = rgb(a), y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 110; }
  function colorize(it) {
    if (!it || it._colored) return it;
    var used = [], prev = null;
    it.legs.forEach(function (l) {
      if (l.type !== "ride") { if (l.type === "ojol") prev = "#00AA13"; return; }
      var c = l.line.color || "#8D8482";
      if (prev && near(c, prev)) {
        c = ALT_COLORS.filter(function (a) { return !near(a, prev) && used.indexOf(a) < 0 && !near(a, l.line.color); })[0] || ALT_COLORS[0];
        l.colorNote = true;
      }
      l._c = c; used.push(c); prev = c;
    });
    it._colored = true;
    return it;
  }
  function lc(l) { return l._c || l.line.color; }
  function nextRideText(n) { return n && n.type === "ride" ? tl(", lalu ganti ke ", ", then change to ") + "<b>" + esc(modeLabel(n.line) + " " + n.line.code) + "</b>" : ""; }
  function sameStopText(p, n) {
    var railBoth = p && n && p.type === "ride" && n.type === "ride" && RAIL[p.line.mode] && RAIL[n.line.mode];
    if (railBoth) return tl("Pindah peron/jalur di stasiun yang sama", "Change platforms at the same station") + nextRideText(n);
    if (n && n.type === "ride") return tl("Turun, lalu ganti ke ", "Get off, then change to ") + "<b>" + esc(modeLabel(n.line) + " " + n.line.code) + "</b>" +
      (RAIL[n.line.mode] ? tl(" di stasiun yang sama", " at the same station") : tl(" di halte yang sama", " at the same stop"));
    return tl("Pindah di tempat yang sama", "Change at the same place");
  }
  function modeLabel(line) {
    if (line.mode === "TJ") return line.brt ? "Transjakarta" : "Transjakarta non-BRT";
    if (line.mode === "ROYAL" && line.cat === "JABODETABEK") return "Transjabodetabek";
    if (line.mode === "KABANDARA") return tl("KA Bandara", "Airport Rail");
    return MODES[line.mode].label;
  }
  function stopWord(n, rail) { return n + " " + (rail ? tl("stasiun", n === 1 ? "station" : "stations") : tl("halte", n === 1 ? "stop" : "stops")); }
  var toastT;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  window.lumiToast = toast;
  /* Tinggi status bar / navigation bar dari Android, dipakai CSS (--safe-top/--safe-bottom). */
  /* Nilai dalam dp (= px CSS). `ime` true selama keyboard terbuka: WebView sudah dikecilkan native,
     nav bawah disembunyikan agar daftar dan kolom pencarian punya ruang. */
  window.__lumiInsets = function (top, bottom, ime) {
    try {
      var de = document.documentElement, r = de.style;
      r.setProperty("--safe-t", Math.max(0, +top || 0) + "px");
      r.setProperty("--safe-b", Math.max(0, +bottom || 0) + "px");
      de.classList.toggle("kb-open", !!ime);
    } catch (e) { lumiLog(e); }
  };
  try {
    if (window.LumiNative && window.LumiNative.insets) {
      var in0 = JSON.parse(window.LumiNative.insets());
      window.__lumiInsets(in0.top, in0.bottom, in0.ime);
    }
  } catch (e) { lumiLog(e); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("lumi:" + k)); localStorage.setItem("lumi:" + k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ------------------------------------------------------- riwayat perjalanan */
  function trips() { var t = store("trips"); return Array.isArray(t) ? t : []; }
  function recordTrip(it) {
    try {
      if (!S.from || !S.to || !it) return;
      var now = Date.now();
      var list = trips();
      var key = (S.from.name || "") + "|" + (S.to.name || "") + "|" + (it.min || 0);
      // Panduan yang dihentikan lalu dimulai lagi dalam 2 menit tidak dihitung dua kali.
      if (list[0] && list[0].key === key && now - list[0].ts < 120000) return;
      var modes = [], seen = {};
      (it.legs || []).forEach(function (l) {
        if (l.type === "ride" && l.line && !seen[l.line.mode]) { seen[l.line.mode] = 1; modes.push(MODES[l.line.mode] ? MODES[l.line.mode].label : l.line.mode); }
      });
      list.unshift({ key: key, ts: now, from: S.from.name || "", to: S.to.name || "", mins: it.min || 0, fare: it.fareLo || 0, modes: modes.join(" + ") });
      store("trips", list.slice(0, 50));
    } catch (e) { lumiLog(e); }
  }
  function historyCardHTML() {
    var list = trips();
    if (!list.length) {
      return '<div class="set-card"><h3>Riwayat perjalanan</h3><p>Belum ada perjalanan. Begitu kamu memulai pendampingan pada sebuah rute, perjalanan itu tercatat di sini beserta ongkosnya.</p></div>';
    }
    var m0 = nowWib(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    var total = 0, n = 0;
    list.forEach(function (t) { if (wibOf(t.ts || 0).getTime() >= m0.getTime()) { total += t.fare || 0; n++; } });
    var rows = list.slice(0, 12).map(function (t) {
      var d = wibOf(t.ts || 0);
      var tanggal = d.getDate() + "/" + (d.getMonth() + 1) + "/" + String(d.getFullYear()).slice(2);
      return '<div class="hist-row"><div class="hist-main"><b>' + esc(t.from) + " → " + esc(t.to) + "</b><span>" + tanggal +
        (t.modes ? " · " + esc(T(t.modes)) : "") + (t.mins ? " · " + mins(t.mins) : "") + '</span></div><div class="hist-fare">' + rp(t.fare || 0) + "</div></div>";
    }).join("");
    return '<div class="set-card"><h3>Riwayat perjalanan</h3>' +
      "<p><b>" + n + tl(" perjalanan bulan ini", n === 1 ? " trip this month" : " trips this month") + "</b> · total <b>" + rp(total) + "</b></p>" +
      '<div class="hist-list">' + rows + "</div>" +
      '<button class="btn-sec" id="btnClearTrips" type="button">Hapus riwayat</button></div>';
  }

  /* ------------------------------------------------------- tab halte & riwayat */
  var STOP_INDEX = null;
  function stopIndex() {
    if (STOP_INDEX) return STOP_INDEX;
    var byKey = {}, out = [];
    var lines = (window.LUMI_DATA && LUMI_DATA.lines) ? LUMI_DATA.lines : [];
    lines.forEach(function (l) {
      (l.dirs || []).forEach(function (d) {
        (d.s || []).forEach(function (st) {
          if (!st || !st.n || !st.p) return;
          var key = st.n + "@" + (+st.p[0]).toFixed(4) + "," + (+st.p[1]).toFixed(4);
          if (!byKey[key]) { byKey[key] = { n: st.n, p: st.p, codes: {} }; out.push(byKey[key]); }
          byKey[key].codes[l.code] = 1;
        });
      });
    });
    STOP_INDEX = out.sort(function (a, b) { return a.n.localeCompare(b.n); });
    return STOP_INDEX;
  }
  function renderStops(q) {
    q = (q || "").toLowerCase();
    var list = stopIndex().filter(function (s) { return !q || s.n.toLowerCase().indexOf(q) >= 0; }).slice(0, 200);
    var box = $("#stopList");
    if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="fav-empty">' + tl("Tidak ada halte atau stasiun yang cocok.", "No matching stop or station.") + "</p>"; return; }
    box.innerHTML = list.map(function (s, i) {
      var codes = Object.keys(s.codes).slice(0, 5).join(", ");
      return '<button class="stop-row" data-stop="' + i + '"><b>' + esc(s.n) + '</b><span>' + esc(codes) + "</span></button>";
    }).join("");
    $$("#stopList .stop-row").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = list[+b.dataset.stop];
        if (s) openStopActions(s);
      });
    });
  }
  /* Rute yang benar-benar berhenti di halte/stasiun ini: nama sama dan titiknya berdekatan
     (halte dua arah biasanya berjarak puluhan meter). Halte bus dan stasiun yang namanya sama
     (mis. "Manggarai") dipisah: entri ini dianggap stasiun bila rute di titik persisnya semuanya kereta. */
  function linesAtStop(s) {
    var key = nmKey(s.n), near = [], exact = [];
    planner.lines.forEach(function (l) {
      var best = 9;
      (l.dirs || []).forEach(function (d) {
        (d.s || []).forEach(function (x) { if (x && x.p && nmKey(x.n) === key) best = Math.min(best, E.hav(s.p, x.p)); });
      });
      if (best < 0.2) near.push(l);
      if (best < 0.01) exact.push(l);
    });
    var station = exact.length > 0 && exact.every(function (l) { return RAIL[l.mode]; });
    return near.filter(function (l) { return station ? RAIL[l.mode] : !RAIL[l.mode]; });
  }
  /* Lembar aksi halte/stasiun: berangkat dari sini, pergi ke sini, dan (khusus halte bus) posisi bus. */
  function openStopActions(s) {
    var m = $("#sheetStop"); if (!m) return;
    var lines = linesAtStop(s), isStation = lines.length > 0 && lines.every(function (l) { return RAIL[l.mode]; }), bus = isStation ? [] : lines.filter(liveOk);
    $("#stopActName").textContent = s.n;
    $("#stopActKind").textContent = isStation ? tl("Stasiun", "Station") : tl("Halte", "Stop");
    $("#stopActLines").innerHTML = lines.slice(0, 14).map(function (l) { return badge(l, "xs"); }).join("") +
      (lines.length > 14 ? '<span class="s-num">+' + (lines.length - 14) + "</span>" : "");
    $("#stopActLive").hidden = !bus.length;
    var use = function (which) {
      m.hidden = true;
      setPoint(which, { name: s.n, p: s.p });
      setTab("plan");
      if (S.from && S.to) runPlan(); else { S.field = which === "from" ? "to" : "from"; (which === "from" ? inTo : inFrom).focus(); }
    };
    $("#stopActFrom").onclick = function () { use("from"); };
    $("#stopActTo").onclick = function () { use("to"); };
    $("#stopActLive").onclick = function () { m.hidden = true; openLiveAt(s.p, s.n, { stop: s, lines: bus }); };
    m.hidden = false;
  }
  function renderHistoryTab() {
    var box = $("#historyBody");
    if (!box) return;
    box.innerHTML = tr(historyCardHTML()).replace('id="btnClearTrips"', 'id="btnClearHistory"');
    var c = $("#btnClearHistory");
    if (c) c.addEventListener("click", function () { store("trips", []); renderHistoryTab(); toast(tl("Riwayat perjalanan dihapus", "Trip history cleared")); });
  }

  /* ------------------------------------------------------- aksesibilitas */
  function langCardHTML() {
    var lang = cfg().lang === "en" ? "en" : "id";
    return '<div class="set-card"><h3>Bahasa / Language</h3>' +
      '<label class="set-field"><span>Bahasa aplikasi</span><select id="setLang">' +
      '<option value="id"' + (lang === "id" ? " selected" : "") + '>Bahasa Indonesia</option>' +
      '<option value="en"' + (lang === "en" ? " selected" : "") + '>English</option>' +
      '</select></label>' +
      '<p>Semua teks aplikasi ikut berganti, termasuk hasil rute, notifikasi, dan panduan suara.</p></div>';
  }
  function accessCardHTML() {
    return '<div class="set-card"><h3>Aksesibilitas</h3>' +
      '<label class="set-row"><span>Mode aksesibel</span><input type="checkbox" id="setAccess"' + (cfg().accessible ? " checked" : "") + '></label>' +
      '<label class="set-row"><span>Panduan suara</span><input type="checkbox" id="setVoice"' + (cfg().voice ? " checked" : "") + '></label>' +
      '<p>Huruf lebih besar, tombol lebih tinggi, dan animasi dikurangi. Panduan suara membacakan langkah saat pendampingan berjalan.</p></div>';
  }

  /* ------------------------------------------------------- cadangkan & pulihkan */
  var BACKUP_KEYS = ["cfg", "favs", "trips", "places", "recent", "onboarded", "guide"];
  function backupText() {
    var data = {};
    BACKUP_KEYS.forEach(function (k) {
      var v = store(k);
      if (v !== null && v !== undefined) data[k] = v;
    });
    return JSON.stringify({ app: "LumiTransport", v: 1, ts: Date.now(), data: data });
  }
  function doBackup() {
    var txt = backupText();
    if (NATIVE && NATIVE.share) {
      NATIVE.share(tl("Lumi Transport — cadangan data", "Lumi Transport — data backup") + "\n\n" + txt);
      toast("Cadangan dibagikan · simpan ke file atau catatan");
    } else {
      try { window.prompt(tl("Salin cadangan ini:", "Copy this backup:"), txt); } catch (e) { lumiLog(e); }
    }
  }
  function doRestore() {
    var ta = $("#restoreText");
    if (!ta) return;
    var raw = (ta.value || "").trim();
    var start = raw.indexOf("{");
    if (start > 0) raw = raw.slice(start);
    try {
      var o = JSON.parse(raw);
      if (!o || o.v !== 1 || !o.data) throw new Error("format");
      var n = 0;
      BACKUP_KEYS.forEach(function (k) {
        if (o.data[k] !== undefined) { store(k, o.data[k]); n++; }
      });
      renderSettings(["backup", "ok", tl("Dipulihkan: " + n + " bagian data.", "Restored: " + n + " data sections.")]);
      toast("Data dipulihkan");
    } catch (e) {
      toast("Teks cadangan tidak dikenali");
    }
  }
  function backupCardHTML() {
    return '<div class="set-card"><h3>Cadangkan &amp; pulihkan</h3>' +
      '<p>Cadangan berisi pengaturan, rute favorit, riwayat perjalanan, dan tempat tersimpan.</p>' +
      '<button class="btn-sec" id="btnBackup" type="button">Cadangkan (bagikan)</button>' +
      '<textarea id="restoreText" class="restore-box" placeholder="Tempel teks cadangan di sini, lalu ketuk Pulihkan"></textarea>' +
      '<button class="btn-sec" id="btnRestore" type="button">Pulihkan dari teks</button></div>';
  }

  /* ------------------------------------------------------- rute favorit */
  function favs() { var f = store("favs"); return Array.isArray(f) ? f : []; }
  function saveFav() {
    if (!S.from || !S.to) { toast("Isi asal dan tujuan dulu"); return; }
    var key = (S.from.name || "") + "|" + (S.to.name || "");
    var list = favs();
    if (list.some(function (f) { return f.key === key; })) { toast("Rute ini sudah ada di favorit"); return; }
    list.unshift({ key: key, from: { name: S.from.name, p: S.from.p }, to: { name: S.to.name, p: S.to.p }, ts: Date.now() });
    store("favs", list.slice(0, 20));
    toast("Rute disimpan ke favorit");
    if (!$("#sheetSettings").hidden) renderSettings(["fav", "ok", "Rute favorit disimpan."]);
    paintFavBtn();
  }
  function curFavIndex() {
    if (!S.from || !S.to) return -1;
    var key = (S.from.name || "") + "|" + (S.to.name || "");
    for (var i = 0, l = favs(); i < l.length; i++) if (l[i].key === key) return i;
    return -1;
  }
  /* Tombol bintang di hasil pencarian: sekali ketuk simpan, ketuk lagi hapus. */
  function paintFavBtn() {
    var b = $("#btnFav"); if (!b) return;
    var on = curFavIndex() >= 0;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    b.lastChild.textContent = on ? tl("Tersimpan", "Saved") : tl("Simpan", "Save");
    b.setAttribute("aria-label", on ? tl("Hapus dari favorit", "Remove from favourites") : tl("Simpan ke favorit", "Save to favourites"));
  }
  function toggleFav() {
    var i = curFavIndex();
    if (i < 0) { saveFav(); return; }
    var list = favs(); list.splice(i, 1); store("favs", list);
    toast(tl("Favorit dihapus.", "Favourite removed.")); paintFavBtn();
  }
  function useFav(i) {
    var f = favs()[i]; if (!f) return;
    S.from = { name: f.from.name, p: f.from.p };
    S.to = { name: f.to.name, p: f.to.p };
    $("#inFrom").value = S.from.name; $("#inTo").value = S.to.name;
    $("#sheetSettings").hidden = true;
    runPlan();
  }
  function delFav(i) {
    var list = favs(); list.splice(i, 1); store("favs", list);
    renderSettings(["fav", "ok", "Favorit dihapus."]);
  }
  function favCardHTML() {
    var list = favs();
    var rows = list.length ? list.map(function (f, i) {
      return '<div class="place-row"><span class="sg-ico saved">' + ICO_STAR + '</span><div class="pm"><b>' + esc(f.from.name) + " → " + esc(f.to.name) +
        "</b><span>Rute tersimpan</span></div><button class=\"use\" data-fav=\"" + i + '">Pakai</button><button data-favdel="' + i + '">Hapus</button></div>';
    }).join("") : '<p>Belum ada rute favorit. Cari rute, lalu ketuk ☆ Simpan di hasil pencarian.</p>';
    return '<div class="set-card"><h3>Rute favorit</h3>' + rows +
      '<button class="btn-sec" id="btnSaveFav" type="button">Simpan rute yang sedang aktif</button></div>';
  }

  /* ------------------------------------------------------- jembatan native */
  var httpCb = {}, httpSeq = 0;
  window.__lumiHttp = function (id, status, body) { var cb = httpCb[id]; delete httpCb[id]; if (cb) cb(status, body); };
  /* http(url, timeout, headers, raw) → Promise<JSON | {status, body}> */
  /*
   * R9: pemutus sirkuit per server pihak ketiga (OSRM, Photon, GitHub, …). Server yang 3× berturut-turut
   * gagal/timeout, atau menjawab 429 (terlalu banyak permintaan), diistirahatkan 10 menit (berlipat sampai
   * 1 jam) supaya Lumi tidak membanjiri layanan gratis dan fitur langsung memakai cadangannya (garis lurus,
   * estimasi jarak lurus, saran dari halte & tempat tersimpan saja).
   */
  var SVC = {};
  function svcHost(url) { var m = /^https?:\/\/([^/]+)/.exec(url); return m ? m[1] : ""; }
  function svcPaused(host) { var s = SVC[host]; return !!(s && s.until > Date.now()); }
  function svcResult(host, ok, status) {
    var s = SVC[host] || (SVC[host] = { fails: 0, until: 0, trips: 0 });
    if (ok) { s.fails = 0; s.trips = 0; return; }
    s.fails++;
    if (status === 429 || s.fails >= 3) {
      s.until = Date.now() + Math.min(60, 10 * Math.pow(2, s.trips)) * 60000; s.trips++; s.fails = 0;
      lumiLog(new Error("layanan " + host + " diistirahatkan (" + (status || "gagal") + ")"), "svc");
    }
  }
  window.__lumiSvc = function () { return SVC; };
  function http(url, timeoutMs, headers, raw) {
    var host = svcHost(url);
    if (svcPaused(host)) return Promise.reject(new Error("layanan " + host + " sedang diistirahatkan"));
    return httpOnce(url, timeoutMs, headers, raw).then(function (v) {
      var st = raw ? v.status : 200;
      svcResult(host, !(st === 0 || st === 429 || st >= 500), st);
      return v;
    }, function (e) {
      var st = e && e.status;
      svcResult(host, !!(st && st < 500 && st !== 429), st);   // 4xx biasa = server sehat, permintaan yang salah
      throw e;
    });
  }
  function httpOnce(url, timeoutMs, headers, raw) {
    return new Promise(function (resolve, reject) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; reject(new Error("timeout")); } }, timeoutMs || 12000);
      function fin(ok, val) { if (done) return; done = true; clearTimeout(t); ok ? resolve(val) : reject(val); }
      function handle(status, body) {
        if (raw) { fin(true, { status: status, body: body }); return; }
        if (status >= 200 && status < 300) { try { fin(true, JSON.parse(body)); } catch (e) { fin(false, e); } }
        else { var e = new Error("HTTP " + status); e.status = status; e.body = body; fin(false, e); }
      }
      if (NATIVE) {
        var id = "h" + (++httpSeq);
        httpCb[id] = handle;
        if (headers && NATIVE.httpH) NATIVE.httpH(id, url, JSON.stringify(headers)); else NATIVE.http(id, url);
      } else {
        fetch(url, { headers: headers || {} }).then(function (r) { return r.text().then(function (tx) { handle(r.status, tx); }); })
          .catch(function (e) { fin(false, e); });
      }
    });
  }
  /* Google Places/Static Maps memakai jembatan HTTP native: maps.googleapis.com tidak
   * mengirim header CORS, jadi fetch dari file:// akan ditolak. */
  if (window.LumiGoogle) LumiGoogle.bind(http);
  /* Ikuti redirect (untuk tautan pendek Google Maps), kembalikan URL akhir. */
  var resCb = {};
  window.__lumiResolved = function (id, url) { var cb = resCb[id]; delete resCb[id]; if (cb) cb(url); };
  function resolveUrl(url) {
    return new Promise(function (resolve) {
      if (NATIVE && NATIVE.resolve) {
        var id = "r" + (++httpSeq); resCb[id] = resolve; NATIVE.resolve(id, url);
        setTimeout(function () { if (resCb[id]) { delete resCb[id]; resolve(url); } }, 35000);
      } else resolve(url);
    });
  }
  var locCb = {};
  window.__lumiLocate = function (id, o) { var cb = locCb[id]; delete locCb[id]; if (cb) cb(o); };
  /* ---- GPS mati → pop-up "Aktifkan GPS" (buka pengaturan Lokasi, lanjut otomatis saat kembali) ---- */
  var gpsWait = null;
  function gpsOff() { try { return !!(NATIVE && NATIVE.gpsOn && !NATIVE.gpsOn()); } catch (e) { return false; } }
  function closeGpsAsk() { var m = $("#gpsAsk"); if (m) m.remove(); }
  function ensureGps() {
    return new Promise(function (resolve, reject) {
      if (!gpsOff()) { resolve(); return; }
      if (gpsWait) { try { gpsWait.reject(new Error(tl("GPS belum aktif", "GPS is off"))); } catch (e) { lumiLog(e); } }
      gpsWait = { resolve: resolve, reject: reject };
      closeGpsAsk();
      var m = document.createElement("div"); m.id = "gpsAsk"; m.className = "gps-ask"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
      m.innerHTML = '<div class="gps-card"><div class="gps-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>' +
        "<h3>GPS belum aktif</h3><p>Aktifkan Lokasi (GPS) di HP agar Lumi bisa menemukan posisimu untuk “Lokasi saya” dan mode pendampingan.</p>" +
        '<button class="btn-go" id="gpsOn" type="button">Aktifkan GPS</button><button class="gps-later" id="gpsLater" type="button">Nanti saja</button></div>';
      $("#app").appendChild(m);
      $("#gpsOn").addEventListener("click", function () { if (NATIVE && NATIVE.openGpsSettings) NATIVE.openGpsSettings(); });
      $("#gpsLater").addEventListener("click", function () { var w = gpsWait; gpsWait = null; closeGpsAsk(); if (w) w.reject(new Error(tl("GPS belum aktif", "GPS is off"))); });
    });
  }
  // dipanggil dari MainActivity.onResume (kembali dari pengaturan Lokasi)
  window.__lumiResume = function () {
    if (gpsWait && !gpsOff()) { var w = gpsWait; gpsWait = null; closeGpsAsk(); toast("GPS aktif"); w.resolve(); }
    reviveMaps();
  };
  /*
   * Setelah layar mati / keluar PiP: Android bisa menghapus konteks grafis (WebGL) peta dan ukuran peta sempat 0.
   * Ukur ulang semua peta, buat ulang lapisan peta yang konteksnya hilang, lalu gambar ulang pendampingan.
   */
  function glLost(m) {
    try { var g = m._lumiTiles && m._lumiTiles.getMaplibreMap && m._lumiTiles.getMaplibreMap(); if (!g) return false; var c = g.painter && g.painter.context && g.painter.context.gl; return !c || c.isContextLost(); } catch (e) { return true; }
  }
  function reviveMaps() {
    [80, 400, 1200].forEach(function (t) {
      setTimeout(function () {
        if (typeof allMaps === "undefined") return;
        allMaps.forEach(function (m) {
          try {
            if (!m.getContainer().offsetWidth) return;
            m.invalidateSize(false);
            if (glLost(m)) { m.removeLayer(m._lumiTiles); m._lumiTiles = baseLayer().addTo(m); }
            else if (m._lumiTiles && m._lumiTiles.getMaplibreMap) { var g = m._lumiTiles.getMaplibreMap(); g.resize(); g.triggerRepaint(); }
          } catch (e) { lumiLog(e); }
        });
        [GT.trip, GT.pip].forEach(function (T) { T.sig = null; });
        paintGuideMap(S.guideSt);
      }, t);
    });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) reviveMaps(); });
  function locate() {
    return ensureGps().then(locateRaw);
  }
  function locateRaw() {
    return new Promise(function (resolve, reject) {
      if (NATIVE) {
        var id = "l" + Date.now(); locCb[id] = function (o) { o.error && !o.lat ? reject(new Error(o.error)) : resolve(o); };
        NATIVE.locate(id);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); },
          function (e) { reject(new Error(tl("Izin lokasi ditolak", "Location permission denied"))); }, { enableHighAccuracy: true, timeout: 15000 });
      } else reject(new Error(tl("Lokasi tidak tersedia", "Location unavailable")));
    });
  }
  function openApp(pkg) { if (NATIVE) NATIVE.openApp(pkg); else window.open("https://play.google.com/store/apps/details?id=" + pkg); }
  function openUrl(u) { if (NATIVE) NATIVE.openUrl(u); else window.open(u); }

  /* ------------------------------------------------------- posisi bus langsung */
  /*
   * Sumber: feed MQTT publik armada Transjakarta (Transjakarta, Mikrotrans, Royaltrans,
   * Transjabodetabek) — layanan yang sama dengan yang dipakai aplikasi resmi TJ.
   * Koneksi: WebSocket native (LiveSocket.java) → protokol MQTT di live.js.
   * Bila feed tidak bisa dihubungi, Lumi menampilkan sebabnya + tombol "Buka aplikasi TJ".
   */
  var LIVE_MODES = { TJ: 1, MIKRO: 1, ROYAL: 1 };
  function liveOk(l) { return l && LIVE_MODES[l.mode] && !l.noStops; }
  function openTjApp() {
    if (NATIVE && NATIVE.openTjApp) NATIVE.openTjApp();
    else window.open("https://play.google.com/store/apps/details?id=com.transjakmobile");
  }
  function bindTjApp(root) {
    $$("[data-tjapp]", root).forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openTjApp(); });
    });
  }
  function busOf(msg, topic) {
    var lat = +msg.snap_latitude || +msg.latitude, lon = +msg.snap_longitude || +msg.longitude;
    if (!isFinite(lat) || !isFinite(lon) || !lat) return null;
    var parts = String(topic || "").split("/");
    return { key: msg.bus_body_no || parts[parts.length - 1], code: msg.route_code || parts[3], lat: lat, lon: lon,
      bearing: +msg.bearing || 0, head: msg.trip_headsign || "", pax: msg.passengers_status || "", at: Date.now(),
      color: msg.route_color && /^[0-9a-f]{6}$/i.test(msg.route_color) ? "#" + msg.route_color : null,
      stops: msg.stops || [], etaMap: msg.eta_by_parent_stop_id || null };
  }
  function nmKey(n) { return String(n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function nextStop(b) {
    for (var i = 0; i < b.stops.length; i++) if (+b.stops[i].eta > 0) return { name: b.stops[i].name, eta: +b.stops[i].eta };
    return null;
  }
  /* ETA (menit) bus ini ke halte `from`, hanya bila bus juga akan lewat `to` sesudahnya (arah benar).
     Nama halte di data rute dan di feed kadang berbeda ("Cawang Sentral" vs "Cawang"), jadi
     dicocokkan lewat nama dulu, lalu lewat koordinat halte. */
  function etaTo(b, from, to, fromP, toP) {
    var kf = nmKey(from), kt = to ? nmKey(to) : null, fi = -1, ti = -1;
    function nearest(p, start, tol) {
      var best = -1, bd = tol || 0.25;
      for (var i = start; i < b.stops.length; i++) {
        var st = b.stops[i], e = +st.eta;
        if (!isFinite(e) || !st.latitude || !st.longitude) continue;
        var d = E.hav(p, [+st.latitude, +st.longitude]);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    b.stops.forEach(function (st, i) {
      var k = nmKey(st.name), e = +st.eta;
      if (fi < 0 && isFinite(e) && k && kf && (k === kf || k.indexOf(kf) >= 0 || kf.indexOf(k) >= 0)) fi = i;
      if (kt && fi >= 0 && ti < 0 && i > fi && k && (k === kt || k.indexOf(kt) >= 0 || kt.indexOf(k) >= 0)) ti = i;
    });
    if (fi < 0 && fromP) fi = nearest(fromP, 0, 0.25);
    if (kt && ti < 0) {
      if (toP) ti = nearest(toP, fi + 1, 0.35);
      if (ti < 0) {
        // Halte tujuan tidak disebut di daftar sisa perjalanan, tetapi arah bus sudah benar.
        var hk = nmKey(b.head);
        if (hk && (hk === kt || hk.indexOf(kt) >= 0 || kt.indexOf(hk) >= 0)) ti = fi + 1;
      }
    }
    if (fi < 0 || (kt && ti < 0)) return null;
    var e2 = +b.stops[fi].eta;
    return isFinite(e2) ? e2 : null;
  }
  /*
   * Perkiraan tiba Lumi sendiri: posisi bus diproyeksikan ke urutan halte rute (searah bearing bus),
   * lalu jarak sepanjang rute sampai halte naik dibagi kecepatan rata-rata moda.
   * Hasil: { m: menit } bila bus masih akan melewati halte itu, { passed: true } bila sudah lewat,
   * atau null bila bus tidak bisa dicocokkan ke rute.
   */
  var BUS_KMH = { MIKRO: 14, ROYAL: 24, TJ: 18 };
  function brgOf(a, b) {
    var k = Math.cos(a[0] * Math.PI / 180), dx = (b[1] - a[1]) * k, dy = b[0] - a[0];
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }
  function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function routeEta(b, line, boardP) {
    if (!line || !line.dirs || !boardP) return null;
    var bp = [b.lat, b.lon], hk = nmKey(b.head), useBrg = b.bearing > 0, best = null;
    var kmh = line.mode === "TJ" ? (line.brt ? 20 : 16) : BUS_KMH[line.mode] || 16;
    line.dirs.forEach(function (d) {
      var st = d.s || []; if (st.length < 2) return;
      var bi = -1, bd = 0.3;
      for (var i = 0; i < st.length; i++) { var dd = E.hav(boardP, st[i].p); if (dd < bd) { bd = dd; bi = i; } }
      if (bi < 0) return;
      var bj = -1, bdist = 0.5;
      for (var j = 0; j < st.length - 1; j++) {
        var r = projOn(bp, st[j].p, st[j + 1].p);
        if (r.d >= bdist) continue;
        if (useBrg && angDiff(b.bearing, brgOf(st[j].p, st[j + 1].p)) > 80) continue;   // arah berlawanan
        bdist = r.d; bj = j;
      }
      if (bj < 0) return;
      var dh = nmKey(d.h), head = !!(hk && dh && (dh.indexOf(hk) >= 0 || hk.indexOf(dh) >= 0));
      var cand;
      if (bj >= bi) cand = { passed: true, head: head };
      else {
        var km = E.hav(bp, st[bj + 1].p);
        for (var k = bj + 1; k < bi; k++) km += E.hav(st[k].p, st[k + 1].p);
        cand = { m: km * 1.2 / kmh * 60 + (bi - bj - 1) * 0.3, head: head };
      }
      if (!best || (cand.head && !best.head) || (cand.head === best.head && !cand.passed && (best.passed || cand.m < best.m))) best = cand;
    });
    return best;
  }
  /* Gabungkan ETA feed dengan perkiraan Lumi. Feed dipakai bila masuk akal (ia tahu kemacetan);
     bila jauh berbeda, atau bus menurut rute sudah lewat, perkiraan Lumi yang dipakai. */
  function busEta(b, line, boardP, feed) {
    var own = routeEta(b, line, boardP);
    if (own && own.passed) return own.head || feed == null ? null : feed;
    if (!own) return feed;
    if (feed == null) return own.m;
    return Math.abs(feed - own.m) <= Math.max(4, own.m * 0.6) ? feed : own.m;
  }
  /* Geser penanda dengan halus ke posisi baru (tanpa membuat ulang). */
  function slideMarker(mk, to) {
    var a = mk.getLatLng(), from = [a.lat, a.lng], t0 = performance.now(), dur = 700;
    if (E.hav(from, to) > 0.5) { mk.setLatLng(to); return; }
    cancelAnimationFrame(mk._slide);
    mk._slide = requestAnimationFrame(function step() {
      var f = Math.min(1, (performance.now() - t0) / dur), e = f * (2 - f);
      mk.setLatLng([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]);
      if (f < 1) mk._slide = requestAnimationFrame(step);
    });
  }
  var LIVE_HEADING = { map: null };
  /* Penanda bus: lingkaran panah tepat di titik bus (yang sudah ditempelkan ke jalan oleh feed),
     kode rute di bawahnya. Ukurannya ikut zoom peta lewat --bs (lihat busScale). */
  function busIcon(b, color, stale, label) {
    return L.divIcon({ className: "lm-bus-wrap", iconSize: [0, 0], iconAnchor: [0, 0],
      html: '<div class="lm-bus2' + (stale ? " stale" : "") + '" style="--c:' + (color || b.color || "#1565D8") + '">' +
        '<i style="transform:translate(-50%,-50%) rotate(' + (b.bearing || 0) + 'deg)"><svg viewBox="0 0 10 10"><path d="M5 .6 9 9 5 7.1 1 9z" fill="currentColor"/></svg></i>' +
        "<b>" + esc(String(label || b.code || "")) + "</b></div>" });
  }
  function busScale(z) { return Math.max(0.55, Math.min(1.5, Math.pow(1.22, z - 16))); }
  function bindBusScale(map) {
    if (map._busScale) return;
    map._busScale = function () { map.getContainer().style.setProperty("--bs", busScale(map.getZoom()).toFixed(3)); };
    map.on("zoom zoomend", map._busScale);
    map._busScale();
  }
  function fmtEta(mnt) { var m = Math.round(mnt); return m <= 0 ? tl("tiba", "arriving") : "±" + m + tl(" mnt", " min"); }
  function liveStatusText(st, n) {
    return st === "connected" ? (n ? n + tl(" bus aktif", n === 1 ? " active bus" : " active buses") : "Terhubung · menunggu data bus…") : st === "connecting" ? "Menghubungkan…" :
      st === "reconnecting" ? "Menyambung ulang…" : st === "error" ? "Gagal terhubung" : "";
  }
  /* Penjelasan gagal + jalan keluar (buka aplikasi resmi TJ). */
  function liveFailHTML() {
    var why = LumiLive.lastError();
    return '<div class="live-card"><b>Belum bisa terhubung ke data armada</b><p>Lumi akan mencoba lagi otomatis.' +
      (why ? ' <span class="live-why">' + tl("Detail: ", "Details: ") + esc(why) + "</span>" : "") + "</p>" +
      '<div class="btn-row"><button class="btn-sec" data-tjapp>Buka aplikasi TJ</button></div></div>';
  }
  /* Satu "papan" bus langsung pada sebuah peta: menyimpan bus, menggambar marker, membuang data basi. */
  function LiveBoard(map, codes, colorOf, onUpdate, labelOf) {
    var buses = {}, markers = {}, layer = L.layerGroup().addTo(map), only = null;
    bindBusScale(map);
    this.buses = buses;
    var lab = function (b) { return labelOf ? labelOf(b) : b.code; };
    var shown = function (b) { return !only || LumiLive.norm(b.code) === only; };
    /* Hanya tampilkan bus satu kode (null = semua). */
    this.setFilter = function (code) {
      only = code ? LumiLive.norm(code) : null;
      Object.keys(markers).forEach(function (k) {
        var on = shown(buses[k]);
        if (on && !layer.hasLayer(markers[k])) layer.addLayer(markers[k]);
        if (!on && layer.hasLayer(markers[k])) layer.removeLayer(markers[k]);
      });
    };
    this.filter = function () { return only; };
    var stop = LumiLive.watch(codes, function (msg, topic) {
      var b = busOf(msg, topic); if (!b) return;
      buses[b.key] = b;
      var col = colorOf(b);
      if (!markers[b.key]) {
        markers[b.key] = L.marker([b.lat, b.lon], { icon: busIcon(b, col, false, lab(b)), zIndexOffset: 800 });
        if (shown(b)) markers[b.key].addTo(layer);
        markers[b.key].on("click", function () {
          var x = buses[b.key], ns = nextStop(x);
          markers[b.key].bindPopup('<div class="bus-pop"><b>' + esc(lab(x)) + " · " + esc(x.key) + "</b><br>" + tl("Menuju ", "Towards ") + esc(x.head || "-") +
            (ns ? "<br>" + tl("Berikutnya: ", "Next: ") + esc(ns.name) + " (" + fmtEta(ns.eta) + ")" : "") + (x.pax ? "<br>" + tl("Penumpang: ", "Passengers: ") + esc(x.pax) : "") + "</div>").openPopup();
        });
      } else {
        markers[b.key].setLatLng([b.lat, b.lon]); markers[b.key].setIcon(busIcon(b, col, false, lab(b)));
        var on = shown(b);
        if (on && !layer.hasLayer(markers[b.key])) layer.addLayer(markers[b.key]);
        if (!on && layer.hasLayer(markers[b.key])) layer.removeLayer(markers[b.key]);
      }
      if (onUpdate) onUpdate();
    });
    var unSt = LumiLive.onStatus(function () { if (onUpdate) onUpdate(); });
    var gc = setInterval(function () {
      var now = Date.now();
      Object.keys(buses).forEach(function (k) {
        var age = now - buses[k].at;
        if (age > 150000) { layer.removeLayer(markers[k]); delete markers[k]; delete buses[k]; }
        else if (age > 50000) markers[k].setIcon(busIcon(buses[k], colorOf(buses[k]), true, lab(buses[k])));
      });
      if (onUpdate) onUpdate();
    }, 10000);
    this.stop = function () { stop(); unSt(); clearInterval(gc); layer.remove(); if (this.onStop) this.onStop(); };
    this.count = function () { return Object.keys(buses).length; };
  }
  /* Hentikan papan saat sheet ditutup. */
  function stopWhenHidden(sheet, board) {
    var ob = new MutationObserver(function () { if (sheet.hidden) { board.stop(); ob.disconnect(); } });
    ob.observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* ---- layar "Bus di sekitarmu" */
  var liveMap, nearBoard = null;
  function openLiveNear() { openLiveAt(null, null); }
  function openLiveAt(center, title, opt) {
    opt = opt || {};
    var sheet = $("#sheetLive"); if (!sheet) return;
    var titleEl = $("#sheetLive .sheet-title");
    if (titleEl) titleEl.textContent = title || tl("Bus di sekitarmu", "Buses near you");
    sheet.hidden = false;
    $("#liveBody").innerHTML = opt.stop ? '<div class="live-card"><b>Menghubungkan ke data armada…</b></div>' :
      '<div class="live-card"><b>Mencari lokasimu…</b><p>Lumi akan menampilkan bus Transjakarta, Mikrotrans, dan Royaltrans yang melintas di sekitarmu.</p></div>';
    if (!liveMap) liveMap = makeMap($("#liveMap"));
    setTimeout(function () { liveMap.invalidateSize(); }, 60);
    var go = function (p) {
      var stop = opt.stop || null;
      if (!stop) S.myPos = p;
      liveMap.setView(p, stop ? 16 : 15);
      if (liveMap._me) liveMap._me.remove();
      if (liveMap._here) { liveMap._here.remove(); liveMap._here = null; }
      // Posisiku: titik biru + senter arah hadap (kompas), ikut bergerak saat berjalan.
      var myP = S.myPos || (stop ? null : p);
      if (myP) liveMap._me = L.marker(myP, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(liveMap);
      else liveMap._me = null;
      if (stop) liveMap._here = L.marker(p, { icon: L.divIcon({ className: "", html: '<div class="lm-stop-here"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 900 }).addTo(liveMap);
      var me0 = function () { return stop ? p : (S.myPos || p); };
      var list;
      if (stop) list = (opt.lines || []).map(function (l) { return { l: l, d: 0 }; });
      else {
        // rute bus dengan halte dalam 900 m (maks. 12 terdekat)
        var near = {};
        planner.nearby(p, 0.9).forEach(function (e) {
          var nd = planner.nodes[e[0]], l = planner.lines[nd.li];
          if (!liveOk(l)) return;
          if (!near[l.id] || near[l.id].d > e[1]) near[l.id] = { l: l, d: e[1] };
        });
        list = Object.keys(near).map(function (k) { return near[k]; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 12);
      }
      if (!list.length) { $("#liveBody").innerHTML = '<div class="live-card"><b>Tidak ada rute bus di dekatmu</b><p>Coba di dekat halte Transjakarta atau jalur Mikrotrans.</p></div>'; return; }
      var colors = {}, lineOfBus = {};
      list.forEach(function (x) { var k = LumiLive.norm(x.l.code); colors[k] = x.l.color; if (!lineOfBus[k]) lineOfBus[k] = x.l; });
      // Label di peta memakai kode yang sama dengan aplikasi (mis. JAK71, bukan JAK.71 dari feed).
      var labelOf = function (b) { var l = lineOfBus[LumiLive.norm(b.code)]; return l ? l.code : b.code; };
      if (nearBoard) nearBoard.stop();
      var render = function () {
        var st = LumiLive.state(), all = nearBoard ? Object.keys(nearBoard.buses).map(function (k) { return nearBoard.buses[k]; }) : [];
        var only = nearBoard && nearBoard.filter();
        // Jumlah bus tiap rute dalam 2 km: chip hanya menonjolkan rute yang benar-benar ada di sekitar.
        var cnt = {};
        all.forEach(function (b) { if (E.hav(me0(), [b.lat, b.lon]) <= 2) { var k = LumiLive.norm(b.code); cnt[k] = (cnt[k] || 0) + 1; } });
        var bs = all.filter(function (b) { return !only || LumiLive.norm(b.code) === only; });
        bs.forEach(function (b) {
          b.dist = E.hav(me0(), [b.lat, b.lon]);
          b.etaHere = stop ? busEta(b, lineOfBus[LumiLive.norm(b.code)], stop.p, etaTo(b, stop.n, null, stop.p)) : null;
        });
        // Untuk satu halte: bus yang akan tiba di halte ini di atas, urut waktu tiba.
        bs.sort(function (a, b) {
          if (stop && (a.etaHere != null) !== (b.etaHere != null)) return a.etaHere != null ? -1 : 1;
          if (stop && a.etaHere != null) return a.etaHere - b.etaHere;
          return a.dist - b.dist;
        });
        var used = LumiLive.bytes();
        $("#liveNearStatus").textContent = liveStatusText(st, bs.length) + (used > 50000 ? " · " + dec(used / 1048576) + " MB" : "");
        var chips = list.slice().sort(function (a, b) {
          var ca = cnt[LumiLive.norm(a.l.code)] || 0, cb = cnt[LumiLive.norm(b.l.code)] || 0;
          return (cb > 0) - (ca > 0) || a.d - b.d;
        });
        var html = '<div class="live-routes">' + chips.map(function (x) {
          var k = LumiLive.norm(x.l.code), n = cnt[k] || 0;
          return '<button type="button" class="live-chip' + (only === k ? " on" : "") + (n ? "" : " none") + '" data-code="' + esc(k) + '" aria-pressed="' + (only === k) + '">' +
            badge(x.l, "sm") + (n ? '<i class="tnum">' + n + "</i>" : "") + "</button>";
        }).join("") + "</div>" +
          (only ? '<p class="live-filter">' + tl("Hanya menampilkan ", "Showing only ") + "<b>" + esc(lineOfBus[only] ? lineOfBus[only].code : only) + "</b> · " +
            '<button type="button" class="link" data-code="">' + tl("Tampilkan semua", "Show all") + "</button></p>" : "");
        if (!bs.length) html += st === "error" || st === "reconnecting" ? liveFailHTML() :
          '<div class="live-card"><b>Menunggu posisi bus…</b><p>Data muncul begitu bus mengirim posisi (biasanya beberapa detik).</p></div>';
        html += '<ul class="bus-list">' + bs.slice(0, 30).map(function (b) {
          var ns = nextStop(b);
          return '<li data-bus="' + esc(b.key) + '"><span class="badge sm" style="background:' + (colors[LumiLive.norm(b.code)] || "#1565D8") + ';color:#fff">' + esc(labelOf(b)) + "</span>" +
            "<div><b>" + tl("Menuju ", "Towards ") + esc(b.head || "-") + "</b><span>" +
            (b.etaHere != null ? tl("Tiba di halte ini ", "Reaches this stop ") + fmtEta(b.etaHere) : ns ? tl("Berikutnya ", "Next ") + esc(ns.name) + " · " + fmtEta(ns.eta) : "Bus " + esc(b.key)) + "</span></div>" +
            '<em class="tnum">' + (b.dist < 1 ? Math.round(b.dist * 1000) + " m" : dec(b.dist) + " km") + "</em></li>";
        }).join("") + "</ul>";
        html += '<p class="disclaim">Posisi dari feed armada Transjakarta (diperbarui tiap beberapa detik). Lumi tidak berafiliasi dengan Transjakarta.</p>';
        $("#liveBody").innerHTML = tr(html);
        bindTjApp($("#liveBody"));
        $$("[data-bus]", $("#liveBody")).forEach(function (li) {
          li.addEventListener("click", function () { var b = nearBoard.buses[li.dataset.bus]; if (b) { follow = false; liveMap.setView([b.lat, b.lon], 17); } });
        });
        // Ketuk kode: hanya bus kode itu yang tampil; ketuk lagi untuk semua.
        $$("[data-code]", $("#liveBody")).forEach(function (c) {
          c.addEventListener("click", function () {
            var k = c.dataset.code || null;
            nearBoard.setFilter(nearBoard.filter() === k ? null : k);
            render();
            var vis = Object.keys(nearBoard.buses).map(function (q) { return nearBoard.buses[q]; })
              .filter(function (b) { return nearBoard.filter() && LumiLive.norm(b.code) === nearBoard.filter() && E.hav(me0(), [b.lat, b.lon]) <= 3; });
            if (vis.length) {
              follow = false;
              try { liveMap.fitBounds(L.latLngBounds(vis.map(function (b) { return [b.lat, b.lon]; }).concat([me0()])), { padding: [40, 40], maxZoom: 16 }); } catch (e) { lumiLog(e); }
            }
          });
        });
      };
      // B8: panel digambar ulang paling sering tiap 1,5 dtk, dan tidak saat jari sedang menyentuh panel
      // (ketukan tidak hilang karena tombolnya diganti di tengah sentuhan).
      var rT = null, body = $("#liveBody");
      if (!body._touchHook) {
        body._touchHook = true;
        body.addEventListener("pointerdown", function () { body._touching = true; }, true);
        ["pointerup", "pointercancel"].forEach(function (ev) {
          body.addEventListener(ev, function () { body._touching = false; body._touchEnd = Date.now(); }, true);
        });
        body.addEventListener("scroll", function () { body._touchEnd = Date.now(); }, true);
      }
      var schedule = function () {
        if (rT) return;
        rT = setTimeout(function tick() {
          if (body._touching || Date.now() - (body._touchEnd || 0) < 600) { rT = setTimeout(tick, 400); return; }
          rT = null; render();
        }, 1500);
      };
      nearBoard = new LiveBoard(liveMap, list.map(function (x) { return x.l.code; }), function (b) { return colors[LumiLive.norm(b.code)]; },
        schedule, labelOf);
      // Ikuti posisiku selama layar ini terbuka: GPS tiap ±4 dtk + kompas untuk senter.
      var follow = !stop;
      if (!liveMap._dragHook) { liveMap._dragHook = true; liveMap.on("dragstart", function () { if (liveMap._unfollow) liveMap._unfollow(); }); }
      liveMap._unfollow = function () { follow = false; };
      var alive = true, gT = null;
      var moveMe = function (np) {
        if (!alive) return;
        S.myPos = np;
        if (!liveMap._me) liveMap._me = L.marker(np, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(liveMap);
        else slideMarker(liveMap._me, np);
        if (follow) liveMap.panTo(np, { animate: true, duration: 0.8 });
      };
      var native = !!(NATIVE && NATIVE.watchPos);
      if (native) {
        // Android: GPS terus-menerus (tiap ±2 dtk), bukan meminta posisi berulang yang bisa kembali dari cache.
        window.__lumiPos = function (lat, lon, acc) { if (acc < 0 || acc <= 80) moveMe([lat, lon]); };
        NATIVE.watchPos(true);
      } else {
        var track = function () {
          if (!alive) return;
          locate().then(function (o) { moveMe([o.lat, o.lon]); }).catch(function () { })
            .then(function () { if (alive) gT = setTimeout(track, 4000); });
        };
        gT = setTimeout(track, 1500);
      }
      compass(true); LIVE_HEADING.map = liveMap;
      nearBoard.onStop = function () {
        alive = false; clearTimeout(gT); LIVE_HEADING.map = null;
        if (native) { try { NATIVE.watchPos(false); } catch (e) { lumiLog(e); } window.__lumiPos = null; }
        if (!S.guide) compass(false);
      };
      stopWhenHidden(sheet, nearBoard);
      render();
    };
    if (center) { go(center); return; }
    if (S.myPos) go(S.myPos);
    locate().then(function (o) { if (!S.myPos || E.hav(S.myPos, [o.lat, o.lon]) > 0.15) go([o.lat, o.lon]); })
      .catch(function (e) { if (!S.myPos) $("#liveBody").innerHTML = '<div class="live-card"><b>' + tl("Lokasi tidak tersedia", "Location unavailable") + "</b><p>" + esc(e.message || tl("Aktifkan GPS lalu coba lagi.", "Turn on GPS and try again.")) + "</p></div>"; });
  }
  if ($("#btnLiveNear")) $("#btnLiveNear").addEventListener("click", openLiveNear);

  /* ------------------------------------------------------- info perubahan rute */
  function getChanges() {
    var raw = null;
    try { raw = NATIVE && NATIVE.getChanges ? NATIVE.getChanges() : localStorage.getItem("lumi:changesTest"); } catch (e) { lumiLog(e); }
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function fmtDate(d) {
    var m = String(d || "").match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return d || "";
    var bln = (EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"])[+m[2] - 1];
    return +m[3] + " " + bln + " " + m[1] + (m[4] ? ", " + m[4] + "." + m[5] : "");
  }
  // Daftar perubahan: tiap baris bisa diketuk untuk melihat "Sebelum / Sesudah".
  var CHG_REF = [];
  function changeRow(x, date) {
    var KL = { add: ["add", "Baru"], del: ["del", "Dihapus"], chg: ["", "Berubah"] };
    var k = KL[x.k] || KL.chg, ref = CHG_REF.push({ x: x, date: date }) - 1;
    var l = lineByCode(x.code);
    return '<li class="chg-row" data-chg="' + ref + '"><span class="chg-k ' + k[0] + '">' + k[1] + "</span><div>" + (l ? badge(l, "xs") + " " : "<b>" + esc(x.code) + "</b> ") +
      esc(x.name || "") + '<br><span style="color:var(--muted)">' + esc(I18.diff ? I18.diff(x.text) : x.text) + "</span>" +
      '<div class="chg-acts"><button class="st-toggle" data-chgref="' + ref + '">Sebelum &amp; sesudah</button>' +
      (l ? '<button class="st-toggle" data-chgline="' + l.id + '">Lihat rute</button>' : "") + "</div></div></li>";
  }
  function changeItems(items, max, date) {
    var html = '<ul class="chg-list">' + items.slice(0, max).map(function (x) { return changeRow(x, date); }).join("");
    if (items.length > max) {
      var ref = CHG_REF.push({ more: items.slice(max), date: date }) - 1;
      html += '<li class="chg-more-li"><button class="chg-more" data-chgmore="' + ref + '">' + tl("Tampilkan " + (items.length - max) + " perubahan lainnya", "Show " + (items.length - max) + " more changes") + "</button></li>";
    }
    return html + "</ul>";
  }
  function lineByCode(code) {
    var n = function (c) { return String(c).replace(/[.\s-]/g, "").toUpperCase(); };
    var l = planner.searchLines(code)[0];
    return l && n(l.code) === n(code) ? l : null;
  }
  function bindChangeLinks(root) {
    $$("[data-chgline]", root).forEach(function (b) {
      if (b._b) return; b._b = 1;
      b.addEventListener("click", function (e) { e.stopPropagation(); openLine(planner.byId[b.dataset.chgline], 0); });
    });
    $$("[data-chgref]", root).forEach(function (b) {
      if (b._b) return; b._b = 1;
      b.addEventListener("click", function (e) { e.stopPropagation(); openChange(CHG_REF[+b.dataset.chgref]); });
    });
    $$(".chg-row", root).forEach(function (li) {
      if (li._b) return; li._b = 1;
      li.addEventListener("click", function () { openChange(CHG_REF[+li.dataset.chg]); });
    });
    $$("[data-chgmore]", root).forEach(function (b) {
      if (b._b) return; b._b = 1;
      b.addEventListener("click", function () {
        var r = CHG_REF[+b.dataset.chgmore], li = b.closest("li"), ul = li.parentNode;
        li.remove();
        ul.insertAdjacentHTML("beforeend", r.more.map(function (x) { return changeRow(x, r.date); }).join(""));
        bindChangeLinks(ul);
      });
    });
  }

  /* ---- layar "Sebelum / Sesudah" satu perubahan rute ---- */
  // Gabungkan urutan halte lama & baru (LCS): halte tetap, halte baru (+), halte yang tidak dilewati lagi (−).
  function mergeStops(a, b) {
    a = a || []; b = b || [];
    var n = a.length, m = b.length, L2 = [];
    for (var i = 0; i <= n; i++) { L2.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L2[i][j] = a[i] === b[j] ? L2[i + 1][j + 1] + 1 : Math.max(L2[i + 1][j], L2[i][j + 1]);
    var out = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push(["=", a[i]]); i++; j++; }
      else if (L2[i + 1][j] >= L2[i][j + 1]) out.push(["-", a[i++]]);
      else out.push(["+", b[j++]]);
    }
    while (i < n) out.push(["-", a[i++]]);
    while (j < m) out.push(["+", b[j++]]);
    return out;
  }
  // Teks lama "Halte baru: A, B dll. (5)" → ["A","B"] (untuk perubahan yang tercatat sebelum detail disimpan).
  function parseList(text, label) {
    // Nama halte bisa memuat titik ("Sbr. Jln. …"), jadi potong hanya di awal bagian berikutnya.
    var re = new RegExp(label + ": (.*?)(?=\\. (?:Nama trayek|Halte baru|Tidak lagi lewat|Urutan halte|Pola perjalanan)|$)");
    var m = String(text || "").match(re);
    if (!m) return { list: [], total: 0 };
    var body = m[1].replace(/\.$/, ""), tot = body.match(/ dll\. \((\d+)\)$/);
    var list = body.replace(/ dll\. \(\d+\)$/, "").split(", ").filter(Boolean);
    return { list: list, total: tot ? +tot[1] : list.length };
  }
  function openChange(ref) {
    if (!ref || !ref.x) return;
    var x = ref.x, l = lineByCode(x.code), det = null;
    try { var raw = NATIVE && NATIVE.getChangeDetail ? NATIVE.getChangeDetail(ref.date, x.code) : null; det = raw ? JSON.parse(raw) : null; } catch (e) { det = null; }
    var sheet = $("#sheetChg");
    if (!sheet) {
      sheet = document.createElement("div"); sheet.className = "sheet"; sheet.id = "sheetChg"; sheet.hidden = true;
      sheet.innerHTML = '<div class="sheet-bar"><button class="back" data-close aria-label="Kembali"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="sheet-title">Perubahan rute</div></div><div class="sheet-body chg-body" id="chgBody"></div>';
      $("#app").appendChild(sheet);
      $("[data-close]", sheet).addEventListener("click", function () { sheet.hidden = true; });
    }
    var KL = { add: "Rute baru", del: "Rute dihapus", chg: "Rute berubah" };
    var pa = parseList(x.text, "Halte baru"), pr = parseList(x.text, "Tidak lagi lewat");
    var added = x.add || pa.list, removed = x.rm || pr.list, nAdd = x.add ? x.add.length : pa.total, nRm = x.rm ? x.rm.length : pr.total;
    var html = '<div class="chg-head">' + (l ? badge(l) : "<b>" + esc(x.code) + "</b>") + "<div><b>" + esc(x.name || x.code) + "</b><span>" + T(KL[x.k] || KL.chg) + " · " + esc(fmtDate(ref.date)) + "</span></div></div>";
    if (x.on) html += '<div class="chg-name"><span>Nama trayek</span><s>' + esc(x.on) + "</s><b>" + esc(x.name) + "</b></div>";
    var sum = [];
    if (nAdd) sum.push('<span class="cs add">+' + nAdd + tl(" halte baru", nAdd === 1 ? " new stop" : " new stops") + "</span>");
    if (nRm) sum.push('<span class="cs del">−' + nRm + tl(" halte tidak dilewati", nRm === 1 ? " stop no longer served" : " stops no longer served") + "</span>");
    if (/Urutan halte berubah/.test(x.text)) sum.push('<span class="cs">Urutan halte berubah</span>');
    if (/Pola perjalanan/.test(x.text)) sum.push('<span class="cs">' + esc(T(x.text)) + "</span>");
    if (sum.length) html += '<div class="chg-sum">' + sum.join("") + "</div>";
    function dirTitle(list) { return list && list.length ? tl("Arah ", "Towards ") + list[list.length - 1] : tl("Arah", "Direction"); }
    if (det && (Object.keys(det.b || {}).length || Object.keys(det.a || {}).length)) {
      html += '<div class="chg-tabs" role="tablist"><button data-v="m" class="is-on">Perbandingan</button><button data-v="b">Sebelum</button><button data-v="a">Sesudah</button></div>' +
        '<div class="chg-legend"><span><i class="lg add"></i>Halte baru</span><span><i class="lg del"></i>Tidak dilewati lagi</span><span><i class="lg"></i>Tetap</span></div>';
      var keys = []; Object.keys(det.b || {}).concat(Object.keys(det.a || {})).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
      keys.forEach(function (k) {
        var b = (det.b || {})[k], a = (det.a || {})[k], mg = mergeStops(b, a);
        var nb = mg.filter(function (r) { return r[0] !== "+"; }).length, na = mg.filter(function (r) { return r[0] !== "-"; }).length;
        html += '<div class="chg-dir"><div class="chg-dir-h">' + esc(dirTitle(a && a.length ? a : b)) + '<small>' + (b ? nb + " → " : "") + stopWord(a ? na : 0) + "</small></div><ol class=\"chg-stops\">" +
          mg.map(function (r) { return '<li class="' + (r[0] === "+" ? "add" : r[0] === "-" ? "del" : "same") + '"><i></i><span>' + esc(r[1]) + "</span>" + (r[0] === "+" ? "<em>baru</em>" : r[0] === "-" ? "<em>dihapus</em>" : "") + "</li>"; }).join("") + "</ol></div>";
      });
    } else {
      // Perubahan lama: urutan halte sebelumnya tidak tersimpan. Tampilkan rute sekarang + daftar yang berubah.
      html += '<p class="chg-note">Urutan halte sebelum perubahan ini belum tersimpan (tercatat sebelum fitur ini ada). Di bawah: halte yang berubah dan rute saat ini.</p>';
      if (removed.length) html += '<div class="chg-dir"><div class="chg-dir-h">Tidak dilewati lagi</div><ol class="chg-stops">' + removed.map(function (n) { return '<li class="del"><i></i><span>' + esc(n) + "</span><em>dihapus</em></li>"; }).join("") + "</ol>" +
        (nRm > removed.length ? '<p class="chg-note">' + tl("…dan " + (nRm - removed.length) + " halte lain.", "…and " + (nRm - removed.length) + " more stops.") + "</p>" : "") + "</div>";
      if (l) l.dirs.slice(0, 2).forEach(function (d) {
        var names = d.s.map(function (q) { return q.n; });
        html += '<div class="chg-dir"><div class="chg-dir-h">' + tl("Sekarang · ", "Now · ") + esc(dirTitle(names)) + "<small>" + stopWord(names.length) + '</small></div><ol class="chg-stops">' +
          names.map(function (n) { var nw = added.indexOf(n) >= 0; return '<li class="' + (nw ? "add" : "same") + '"><i></i><span>' + esc(n) + "</span>" + (nw ? "<em>baru</em>" : "") + "</li>"; }).join("") + "</ol></div>";
      });
    }
    if (l) html += '<div class="btn-row"><button class="btn-sec" id="chgOpenLine">' + tl("Lihat rute " + esc(l.code) + " di peta", "View route " + esc(l.code) + " on the map") + "</button></div>";
    var body = $("#chgBody"); body.innerHTML = tr(html); body.scrollTop = 0;
    $$(".chg-tabs button", body).forEach(function (t) {
      t.addEventListener("click", function () {
        $$(".chg-tabs button", body).forEach(function (o) { o.classList.toggle("is-on", o === t); });
        body.dataset.view = t.dataset.v;
      });
    });
    body.dataset.view = "m";
    if ($("#chgOpenLine")) $("#chgOpenLine").addEventListener("click", function () { openLine(l, 0); });
    sheet.hidden = false; raiseSheet(sheet);
  }
  /* Lembar yang baru dibuka selalu di paling atas (mis. Info rute dari Pengaturan). */
  function raiseSheet(el) { if (el && el.parentNode && el.parentNode.lastElementChild !== el) el.parentNode.appendChild(el); }
  function renderChangesCard() {
    var el = $("#changesBanner");
    if (!el) { el = document.createElement("div"); el.id = "changesBanner"; $("#gtfsBanner").parentNode.insertBefore(el, $("#gtfsBanner").nextSibling); }
    var c = getChanges();
    if (!c || !c.unseen || !c.list || !c.list.length) { el.innerHTML = ""; return; }
    var e = c.list[0];
    el.innerHTML = '<div class="chg-card"><b>' + e.items.length + tl(" rute Transjakarta berubah", e.items.length === 1 ? " Transjakarta route changed" : " Transjakarta routes changed") + "</b><p>" +
      tl("Hasil pengecekan data resmi " + esc(fmtDate(e.date)) + ". Lumi sudah memakai rute terbaru.", "From the official data check on " + esc(fmtDate(e.date)) + ". Lumi is already using the latest routes.") + "</p>" +
      changeItems(e.items, 5, e.date) + '<div class="chg-actions"><button class="btn-sec" id="chgAll">Semua perubahan</button><button class="btn-sec" id="chgOk">Oke, mengerti</button></div></div>';
    bindChangeLinks(el);
    $("#chgOk").addEventListener("click", function () { try { NATIVE && NATIVE.markChangesSeen && NATIVE.markChangesSeen(); } catch (x) { lumiLog(x); } el.innerHTML = ""; });
    $("#chgAll").addEventListener("click", function () { openSettings(); setTimeout(function () { var h = $("#chgHistory"); if (h) h.scrollIntoView(); }, 50); });
  }
  function changesHistoryHTML() {
    var c = getChanges();
    var html = '<div class="set-card" id="chgHistory"><h3>' + tl("Perubahan rute", "Route changes") + "</h3><p>" +
      tl("Lumi memeriksa data resmi Transjakarta secara berkala (otomatis, butuh internet) dan memberi notifikasi bila ada rute yang berubah.",
        "Lumi checks the official Transjakarta data regularly (automatically, needs internet) and notifies you when a route changes.") +
      (c && c.lastDate ? tl(" Terakhir diperiksa: ", " Last checked: ") + esc(fmtDate(c.lastDate)) + "." : "") + "</p>";
    if (!c || !c.list || !c.list.length) return html + '<p>Belum ada perubahan tercatat sejak data pertama diunduh.</p></div>';
    c.list.slice(0, 8).forEach(function (e) {
      html += '<div class="sub-h">' + esc(fmtDate(e.date)) + " · " + e.items.length + tl(" perubahan", e.items.length === 1 ? " change" : " changes") + "</div>" + changeItems(e.items, 12, e.date);
    });
    return html + "</div>";
  }

  /* ------------------------------------------------------- mode pendampingan (GPS) */
  var ICO_NAV = '<svg viewBox="0 0 24 24"><path d="M12 2.5 4.5 20.5 12 16.5l7.5 4z" fill="currentColor"/></svg>';
  function shortLine(l) {
    if (l.mode === "TJ") return "TJ " + l.code;
    if (l.mode === "MIKRO" || l.mode === "ROYAL") return l.code;
    return MODES[l.mode].label + (l.code && l.code !== "M" ? " " + l.code : "");
  }
  function guideSpec(it) {
    var rows = [], leg = 0;
    function clean(x) { return String(x == null ? "" : x).replace(/[\t\n]/g, " "); }
    it.legs.forEach(function (l) {
      if (l.type !== "ride") return;
      l.stops.forEach(function (st, k) {
        var kind = k === 0 ? "B" : k === l.stops.length - 1 ? "A" : "S";
        rows.push([kind, leg, st.p[0], st.p[1], clean(st.n), clean(shortLine(l.line)), clean(l.headsign), RAIL[l.line.mode] ? 1 : 0].join("\t"));
      });
      leg++;
    });
    rows.push(["D", leg, S.to.p[0], S.to.p[1], clean(S.to.name), "", "", 0].join("\t"));
    return rows.join("\n");
  }
  function startGuide(it) {
    if (!NATIVE || !NATIVE.startGuide) { toast("Mode pendampingan hanya tersedia di aplikasi Android"); return; }
    ensureGps().then(function () { startGuideNow(it); }, function (e) { toast(e.message || tl("GPS belum aktif", "GPS is off")); });
  }
  function startGuideNow(it) {
    var spec = guideSpec(it);
    S.guide = { it: it, title: S.from.name + " → " + S.to.name, names: spec.split("\n").map(function (r) { return r.split("\t")[4]; }) };
    store("guide", { title: S.guide.title, names: S.guide.names });
    NATIVE.startGuide(spec, "Lumi · " + S.guide.title);
    recordTrip(it);
    GT.trip.fitted = false; GT.trip.zoomed = false; GT.trip.follow = true; compass(true);
    renderGuide({ phase: "walk", next: 0, cursor: -1, title: tl("Mencari posisi GPS…", "Finding GPS position…"), text: tl("Kamu akan diberi tahu sebelum harus turun.", "You'll be told before you need to get off."), stopsLeft: -1, metersLeft: -1 });
    if ($("#btnGuide")) $("#btnGuide").innerHTML = ICO_NAV + "Pendampingan sedang berjalan";
  }
  function stopGuide() {
    try { NATIVE && NATIVE.stopGuide && NATIVE.stopGuide(); } catch (e) { lumiLog(e); }
    try { NATIVE && NATIVE.stopSpeak && NATIVE.stopSpeak(); } catch (e) { lumiLog(e); }
    S.guide = null; store("guide", null);
    dropPipMap();
    var g = $("#guide"); if (g) g.remove();
    $("#app").classList.remove("guiding");
    S.guideSt = null; compass(false); if ($("#btnRecenter")) recenterBtn(false);
    [GT.trip, GT.pip].forEach(function (T) { if (T.layer) { T.layer.remove(); T.layer = null; } if (T.me) T.me.remove(); T.me = null; T.pos = null; T.anim = null; T.sig = null; });
    if (tripMap && tripLayer && !tripMap.hasLayer(tripLayer)) tripLayer.addTo(tripMap);
    $$(".st-body.is-now").forEach(function (b) { b.classList.remove("is-now"); });
  }
  var alertTimer = null;
  /*
   * Peta saat pendampingan: hanya sisa perjalanan yang digambar. Garis & titik halte yang sudah dilewati
   * hilang seiring perjalanan, dan langkah pertama selalu dimulai dari posisimu sekarang (bukan titik asal
   * rencana), mis. rencana A→B tapi kamu sedang di C: garis jalan kaki C → halte naik.
   */
  // Dua tempat menggambar: peta detail perjalanan, dan peta kecil di kartu pendampingan (mode PiP).
  var GT = { trip: { layer: null, fitted: false, follow: true }, pip: { map: null, layer: null } };
  /* Sudut kompas dibuat "bersambung" (359° → 1° = +2°, bukan −358°) agar senter tidak memutar jauh. */
  function unwrapHeading(deg) {
    if (S.hU == null) S.hU = deg;
    else S.hU += ((deg - S.hU) % 360 + 540) % 360 - 180;
    return S.hU;
  }
  /* Tombol "pusatkan" di peta perjalanan: muncul saat peta digeser sendiri selama pendampingan. */
  function recenterBtn(show) {
    var b = $("#btnRecenter");
    if (!b) {
      b = document.createElement("button"); b.id = "btnRecenter"; b.className = "map-recenter"; b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.5 4.5 20.5 12 16.5l7.5 4z" fill="currentColor"/></svg>Pusatkan';
      $("#tripMap").appendChild(b);
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener("click", function () {
        GT.trip.follow = true; recenterBtn(false);
        var st = S.guideSt || {}, me = st.lat ? [st.lat, st.lon] : S.myPos;
        if (me && tripMap) { GT.trip.prog = true; tripMap.setView(me, Math.max(tripMap.getZoom(), 17)); GT.trip.prog = false; }
      });
    }
    b.hidden = !show;
  }
  function hookTripMapFollow() {
    if (!tripMap || tripMap._lumiFollowHook) return;
    tripMap._lumiFollowHook = true;
    tripMap.on("dragstart", function () {
      if (!S.guide || S.openTrip !== S.guide.it) return;
      GT.trip.follow = false; recenterBtn(true);
    });
  }
  function paintGuideMap(st) {
    S.guideSt = st || S.guideSt;
    if (tripMap && S.guide && S.guide.it && S.openTrip === S.guide.it) {
      if (tripLayer && tripMap.hasLayer(tripLayer)) tripMap.removeLayer(tripLayer);
      drawGuide(tripMap, GT.trip, false);
    }
    if (document.documentElement.classList.contains("pip") && GT.pip.map) drawGuide(GT.pip.map, GT.pip, true);
  }
  /* Ikon posisiku: titik biru + "senter" (kerucut arah hadap HP dari kompas). */
  function meIcon() {
    var h = S.heading == null ? null : S.hU;
    return L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9],
      html: '<div class="lm-mew">' + (h == null ? "" : '<i class="lm-beam" style="transform:rotate(' + Math.round(h) + 'deg)"></i>') + '<div class="lm-me"></div></div>' });
  }
  /*
   * Rute jalan kaki lewat jalan sebenarnya (OSRM pejalan kaki, routing.openstreetmap.de), digambar sebagai
   * titik-titik biru seperti Google Maps. Bila tidak ada jawaban / rutenya memutar tidak wajar → garis lurus.
   */
  var FOOT = {}, LIVEW = null;
  /*
   * Dua sumber rute, dipilih yang paling masuk akal:
   *  - pejalan kaki (routing.openstreetmap.de/routed-foot) — gang & jalan setapak;
   *  - jalan raya (router.project-osrm.org) — di data OSM, jalan besar seperti Jl. Raya Bogor sering tidak
   *    termasuk jaringan pejalan kaki, sehingga rute kaki berakhir di ujung gang di belakang halte.
   * Skor = panjang rute + jarak dari posisiku ke awal rute + 4 × jarak "terpotong" dari ujung rute ke halte
   * (bagian lurus menembus bangunan sangat tidak disukai).
   */
  var FOOT_SRC = [
    "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
    "https://router.project-osrm.org/route/v1/driving/"
  ];
  function footFetch(a, b, done) {
    var q = a[1] + "," + a[0] + ";" + b[1] + "," + b[0] + "?overview=full&geometries=geojson";
    var straight = E.hav(a, b) * 1000, left = FOOT_SRC.length, best = null;
    FOOT_SRC.forEach(function (base) {
      http(base + q, 9000).then(function (j) {
        var r = j && j.routes && j.routes[0], w = j && j.waypoints;
        // Rute memutar yang panjang tetap dipakai (mis. harus lewat simpang susun karena tidak ada jembatan
        // penyeberangan di atas tol): itu jauh lebih benar daripada garis lurus menembus tol/bangunan.
        if (!r || !r.geometry || r.distance > Math.max(straight * 8, straight + 3000)) return;
        var g0 = w && w[0] ? w[0].distance : 0, g1 = w && w[1] ? w[1].distance : 0;
        var score = r.distance + g0 + 4 * g1;
        if (!best || score < best.score) best = { score: score, pts: r.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }) };
      }).catch(function () { }).then(function () { if (--left === 0) done(best ? best.pts : null); });
    });
  }
  /* Ruas jalan kaki tetap (pindah antarhalte, halte → tujuan): diambil sekali lalu disimpan. */
  function footPath(a, b, cb) {
    var k = a[0].toFixed(5) + "," + a[1].toFixed(5) + ";" + b[0].toFixed(5) + "," + b[1].toFixed(5), c = FOOT[k];
    if (c) { if (cb) { if (c.pts) cb(c.pts); else (c.cbs = c.cbs || []).push(cb); } return c.pts; }
    FOOT[k] = { pts: null, cbs: cb ? [cb] : [] };
    footFetch(a, b, function (pts) {
      if (!pts) return;
      FOOT[k].pts = pts; FOOTVER++; paintGuideMap(S.guideSt);
      (FOOT[k].cbs || []).forEach(function (f) { try { f(pts); } catch (e) { lumiLog(e); } }); FOOT[k].cbs = [];
    });
    return null;
  }
  /* Dua rute jalan kaki praktis sama (ujung & panjang hampir sama): tidak perlu digambar ulang. */
  function samePath(a, b) {
    if (!a || !b) return false;
    return Math.abs(pathKm(a) - pathKm(b)) < 0.02 && E.hav(a[a.length - 1], b[b.length - 1]) < 0.01 && E.hav(a[0], b[0]) < 0.04;
  }
  function pathKm(line) { var d = 0; for (var i = 1; i < line.length; i++) d += E.hav(line[i - 1], line[i]); return d; }
  /* Sisa jarak jalan kaki menyusuri rute (bukan garis lurus): dari titik rute terdekat ke posisiku sampai tujuan. */
  function remainingWalkKm(me, pts, b) {
    if (!me || !pts || pts.length < 2) return null;
    var bi = 0, bd = 1e9;
    for (var i = 0; i < pts.length; i++) { var d = E.hav(me, pts[i]); if (d < bd) { bd = d; bi = i; } }
    return bd + pathKm(pts.slice(bi)) + E.hav(pts[pts.length - 1], b);
  }
  /* Ruas dari posisiku ke halte berikutnya: diperbarui bila sudah bergeser >35 m (paling cepat tiap 12 dtk). */
  function liveFootPath(me, tgt) {
    var tk = tgt[0].toFixed(5) + "," + tgt[1].toFixed(5), now = Date.now();
    if (LIVEW && LIVEW.tk === tk && (E.hav(me, LIVEW.from) < 0.035 || LIVEW.busy || now - LIVEW.at < 12000)) return LIVEW.pts;
    var keep = LIVEW && LIVEW.tk === tk ? LIVEW.pts : null, ver = LIVEW && LIVEW.tk === tk ? LIVEW.ver : 0;
    LIVEW = { tk: tk, from: me, at: now, pts: keep, busy: true, ver: ver };
    var mine = LIVEW;
    footFetch(me, tgt, function (pts) {
      mine.busy = false;
      if (!pts || LIVEW !== mine || samePath(mine.pts, pts)) return;
      mine.pts = pts; mine.ver++; paintGuideMap(S.guideSt);
    });
    return keep;
  }
  /* Garis jalan kaki. Bila "dyn", titik awalnya (posisiku) diperbarui tiap frame tanpa menggambar ulang. */
  function drawWalk(T, a, b, live, dyn) {
    if (!a || !b) return;
    if (E.hav(a, b) < 0.015) return;
    var pts = live ? liveFootPath(a, b) : footPath(a, b);
    var rest = pts && pts.length > 1 ? pts.concat([b]) : [b];
    var path = pts && pts.length > 1 ? pts.concat([b]) : [a, b];
    // Pola titik SVG dihitung dari awal garis. Garis disusun terbalik (tujuan → posisiku) agar titik
    // menempel di jalan dan hanya ujung di posisiku yang berubah saat berjalan.
    var ll = [a].concat(rest).reverse();
    var w = L.polyline(ll, { color: "#fff", weight: 9, opacity: .85, dashArray: "0.1 12", lineCap: "round" }).addTo(T.layer);
    var c = L.polyline(ll, { color: "#1A73E8", weight: 6, opacity: 1, dashArray: "0.1 12", lineCap: "round" }).addTo(T.layer);
    if (dyn) T.dyn.push({ lines: [w, c], path: path, rev: true });
  }
  var FOOTVER = 0;
  /*
   * Peta pendampingan, dibuat mulus seperti Google Maps:
   *  - garis/halte (bagian "statis") hanya digambar ulang bila ada yang berubah (halte tercapai, fase, rute jalan kaki);
   *  - titik posisiku TIDAK dibuat ulang: ia meluncur halus dari posisi lama ke posisi GPS baru (animasi per frame),
   *    garis yang berawal dari posisiku ikut bergeser, dan peta mengikuti titik itu frame demi frame.
   */
  function drawGuide(map, T, follow) {
    var st = S.guideSt || {};
    var target = st.lat ? [st.lat, st.lon] : S.myPos || null;
    var it = S.guide && S.guide.it;
    var rides = it ? it.legs.filter(function (l) { return l.type === "ride"; }) : [];
    var onBusNow = st.phase === "ride";
    var sig = [it ? 1 : 0, target ? 1 : 0, st.cursor, st.next, st.phase, LIVEW && LIVEW.pts ? LIVEW.tk + "#" + LIVEW.ver : "-", FOOTVER,
      follow ? "p" : "t"].join("|");
    if (sig !== T.sig || !T.layer || !map.hasLayer(T.layer)) {
      T.sig = sig;
      var oldLayer = T.layer;
      T.layer = L.featureGroup().addTo(map);
      T.dyn = [];
      var me = T.pos || target;
      var walk = function (a, b, live) { drawWalk(T, a, b, live, live); };
      if (rides.length) {
        var off = [], n = 0;
        rides.forEach(function (l) { off.push(n); n += l.stops.length; });
        var dIdx = n, cur = st.cursor == null ? -1 : st.cursor, nxt = st.next == null ? 0 : st.next, phase = st.phase || "walk";
        var legOf = function (i) { for (var q = rides.length - 1; q >= 0; q--) if (i >= off[q]) return q; return 0; };
        var riding = (phase === "ride" || phase === "wait") && cur >= 0 && cur < dIdx;
        var startLeg = rides.length, startK = 0;
        if (phase === "done") startLeg = rides.length;
        else if (riding) { startLeg = legOf(cur); startK = cur - off[startLeg]; }
        else {
          if (nxt < dIdx) { startLeg = legOf(nxt); startK = 0; }
          walk(me, startLeg < rides.length ? rides[startLeg].stops[0].p : S.to.p, true);
        }
        // Menunggu di halte naik tapi masih agak jauh darinya: tetap tunjukkan jalan ke halte.
        if (phase === "wait" && riding && me) walk(me, rides[startLeg].stops[startK].p, true);
        for (var li = startLeg; li < rides.length; li++) {
          var l = rides[li], k0 = li === startLeg ? startK : 0, onBus = li === startLeg && phase === "ride" && me;
          // Di dalam bus: bentuk rute dari halte terakhir yang dilewati; dipotong per frame di posisiku (moveDyn).
          var pts = shapeSlice(l.line, l.dirIndex, l.stops[k0].p, l.toP) || l.stops.slice(k0).map(function (x) { return x.p; });
          // Sambungkan garis tepat ke halte (bentuk rute berhenti di titik bentuk terdekat, bukan di halte).
          var rest = pts.concat([l.stops[l.stops.length - 1].p]);
          var head = onBus ? me : l.stops[k0].p;
          var w = L.polyline([head].concat(rest), { color: "#fff", weight: 9, opacity: .9 }).addTo(T.layer);
          var c = L.polyline([head].concat(rest), { color: lc(l), weight: 6 }).addTo(T.layer);
          if (onBus) T.dyn.push({ lines: [w, c], path: [l.stops[k0].p].concat(rest) });
          for (var k = onBus ? k0 + 1 : k0; k < l.stops.length; k++) {
            var mk = L.marker(l.stops[k].p, { icon: dotIcon("lm-stop", lc(l)) }).addTo(T.layer);
            if (!follow && (k === k0 || k === l.stops.length - 1)) mk.bindTooltip(l.stops[k].n, { className: "lm-tip", direction: "top", offset: [0, -6] });
          }
          walk(l.stops[l.stops.length - 1].p, li + 1 < rides.length ? rides[li + 1].stops[0].p : S.to.p);
        }
        if (S.to && S.to.p) L.marker(S.to.p, { icon: dotIcon("lm-dest") }).addTo(T.layer);
      }
      if (T.pos) moveDyn(T, T.pos);
      if (oldLayer) oldLayer.remove();
    }
    if (T.pos) moveDyn(T, T.pos);
    // Titik posisiku: satu penanda tetap di lapisan sendiri.
    if (target) {
      if (!T.me || !map.hasLayer(T.me)) { T.me = L.marker(T.pos || target, { icon: meIcon(), zIndexOffset: 1000, interactive: false }).addTo(map); }
    } else if (T.me) { T.me.remove(); T.me = null; }
    T.map = map; T.followMode = follow;
    if (!target) {
      if (follow) { try { map.fitBounds(T.layer.getBounds(), { padding: [16, 16], maxZoom: 17 }); } catch (e) { lumiLog(e); } }
      else if (!T.fitted) { T.fitted = true; try { map.fitBounds(T.layer.getBounds(), { padding: [30, 30], maxZoom: 17 }); } catch (e) { lumiLog(e); } }
      return;
    }
    if (!follow) hookTripMapFollow();
    // Lompatan pertama: langsung zoom ke posisiku.
    if (!T.pos || (!follow && T.follow && !T.zoomed)) {
      T.pos = target.slice();
      T.me.setLatLng(T.pos); moveDyn(T, T.pos);
      if (follow) map.setView(T.pos, Math.max(map.getZoom() || 0, 17), { animate: false });
      else if (T.follow) { T.prog = true; map.setView(T.pos, 17, { animate: false }); T.prog = false; T.zoomed = true; T.fitted = true; recenterBtn(false); }
      return;
    }
    glide(T, target);
  }
  /*
   * Garis yang berawal dari posisiku dipotong tiap frame: posisiku diproyeksikan ke rute, bagian di belakang
   * titik proyeksi dibuang. Mendekat → garis memendek, menjauh → garis (dari posisiku ke rute) memanjang.
   */
  function projOn(p, a, b) {
    var k = Math.cos(p[0] * Math.PI / 180);
    var ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    var t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    var q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { q: q, d: E.hav(p, q), t: t };
  }
  function moveDyn(T, p) {
    (T.dyn || []).forEach(function (d) {
      var path = d.path, best = null, bj = 0;
      if (path.length < 2) { var l0 = [p].concat(path); if (d.rev) l0.reverse(); d.lines.forEach(function (x) { x.setLatLngs(l0); }); return; }
      // Cari segmen terdekat; utamakan sekitar posisi sebelumnya (tidak melompat ke bagian rute lain yang kebetulan dekat).
      var from = Math.max(0, (d.j || 0) - 4), to = path.length - 1;
      for (var j = from; j < to; j++) {
        var r = projOn(p, path[j], path[j + 1]);
        if (!best || r.d < best.d - 0.002) { best = r; bj = j; }
      }
      if (d.j && best.d > 0.08) {               // jauh dari rute di sekitar posisi lama → cari di seluruh rute
        for (j = 0; j < to; j++) { var r2 = projOn(p, path[j], path[j + 1]); if (r2.d < best.d) { best = r2; bj = j; } }
      }
      d.j = bj;
      var ll = [p, best.q].concat(path.slice(bj + 1));
      if (d.rev) ll.reverse();
      d.lines.forEach(function (x) { x.setLatLngs(ll); });
    });
  }
  /* Animasi halus dari posisi tampilan sekarang ke posisi GPS terbaru (durasi ≈ jeda antar-GPS). */
  function glide(T, target) {
    var now = performance.now();
    var dur = Math.max(250, Math.min(1500, T.lastFix ? now - T.lastFix : 1000));
    T.lastFix = now;
    if (E.hav(T.pos, target) > 0.5) dur = 0;                     // lompatan jauh (GPS meloncat): langsung pindah
    T.anim = { from: T.pos.slice(), to: target.slice(), t0: now, dur: dur };
    if (!T.raf) T.raf = requestAnimationFrame(function step(ts) {
      var a = T.anim; if (!a) { T.raf = 0; return; }
      var f = a.dur ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1;
      var e = f < 1 ? f * (2 - f) : 1;                               // ease-out
      T.pos = [a.from[0] + (a.to[0] - a.from[0]) * e, a.from[1] + (a.to[1] - a.from[1]) * e];
      if (T.me) T.me.setLatLng(T.pos);
      moveDyn(T, T.pos);
      var map = T.map;
      if (map && (T.followMode || T.follow) && map.getContainer().offsetWidth) { T.prog = true; map.setView(T.pos, map.getZoom(), { animate: false }); T.prog = false; }
      if (f >= 1) { T.anim = null; T.raf = 0; return; }
      T.raf = requestAnimationFrame(step);
    });
  }
  /* Arah hadap dari kompas HP (MainActivity) → putar "senter" tanpa menggambar ulang peta. */
  window.__lumiHeading = function (deg) {
    S.heading = deg; var u = unwrapHeading(deg);
    [GT.trip, GT.pip, { me: LIVE_HEADING.map && LIVE_HEADING.map._me }].forEach(function (T) {
      if (!T.me) return;
      var el = T.me.getElement && T.me.getElement(); if (!el) return;
      var b = el.querySelector(".lm-beam");
      if (!b) { T.me.setIcon(meIcon()); return; }
      b.style.transform = "rotate(" + Math.round(u) + "deg)";
    });
  };
  function compass(on) { try { NATIVE && NATIVE.compass && NATIVE.compass(!!on); } catch (e) { lumiLog(e); } }
  function guideRouteMeters(st) {
    if (!(st.metersLeft >= 0) || !st.lat || !LIVEW || !LIVEW.pts) return null;
    var tgt = LIVEW.tk.split(","), b = [+tgt[0], +tgt[1]];
    var km2 = remainingWalkKm([st.lat, st.lon], LIVEW.pts, b);
    return km2 == null ? null : Math.round(km2 * 1000);
  }
  function renderGuide(st) {
    if (st && cfg().voice && (st.text || st.title)) {
      var say = (st.title ? st.title + ". " : "") + (st.text || "");
      if (say !== S._voice) { S._voice = say; try { if (NATIVE && NATIVE.speak) NATIVE.speak(say); } catch (e) { lumiLog(e); } }
    }
    var g = $("#guide");
    if (!g) {
      g = document.createElement("div"); g.id = "guide"; g.className = "guide"; g.setAttribute("role", "status"); g.setAttribute("aria-live", "polite");
      g.innerHTML = '<div class="guide-map" id="guideMap"></div><div class="guide-body"></div>';
      $("#app").appendChild(g);
      g.addEventListener("click", function (e) {
        if (e.target.closest(".guide-stop")) { e.stopPropagation(); stopGuide(); toast("Pendampingan dihentikan"); return; }
        if (e.target.closest(".guide-pip")) { e.stopPropagation(); try { NATIVE.enterPip(); } catch (x) { lumiLog(x); } return; }
        if (S.guide && S.guide.it) openTrip(S.guide.it);
      });
    }
    $("#app").classList.add("guiding");
    var counts = "";
    if (st.stopsLeft >= 0) counts += '<div><b class="tnum">' + st.stopsLeft + "</b><span>pemberhentian lagi</span></div>";
    var routeM = guideRouteMeters(st);
    if (routeM != null) {
      st = Object.assign({}, st, { metersLeft: routeM });
      if (st.text) st.text = st.text.replace(/±[\d.,]+ (?:m|km) lagi/, "±" + (routeM < 1000 ? Math.round(routeM / 10) * 10 + " m" : (routeM / 1000).toFixed(1).replace(".", ",") + " km") + " lagi");
    }
    if (st.metersLeft >= 0) counts += '<div><b class="tnum">' + (st.metersLeft < 1000 ? Math.round(st.metersLeft / 10) * 10 + " m" : dec(st.metersLeft / 1000) + " km") + "</b><span>jalan kaki lagi</span></div>";
    var pipBtn = !st.done && NATIVE && NATIVE.pipOk && NATIVE.pipOk() ? '<button class="guide-pip" type="button" aria-label="Mode jendela kecil (PiP)">' + ICO_PIP + "PiP</button>" : "";
    $(".guide-body", g).innerHTML = '<div class="guide-top"><span class="guide-live">' + (st.done ? "SELESAI" : "PENDAMPINGAN") + "</span>" + pipBtn + '<button class="guide-stop" type="button">' + (st.done ? "Tutup" : "Berhenti") + "</button></div>" +
      '<div class="guide-main">' + esc(st.alert || st.title) + "</div>" + '<div class="guide-sub">' + esc(st.alert ? st.title + " · " + st.text : st.text) + "</div>" +
      (counts && !st.done ? '<div class="guide-count">' + counts + "</div>" : "");
    if (st.alert) {
      g.classList.add("alert");
      try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) { lumiLog(e); }
      clearTimeout(alertTimer); alertTimer = setTimeout(function () { g.classList.remove("alert"); }, 8000);
    }
    // posisi + sisa rute di peta perjalanan
    if (st.lat || st.cursor != null) { var keep = S.guideSt; S.guideSt = st.lat || !keep ? st : Object.assign({}, st, { lat: keep.lat, lon: keep.lon }); }
    paintGuideMap(S.guideSt);
    if (st.done) compass(false);
    if (S.guide && S.guide.names && st.cursor >= 0) {
      var nm = S.guide.names[st.cursor];
      $$(".st-body.is-now").forEach(function (b) { b.classList.remove("is-now"); });
      var hit = $$("#tripBody .st-body").filter(function (b) { var p = b.querySelector(".st-place"); return p && p.textContent === nm; });
      if (hit.length) hit[hit.length - 1].classList.add("is-now");
    }
  }
  var ICO_PIP = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor"/></svg>';
  /* Mode PiP (jendela kecil) saat pendampingan: hanya kartu pendampingan yang tampil. */
  function dropPipMap() {
    if (!GT.pip.map) return;
    var m = GT.pip.map; GT.pip.map = null; GT.pip.layer = null; GT.pip.me = null; GT.pip.pos = null; GT.pip.anim = null; GT.pip.sig = null;
    allMaps = allMaps.filter(function (x) { return x !== m; });
    try { m.remove(); } catch (e) { lumiLog(e); }
  }
  function refitMaps() {
    // Peta yang sedang tersembunyi (mis. peta perjalanan saat PiP) jangan diukur: ukurannya 0 dan merusak tampilan.
    allMaps.forEach(function (m) { try { if (m.getContainer().offsetWidth) m.invalidateSize(false); } catch (e) { lumiLog(e); } });
    paintGuideMap(S.guideSt);
  }
  window.__lumiPip = function (on) {
    document.documentElement.classList.toggle("pip", !!on);
    var el = $("#guideMap");
    // Kartu pendampingan bisa dibuat ulang (pendampingan dihentikan lalu dimulai lagi): peta PiP harus
    // menempel di kartu yang sekarang, bukan kartu lama yang sudah dibuang (penyebab layar biru).
    if (GT.pip.map && GT.pip.map.getContainer() !== el) dropPipMap();
    if (on && el && !GT.pip.map) {
      GT.pip.map = makeMap(el);
      GT.pip.map.dragging.disable(); GT.pip.map.touchZoom.disable(); GT.pip.map.doubleClickZoom.disable();
    }
    // Ukuran jendela berubah bertahap saat masuk/keluar PiP: ukur ulang semua peta beberapa kali.
    [60, 250, 600, 1200].forEach(function (t) { setTimeout(refitMaps, t); });
    if (!on) reviveMaps();
  };
  var rsT;
  window.addEventListener("resize", function () { clearTimeout(rsT); rsT = setTimeout(refitMaps, 120); });
  window.__lumiGuide = function (st) {
    if (!st) return;
    if (st.stopped) { stopGuide(); return; }
    if (st.error) { toast(st.error); stopGuide(); return; }
    if (!S.guide) { var sg = store("guide"); S.guide = sg ? { title: sg.title, names: sg.names } : { names: [] }; }
    renderGuide(st);
  };
  window.lumiOpen = function (what) {
    if (what === "guide" && S.guide && S.guide.it) openTrip(S.guide.it);
    if (what === "changes") { openSettings(); setTimeout(function () { var h = $("#chgHistory"); if (h) h.scrollIntoView(); }, 50); }
  };

  /* ------------------------------------------------------- pengaturan */
  // Bawaan tanpa API key (OpenFreeMap/OSM, Photon). Google Places & Static Maps opsional
  // lewat kunci internal aplikasi Google Maps — lihat js/gmaps.js dan docs/google-api-keys.md.
  var DEFAULT_CFG = { basemap: "liberty", gsearch: true, accessible: false, voice: false, lang: ((navigator.language || "id").toLowerCase().indexOf("id") === 0 ? "id" : "en") };
  var MAPSTYLES_KEYS = { liberty: 1, bright: 1, positron: 1, osm: 1, google: 1 };
  function cfg() {
    var c = store("cfg") || {};
    var o = {}; for (var k in DEFAULT_CFG) o[k] = c[k] === undefined ? DEFAULT_CFG[k] : c[k];
    if (!MAPSTYLES_KEYS[o.basemap]) o.basemap = "liberty";
    return o;
  }
  function applyAccessible() {
    try { document.body.classList.toggle("is-accessible", !!cfg().accessible); } catch (e) { lumiLog(e); }
  }

  /* ------------------------------------------------------- bahasa (ID/EN) */
  /* Terjemahan ada di js/i18n.js (kamus DOM + LumiI18n). Mengganti bahasa memuat ulang halaman. */
  function tr(s) { return s; }
  function applyLang() {
    try { document.documentElement.lang = I18.lang || (EN ? "en" : "id"); } catch (e) { lumiLog(e); }
    try { NATIVE && NATIVE.setLang && NATIVE.setLang(EN ? "en" : "id"); } catch (e) { lumiLog(e); }
  }

  /* ------------------------------------------------------- tempat tersimpan (dari Google Maps) */
  function savedPlaces() { return store("places") || []; }
  function savePlace(pl) {
    var arr = savedPlaces().filter(function (x) { return x.name.toLowerCase() !== pl.name.toLowerCase(); });
    arr.unshift({ name: pl.name, sub: pl.sub || "", p: pl.p }); store("places", arr.slice(0, 40));
  }
  function deletePlace(i) { var arr = savedPlaces(); arr.splice(i, 1); store("places", arr); }

  var JKT = [-6.2, 106.83];
  function reverse(p) { return Promise.resolve(p[0].toFixed(5) + ", " + p[1].toFixed(5)); }
  /* Jarak jalan untuk estimasi ojol (OSRM publik, tanpa key). */
  function roadKm(a, b) {
    var url = "https://router.project-osrm.org/route/v1/driving/" + a[1] + "," + a[0] + ";" + b[1] + "," + b[0] + "?overview=false";
    return http(url, 6000).then(function (j) { return j.routes && j.routes[0] ? j.routes[0].distance / 1000 : null; }).catch(function () { return null; });
  }

  /* Google Maps: buka pencarian; hasilnya kembali lewat Bagikan → Lumi Transport. */
  function openGoogleMaps(which, q) {
    S.shareTarget = which;
    store("shareTarget", { w: which, t: Date.now() });
    var url = q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "https://www.google.com/maps/@-6.2,106.83,12z";
    openUrl(url);
    toast("Di Google Maps: pilih tempatnya → Bagikan → Lumi Transport");
  }

  /* Koordinat yang diketik ("-6.2, 106.8") atau tautan Google Maps/OSM. */
  function parseCoords(text) {
    var t = decodeURIComponent(String(text || ""));
    var pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|ll|query|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
      /mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{2,3}\.\d+)\s*$/];
    for (var i = 0; i < pats.length; i++) {
      var m = t.match(pats[i]);
      if (m) { var la = +m[1], lo = +m[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return [la, lo]; }
    }
    return null;
  }
  function placeNameFromUrl(u) {
    var m = decodeURIComponent(u).match(/\/place\/([^/@]+)/);
    return m ? m[1].replace(/\+/g, " ") : null;
  }
  function isUrl(t) { return /^https?:\/\//i.test((t || "").trim()) || /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps)/i.test(t || ""); }

  /* ------------------------------------------------------- state */
  var S = { from: null, to: null, field: null, results: null, tab: "plan", lineFilter: "all", lineDir: 0 };
  var POPULAR = [
    { name: "Monas", sub: "Gambir, Jakarta Pusat", p: [-6.17540, 106.82720] },
    { name: "Bundaran HI", sub: "Menteng, Jakarta Pusat", p: [-6.19500, 106.82310] },
    { name: "Blok M", sub: "Kebayoran Baru, Jakarta Selatan", p: [-6.24430, 106.79990] },
    { name: "Kota Tua", sub: "Taman Sari, Jakarta Barat", p: [-6.13520, 106.81330] },
    { name: "Stasiun Manggarai", sub: "Tebet, Jakarta Selatan", p: [-6.20990, 106.84980] },
    { name: "Bandara Soekarno-Hatta", sub: "Tangerang, Banten", p: [-6.12560, 106.65590] },
    { name: "Gelora Bung Karno", sub: "Senayan, Jakarta Pusat", p: [-6.21850, 106.80160] },
    { name: "Taman Mini Indonesia Indah", sub: "Cipayung, Jakarta Timur", p: [-6.30250, 106.89520] },
    { name: "Ancol", sub: "Pademangan, Jakarta Utara", p: [-6.12250, 106.83200] },
    { name: "Ragunan", sub: "Pasar Minggu, Jakarta Selatan", p: [-6.31250, 106.82020] },
    { name: "Universitas Indonesia", sub: "Depok", p: [-6.36280, 106.82690] },
    { name: "Mega Kuningan", sub: "Setiabudi, Jakarta Selatan", p: [-6.22900, 106.82700] },
    { name: "Tanah Abang", sub: "Jakarta Pusat", p: [-6.18800, 106.81300] },
    { name: "Stasiun Bogor", sub: "Kota Bogor", p: [-6.59500, 106.79000] }
  ];

  /* ------------------------------------------------------- tabs & nav */
  function setTab(t) {
    S.tab = t;
    $$(".tab").forEach(function (el) { el.classList.toggle("is-active", el.id === "tab-" + t); });
    $$(".nav-btn").forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === t); });
    hideSuggest();
    if (t === "lines" && !$("#lineList").childElementCount) renderLines();
    if (t === "info" && !$("#infoBody").childElementCount) renderInfo();
    if (t === "stops" && !$("#stopList").childElementCount) renderStops("");
    if (t === "history") renderHistoryTab();
  }
  $$(".nav-btn").forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.tab); }); });

  /* ------------------------------------------------------- input & saran */
  var inFrom = $("#inFrom"), inTo = $("#inTo");
  function syncField(which) {
    var input = which === "from" ? inFrom : inTo, val = S[which];
    input.value = val ? val.name : input.value;
    input.closest(".field").classList.toggle("has-value", !!input.value);
  }
  function setPoint(which, pt) {
    S[which] = pt; var input = which === "from" ? inFrom : inTo;
    input.value = pt ? pt.name : ""; input.closest(".field").classList.toggle("has-value", !!pt);
  }
  [["from", inFrom], ["to", inTo]].forEach(function (pair) {
    var which = pair[0], input = pair[1];
    input.addEventListener("focus", function () { S.field = which; input.select(); showSuggest(input.value === (S[which] && S[which].name) ? "" : input.value); });
    input.addEventListener("input", function () {
      S[which] = null; input.closest(".field").classList.toggle("has-value", !!input.value);
      showSuggest(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); hideSuggest(); openGoogleMaps(which, input.value.trim()); }
    });
  });
  $$("[data-clear]").forEach(function (b) {
    b.addEventListener("click", function () { var w = b.dataset.clear; setPoint(w, null); (w === "from" ? inFrom : inTo).focus(); });
  });
  window.__lumiSet = function (w, pt) { setPoint(w, pt); };   // untuk pengujian
  /* Bersihkan asal, tujuan, dan hasil → kembali ke beranda. */
  function clearPlan() {
    setPoint("from", null); setPoint("to", null);
    S.results = null; S.filt = null; S.showAll = false;
    $("#results").hidden = true; $("#results").innerHTML = "";
    $("#planIntro").hidden = false; renderIntro();
    window.scrollTo(0, 0); var sc = $("#tab-plan"); if (sc) sc.scrollTop = 0;
  }
  $("#btnSwap").addEventListener("click", function () {
    var a = S.from, b = S.to, va = inFrom.value, vb = inTo.value;
    S.from = b; S.to = a; inFrom.value = vb; inTo.value = va; syncField("from"); syncField("to");
    if (S.from && S.to) runPlan();
  });

  var sgTimer, sgSeq = 0, gSeq = 0;
  /* Pencarian alamat OpenStreetMap (Photon). Gratis, tanpa API key. */
  var osmSeq = 0, osmPending = null;
  var ICO_PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/></svg>';
  var ICO_STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/></svg>';
  var ICO_LINK = '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function sgRow(item, idx) {
    var ico;
    if (item.kind === "me") ico = '<span class="sg-ico place"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>';
    else if (item.kind === "saved") ico = '<span class="sg-ico saved">' + ICO_STAR + "</span>";
    else if (item.kind === "gmaps" || item.kind === "gplace") ico = '<span class="sg-ico gmaps">' + ICO_PIN + "</span>";
    else if (item.kind === "link") ico = '<span class="sg-ico tool">' + ICO_LINK + "</span>";
    else ico = '<span class="sg-ico place">' + ICO_PIN + "</span>";
    return '<button class="sg-item' + (item.kind === "gmaps" ? " sg-primary" : "") + '" data-i="' + idx + '">' + ico + '<span class="sg-main"><div class="sg-name">' + esc(item.name) + '</div><div class="sg-sub">' + esc(item.sub || "") + "</div></span></button>";
  }
  function paintSuggest(items, note) {
    var box = $("#suggest");
    box.innerHTML = items.map(sgRow).join("") + (note ? '<div class="sg-note">' + esc(note) + "</div>" : "");
    box.hidden = !items.length && !note;
    $$(".sg-item", box).forEach(function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });
      b.addEventListener("click", function () { pick(items[+b.dataset.i]); });
    });
  }
  /* Semua alamat dicari di Google Maps. Di sini ada: saran dari Google Places
     (kalau kuncinya masih hidup), cari di Google Maps lewat Bagikan, lokasi saya,
     dan tempat yang sebelumnya sudah dibagikan dari Google Maps (tersimpan). */
  function showSuggest(q) {
    q = (q || "").trim();
    var lq = q.toLowerCase();
    if (isUrl(q)) { paintSuggest([{ name: "Gunakan lokasi dari tautan Google Maps", sub: "Membaca tautan…", kind: "link", url: q }]); return; }
    var rows = [{ name: q ? tl("Cari \u201c" + q + "\u201d di Google Maps", "Search \u201c" + q + "\u201d on Google Maps") : "Cari alamat di Google Maps",
      sub: "Pilih tempatnya, lalu Bagikan \u2192 Lumi Transport", kind: "gmaps", q: q }];
    if (!q) rows.push({ name: "Lokasi saya sekarang", sub: "Pakai GPS ponsel", kind: "me" });
    savedPlaces().filter(function (x) { return !q || x.name.toLowerCase().indexOf(lq) >= 0 || (x.sub || "").toLowerCase().indexOf(lq) >= 0; })
      .slice(0, 8).forEach(function (x) { rows.push({ name: x.name, sub: x.sub || "Dari Google Maps", p: x.p, kind: "saved" }); });
    paintSuggest(rows, "");
    googleSuggest(q, rows);
  }

  /* Saran alamat langsung dari Google Places (kunci internal, lihat js/gmaps.js).
     Diam saja bila kunci sudah tidak berlaku — baris lain tetap jalan. */
  function googleSuggest(q, rows) {
    if (!q || q.length < 3 || !cfg().gsearch || !window.LumiGoogle || LumiGoogle.isDown()) return;
    var seq = ++gSeq;
    var near = S.myPos || (S.field && S[S.field] && S[S.field].p) || JKT;
    LumiGoogle.autocomplete(q, near).then(function (preds) {
      if (seq !== gSeq || !preds.length) return;
      var out = rows.slice();
      preds.slice(0, 6).forEach(function (p, i) {
        out.splice(1 + i, 0, { kind: "gplace", name: p.name, sub: p.sub, id: p.id });
      });
      paintSuggest(out, tl("Saran alamat: Google Maps", "Address suggestions: Google Maps"));
    }).catch(function (e) { lumiLog(e, "gmap"); });
  }

  /* Ambil saran alamat dari Photon (OpenStreetMap), lalu sisipkan setelah baris pertama. */
  function osmLookup(q, seq) {
    var url = "https://photon.komoot.io/api/?q=" + encodeURIComponent(q) +
      "&lang=id&limit=6&lat=-6.2&lon=106.816&location_bias_scale=0.3";
    http(url, 9000).then(function (res) {
      if (!osmPending || osmPending.seq !== seq) return;
      var fs = (res && res.features) || [], out = [];
      for (var i = 0; i < fs.length && out.length < 6; i++) {
        var f = fs[i] || {}, pr = f.properties || {}, g = f.geometry || {}, c = g.coordinates || [];
        if (pr.countrycode && String(pr.countrycode).toUpperCase() !== "ID") continue;
        if (!c || c.length < 2) continue;
        var name = pr.name || pr.street || pr.city || "";
        if (!name) continue;
        var parts = [pr.street, pr.district, pr.city, pr.state].filter(function (x, k, a) { return x && a.indexOf(x) === k; });
        out.push({ name: name, sub: parts.join(", ") || "OpenStreetMap", p: [c[1], c[0]] });
      }
      if (!out.length) return;
      var rows = osmPending.rows.slice();
      for (var j = 0; j < out.length; j++) {
        rows.splice(1 + j, 0, { kind: "place", name: out[j].name, sub: out[j].sub, p: out[j].p });
      }
      paintSuggest(rows, "Saran alamat: OpenStreetMap");
    }).catch(function () { /* offline / kuota habis: saran lama tetap tampil */ });
  }
  function hideSuggest() { sgSeq++; gSeq++; osmPending = null; clearTimeout(sgTimer); $("#suggest").hidden = true; }
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#suggest") && !e.target.closest(".field")) hideSuggest();
  });

  function pick(item) {
    var which = S.field || (S.from ? "to" : "from");
    hideSuggest();
    if (item.kind === "me") { useMyLocation(which); return; }
    if (item.kind === "gmaps") { (which === "from" ? inFrom : inTo).blur(); openGoogleMaps(which, item.q); return; }
    if (item.kind === "link") {
      S.shareTarget = which;
      window.lumiShared(item.url.trim());
      return;
    }
    if (item.kind === "gplace") { pickGoogle(which, item); return; }
    setPoint(which, { name: item.name, p: item.p });
    afterPick(which);
  }
  /* place_id Google → koordinat lewat Place Details, lalu simpan seperti tempat biasa. */
  function pickGoogle(which, item) {
    var input = which === "from" ? inFrom : inTo;
    input.value = tl("Mengambil lokasi…", "Reading location…");
    LumiGoogle.details(item.id).then(function (d) {
      setPoint(which, { name: d.name || item.name, p: d.p });
      savePlace({ name: d.name || item.name, sub: d.sub, p: d.p });
      afterPick(which);
    }).catch(function (e) {
      input.value = item.name;
      lumiLog(e, "gmap");
      toast(tl("Tempat tidak bisa dibaca — coba lagi", "Could not read that place — try again"));
    });
  }
  function afterPick(which) {
    (which === "from" ? inFrom : inTo).blur();
    if (which === "from" && !S.to) { S.field = "to"; inTo.focus(); return; }
    if (which === "to" && !S.from) { S.field = "from"; inFrom.focus(); return; }
    if (S.from && S.to) runPlan();
  }

  function useMyLocation(which) {
    var btn = $("#btnLocate"); btn.classList.add("is-busy");
    (which === "from" ? inFrom : inTo).value = tl("Mencari lokasi…", "Finding location…");
    locate().then(function (o) {
      var p = [o.lat, o.lon]; S.myPos = p;
      setPoint(which, { name: tl("Lokasi saya", "My location"), p: p, me: true });
      if (S.from && S.to) runPlan(); else if (which === "from") { S.field = "to"; inTo.focus(); }
    }).catch(function (e) {
      setPoint(which, null); toast(e.message || tl("Lokasi tidak tersedia", "Location unavailable"));
    }).then(function () { btn.classList.remove("is-busy"); });
  }
  $("#btnLocate").addEventListener("click", function () { useMyLocation("from"); });
  $("#btnGo").addEventListener("click", function () {
    if (!S.from) { S.field = "from"; inFrom.focus(); toast("Isi titik asal dulu"); return; }
    if (!S.to) { S.field = "to"; inTo.focus(); toast("Isi tujuan dulu"); return; }
    runPlan();
  });

  /* ------------------------------------------------------- beranda */
  function renderIntro() {
    var favList = favs().slice(0, 10);
    var pop = $("#popular");
    if (!favList.length) {
      pop.innerHTML = '<p class="fav-empty">Belum ada rute favorit. Cari rute, lalu ketuk ☆ Simpan di hasil pencarian.</p>';
    } else {
      pop.innerHTML = favList.map(function (f, i) {
        return '<button data-fav-i="' + i + '">' + esc(f.from.name) + " → " + esc(f.to.name) + "</button>";
      }).join("");
      $$("#popular button").forEach(function (b) {
        b.addEventListener("click", function () {
          var f = favs()[+b.dataset.favI];
          if (!f) return;
          S.from = { name: f.from.name, p: f.from.p };
          S.to = { name: f.to.name, p: f.to.p };
          $("#inFrom").value = S.from.name; $("#inTo").value = S.to.name;
          runPlan();
        });
      });
    }
    var rec = store("recent") || [];
    $("#recentWrap").hidden = !rec.length;
    $("#recent").innerHTML = rec.map(function (r, i) {
      return '<button data-i="' + i + '"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg><span><span class="r-a">' +
        esc(r.from.name) + '</span> <span class="r-b">' + tl("ke", "to") + '</span> <span class="r-a">' + esc(r.to.name) + "</span></span></button>";
    }).join("");
    $$("#recent button").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = rec[+b.dataset.i];
        // "Lokasi saya" di riwayat = posisi GPS SEKARANG, bukan koordinat lama saat pencarian disimpan.
        function isMe(pt) { return pt && (pt.me || pt.name === "Lokasi saya" || pt.name === "My location"); }
        if (!isMe(r.from) && !isMe(r.to)) { setPoint("from", r.from); setPoint("to", r.to); runPlan(); return; }
        b.classList.add("is-busy"); toast("Mencari lokasimu…");
        locate().then(function (o) {
          var me = { name: tl("Lokasi saya", "My location"), p: [o.lat, o.lon], me: true }; S.myPos = me.p;
          setPoint("from", isMe(r.from) ? me : r.from); setPoint("to", isMe(r.to) ? me : r.to); runPlan();
        }).catch(function (e) { toast(e.message || tl("Lokasi tidak tersedia", "Location unavailable")); })
          .then(function () { b.classList.remove("is-busy"); });
      });
    });
    var groups = [
      ["Transjakarta", "#C1272D", "BRT, non-BRT, Royaltrans", "TJ"],
      ["KRL Commuter Line", "#E2231A", "Bogor, Cikarang, Rangkasbitung, Tangerang, Priok", "KRL"],
      ["MRT Jakarta", "#0069B4", "Lebak Bulus – Bundaran HI", "MRT"],
      ["LRT Jakarta & Jabodebek", "#2C9E8E", "Kelapa Gading, Cibubur, Bekasi", "LRT"],
      ["Mikrotrans", "#00A3E0", "Angkot JakLingko, gratis", "MIKRO"],
      ["Ojol motor & mobil", "#00AA13", "Estimasi tarif Gojek / Grab", "OJOL"],
      [tl("KA Bandara", "Airport Rail (KA Bandara)"), "#0F5E9C", "Manggarai – Soekarno-Hatta", "KABANDARA"],
      ["Whoosh", "#C8102E", "Kereta cepat Jakarta – Bandung", "WHOOSH"]
    ];
    $("#modeGrid").innerHTML = groups.map(function (g) {
      return '<button class="mode-card" data-f="' + g[3] + '"><i class="mode-swatch" style="background:' + g[1] + '"></i><div><b>' + g[0] + "</b><span>" + g[2] + "</span></div></button>";
    }).join("");
    $$("#modeGrid .mode-card").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.f === "OJOL") { toast("Isi asal & tujuan, estimasi ojol muncul di hasil"); inFrom.focus(); return; }
        S.lineFilter = b.dataset.f === "LRT" ? "LRT" : b.dataset.f; setTab("lines"); renderLines();
      });
    });
  }

  /* ------------------------------------------------------- perencanaan */
  var planSeq = 0;
  /* ------------------------------------------------------- waktu perjalanan */
  S.time = { mode: "now", hm: "08:00" };
  function minOf(d) { return d.getHours() * 60 + d.getMinutes(); }
  /* B7: jadwal & tarif mengikuti WIB. Objek Date "jam dinding WIB": getter lokalnya = waktu WIB,
     jadi HP dengan zona waktu lain tetap melihat jam operasional dan tarif pagi yang benar. */
  function nowWib() { var d = new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 420) * 60000); }
  function wibOf(ts) { var d = new Date(ts); return new Date(ts + (d.getTimezoneOffset() + 420) * 60000); }
  function targetDate() {
    var now = nowWib();
    if (S.time.mode === "now") return now;
    var hm = S.time.hm.split(":"), d = new Date(now);
    d.setHours(+hm[0], +hm[1], 0, 0);
    if (d.getTime() < now.getTime() - 60 * 60000) d = addMin(d, 1440);   // jam yang sudah lewat = besok
    return d;
  }
  function dayWord(d) {
    var n = nowWib(); var a = new Date(n.getFullYear(), n.getMonth(), n.getDate()), b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((b - a) / 86400000);
    return diff === 0 ? "" : diff === 1 ? tl("besok ", "tomorrow ") : "";
  }
  function timeLabel() {
    var en = EN;
    if (S.time.mode === "now") return en ? "Leaving now" : "Berangkat sekarang";
    var d = targetDate(), t = dayWord(d) + clock(d);
    return (S.time.mode === "dep" ? (en ? "Leave " : "Berangkat ") : (en ? "Arrive " : "Tiba ")) + t;
  }
  function syncTimeChip() {
    $("#timeLabel").textContent = timeLabel();
    $("#btnTime").classList.toggle("is-set", S.time.mode !== "now");
  }
  function openTimeSheet() {
    var sh = $("#sheetTime"); sh.hidden = false;
    var mode = S.time.mode;
    $("#inTime").value = S.time.mode === "now" ? clock(nowWib()).replace(".", ":") : S.time.hm;
    function paint() {
      $$("#timeMode button").forEach(function (b) { b.classList.toggle("is-on", b.dataset.m === mode); });
      $("#timeRow").style.opacity = mode === "now" ? ".4" : "1";
      $("#timeRow").style.pointerEvents = mode === "now" ? "none" : "auto";
    }
    $$("#timeMode button").forEach(function (b) { b.onclick = function () { mode = b.dataset.m; paint(); }; });
    $$("#presets button").forEach(function (b) { b.onclick = function () { $("#inTime").value = b.dataset.t; if (mode === "now") { mode = "dep"; paint(); } }; });
    $("#btnTimeOk").onclick = function () {
      S.time = { mode: mode, hm: $("#inTime").value || "08:00" };
      sh.hidden = true; syncTimeChip();
      if (S.from && S.to) runPlan();
    };
    paint();
  }
  $("#btnTime").addEventListener("click", openTimeSheet);
  $$("[data-close-modal]").forEach(function (b) { b.addEventListener("click", function () { b.closest(".modal").hidden = true; }); });
  $("#sheetTime").addEventListener("click", function (e) { if (e.target.id === "sheetTime") e.currentTarget.hidden = true; });

  function computePlan(roadK) {
    var t = targetDate();
    if (S.time.mode !== "arr") return { dep: t, results: planner.plan(S.from.p, S.to.p, roadK, minOf(t), t.getDay()) };
    // "Tiba sebelum": cari dengan perkiraan jam berangkat, lalu ulangi dengan jam berangkat dari opsi tercepat.
    var guess = addMin(t, -Math.max(30, Math.round(E.hav(S.from.p, S.to.p) * 4 + 20)));
    var r = planner.plan(S.from.p, S.to.p, roadK, minOf(guess), guess.getDay());
    var transit = r.filter(function (x) { return !x.direct; });
    var dep = transit.length ? addMin(t, -transit[0].min) : addMin(t, -r[0].min);
    r = planner.plan(S.from.p, S.to.p, roadK, minOf(dep), dep.getDay());
    r.forEach(function (x) { x.latest = addMin(t, -x.min); });
    return { dep: dep, results: r, arriveBy: t };
  }

  function runPlan() {
    hideSuggest(); inFrom.blur(); inTo.blur();
    if (!S.from || !S.to) return;
    var seq = ++planSeq;
    $("#planIntro").hidden = true;
    var res = $("#results"); res.hidden = false;
    res.innerHTML = '<div class="res-head"><h2>Mencari rute…</h2></div><div class="loading"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
    var rec = (store("recent") || []).filter(function (r) { return !(r.from.name === S.from.name && r.to.name === S.to.name); });
    rec.unshift({ from: S.from, to: S.to }); store("recent", rec.slice(0, 5));
    setTimeout(function () {
      var out = computePlan(null);
      if (seq !== planSeq) return;
      out.results.forEach(colorize);
      S.results = out.results; S.dep = out.dep; S.arriveBy = out.arriveBy; S.showAll = false; S.filt = null;
      renderResults(out.results, out.dep);
      $("#tab-plan").scrollTop = 0;   // hanya pencarian baru yang kembali ke atas
      roadKm(S.from.p, S.to.p).then(function (k) {
        if (!k || seq !== planSeq) return;
        // Cukup perbarui estimasi ojol langsung dengan jarak jalan sebenarnya (tanpa menghitung ulang rute).
        S.results.forEach(function (it) {
          if (!it.direct) return;
          var leg = it.legs[0]; leg.km = k; leg.min = E.ojolMinutes(k, it.direct);
          leg.fare = it.direct === "car" ? E.ojolCar(k) : E.ojolMotor(k);
          it.min = Math.round(leg.min); it.fareLo = leg.fare.lo; it.fareHi = leg.fare.hi;
        });
        // Perbarui hasil tanpa menggeser layar (jawaban OSRM bisa datang saat pengguna sedang menggulir).
        var tab = $("#tab-plan"), keep = tab.scrollTop;
        renderResults(S.results, S.dep);
        tab.scrollTop = keep;
      });
    }, 30);
  }

  function legIcon(type) {
    if (type === "walk" || type === "transfer") return '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="2" fill="currentColor"/><path d="M10 21l2-6 3 3v4M8 12l2-4 4 1 2 3M12 15l-1-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 17l4-7h5l3 7M13 6h3l-1 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function stripHTML(it) {
    var total = it.legs.reduce(function (s, l) { return s + l.min + (l.wait || 0); }, 0) || 1;
    return '<div class="strip">' + it.legs.map(function (l) {
      var w = Math.max(1, (l.min + (l.wait || 0)) / total * 100);
      if (l.type === "ride") return '<div class="seg" style="flex:' + w + ' 1 0;background:' + lc(l) + ';color:' + textColor(lc(l)) + '" translate="no">' + esc(l.line.code) + "</div>";
      if (l.type === "ojol") return '<div class="seg ojol" style="flex:' + w + ' 1 0">' + legIcon("ojol") + "</div>";
      return '<div class="seg walk" style="flex:' + Math.max(w, 2) + ' 1 0" title="jalan kaki"></div>';
    }).join("") + "</div>";
  }
  function legsText(it) {
    var parts = [];
    it.legs.forEach(function (l) {
      if (l.type === "ride") {
        var vv = l.variant;
        parts.push("<b>" + esc(modeLabel(l.line).replace("Transjakarta non-BRT", "TJ") + " " + l.line.code) + "</b>" + (vv ? (/Tol/.test(vv) ? tl(" (via Tol)", " (via toll road)") : tl(" (varian)", " (variant)")) : ""));
      }
      else if (l.type === "ojol") parts.push("<b>" + tl("Ojol", "Ride-hail") + "</b> " + km(l.km));
      else if (l.km >= 0.15) parts.push(tl("Jalan ", "Walk ") + km(l.km));
    });
    return parts.join('<span class="sep">›</span>');
  }

  /* Filter hasil: urutan + moda. Moda dipilih = opsi yang MENGANDUNG semua moda itu (boleh dikombinasi moda lain). */
  var FMODES = [
    ["TJ", "Transjakarta", function (l) { return l.mode === "TJ" || (l.mode === "ROYAL" && l.cat === "JABODETABEK"); }],
    ["MIKRO", "Mikrotrans", function (l) { return l.mode === "MIKRO"; }],
    ["LRT", "LRT", function (l) { return l.mode === "LRT" || l.mode === "LRTJ"; }],
    ["MRT", "MRT", function (l) { return l.mode === "MRT"; }],
    ["KRL", "KRL", function (l) { return l.mode === "KRL"; }],
    ["ROYAL", "Royaltrans", function (l) { return l.mode === "ROYAL" && l.cat !== "JABODETABEK"; }],
    ["KA", tl("KA Bandara", "Airport Rail"), function (l) { return l.mode === "KABANDARA"; }],
    ["WHOOSH", "Whoosh", function (l) { return l.mode === "WHOOSH"; }],
    ["OJOL", tl("Ojol", "Ride-hail"), null]
  ];
  function hasOj(it) { return !!it.direct || it.legs.some(function (l) { return l.type === "ojol"; }); }
  function itHas(it, key) {
    if (key === "OJOL") return hasOj(it);
    var f = FMODES.filter(function (m) { return m[0] === key; })[0][2];
    return it.legs.some(function (l) { return l.type === "ride" && f(l.line); });
  }
  function filterResults(results) {
    var F = S.filt || (S.filt = { sort: "rec", modes: {} });
    var keys = Object.keys(F.modes).filter(function (k) { return F.modes[k]; });
    var out = results.filter(function (it) { return keys.every(function (k) { return itHas(it, k); }); });
    if (F.sort !== "rec") {
      var cmp = F.sort === "fast" ? function (a, b) { return a.min - b.min || a.fareLo - b.fareLo; } :
        F.sort === "cheap" ? function (a, b) { return a.fareLo - b.fareLo || a.min - b.min; } :
        function (a, b) { return a.transfers - b.transfers || a.min - b.min; };
      // urutan tetap: angkutan umum, lalu kombinasi ojol, lalu ojol langsung
      var grp = function (it) { return it.direct ? 2 : hasOj(it) ? 1 : 0; };
      out = out.slice().sort(function (a, b) { return grp(a) - grp(b) || cmp(a, b); });
    }
    return out;
  }
  function filterBar(results) {
    var F = S.filt || (S.filt = { sort: "rec", modes: {} });
    var sorts = [["rec", "Rekomendasi"], ["fast", "Tercepat"], ["cheap", "Termurah"], ["few", "Minim transit"]];
    var h = '<div class="fbar" role="group" aria-label="Urutkan">' + sorts.map(function (x) {
      return '<button class="chip' + (F.sort === x[0] ? " on" : "") + '" data-sort="' + x[0] + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    var present = FMODES.filter(function (m) { return F.modes[m[0]] || results.some(function (it) { return itHas(it, m[0]); }); });
    h += '<div class="fbar" role="group" aria-label="Moda">' + '<span class="fl">Moda</span>' + present.map(function (m) {
      return '<button class="chip mode' + (F.modes[m[0]] ? " on" : "") + '" data-mode="' + m[0] + '">' + m[1] + "</button>";
    }).join("") + "</div>";
    return h;
  }

  function transfersText(n) { return n + tl("× pindah", n === 1 ? " transfer" : " transfers"); }
  function renderResults(allResults, dep) {
    var res = $("#results");
    var results = filterResults(allResults);
    var transit = results.filter(function (r) { return !r.direct; });
    var h = dep.getHours() + dep.getMinutes() / 60;
    var when = S.arriveBy ? tl("Tiba sebelum ", "Arrive by ") + dayWord(S.arriveBy) + clock(S.arriveBy) + tl(" · berangkat ±", " · leave ±") + clock(dep) : (S.time.mode === "now" ? tl("Berangkat sekarang, ", "Leaving now, ") : tl("Berangkat ", "Leaving ")) + dayWord(dep) + clock(dep);
    var html = '<div class="res-head"><h2>' + esc(S.from.name) + tl(" ke ", " to ") + esc(S.to.name) + '</h2><span class="res-acts"><button class="res-fav" id="btnFav" type="button">' + ICO_STAR + "<span>Simpan</span></button>" + '<button class="link" id="btnEdit">Ubah</button><button class="res-clear" id="btnClear" type="button" aria-label="Bersihkan dan kembali ke beranda"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>Bersihkan</button></span></div>' +
      '<div class="res-meta">' + when + " · " + (transit.length ? transit.length + tl(" pilihan transportasi umum + ojol", transit.length === 1 ? " public transport option + ride-hailing" : " public transport options + ride-hailing") : tl("pilihan ojol", "ride-hailing options")) + "</div>" +
      filterBar(allResults);
    var fk = Object.keys(S.filt.modes).filter(function (k) { return S.filt.modes[k]; });
    if (fk.length && !results.length) html += '<div class="empty"><b>' + tl("Tidak ada opsi dengan ", "No options with ") + esc(fk.map(function (k) { return FMODES.filter(function (m) { return m[0] === k; })[0][1]; }).join(" + ")) + "</b>Coba lepas salah satu filter moda.</div>";
    var closed = planner.closedAt(minOf(dep));
    if (closed.length) {
      html += '<div class="closed"><b>' + tl("Tidak beroperasi pukul ", "Not running at ") + clock(dep) + ":</b> " + esc(closed.map(T).join(", ")) + "." +
        (E.isNight(minOf(dep)) ? " " + tl("Yang tersedia: Transjakarta koridor 1–14 (AMARI, tiap ±20–40 menit), Mikrotrans JAK36/JAK47/JAK52/JAK75, dan ojol.", "Available: Transjakarta corridors 1–14 (AMARI, every ±20–40 min), Mikrotrans JAK36/JAK47/JAK52/JAK75 and ride-hailing.") : "") + "</div>";
    }
    if (h * 60 >= E.fares().tj.morningFrom && h * 60 < E.fares().tj.morningTo) html += '<div class="warn">' + tl("Tarif Transjakarta pukul 05.00–07.00 hanya " + rp(E.fares().tj.morning) + ".", "Transjakarta fare 05:00–07:00 is only " + rp(E.fares().tj.morning) + ".") + "</div>";
    if (!transit.length) html += '<div class="empty"><b>Belum ada angkutan umum yang cocok pada jam ini</b>' +
      (closed.length ? "Banyak moda sudah/belum beroperasi. Coba ubah jam berangkat, atau pakai ojol." : "Lokasi mungkin terlalu dekat atau di luar jangkauan data. Ojol bisa jadi pilihan.") + "</div>";
    var LIMIT = 12, hiddenCount = 0, moreDone = false;
    results.forEach(function (it, i) {
      var pureIdx = transit.indexOf(it);
      var hide = !S.showAll && !it.direct && !it.legs.some(function (l) { return l.type === "ojol"; }) && pureIdx >= LIMIT;
      if (hide) { hiddenCount++; return; }
      var withOjol = it.direct || it.legs.some(function (l) { return l.type === "ojol"; });
      if (withOjol && hiddenCount && !moreDone) {
        moreDone = true;
        html += '<button class="btn-sec more-btn" id="btnMore">' + tl("Tampilkan semua " + (hiddenCount + LIMIT) + " opsi angkutan umum", "Show all " + (hiddenCount + LIMIT) + " public transport options") + "</button>";
      }
      var isBest = !it.direct && it === transit[0];
      var tagsH = (it.tags || []).map(function (t) {
        var cls = t === "Tercepat" ? "best" : t === "Termurah" ? "cheap" : /Ojol/.test(t) ? "ojol" : "";
        return '<span class="tag ' + cls + '">' + esc(t) + "</span>";
      }).join("");
      var arr = addMin(dep, it.min);
      var arrText = it.latest ? tl("Berangkat paling lambat ", "Leave by ") + clock(it.latest) : tl("Tiba sekitar ", "Arrive around ") + clock(arr);
      html += '<div class="it' + (isBest ? " is-best" : "") + '" role="button" tabindex="0" data-i="' + i + '">' +
        '<div class="tags">' + tagsH + "</div>" +
        '<div class="it-top"><div><div class="it-time tnum">' + (it.min < 60 ? it.min + "<small>mnt</small>" : Math.floor(it.min / 60) + "<small>j</small> " + (it.min % 60) + "<small>mnt</small>") + "</div>" +
        '<div class="it-arr">' + arrText + "</div></div>" +
        '<div class="it-right"><div class="it-fare tnum">' + fareText(it.fareLo, it.fareHi) + "</div>" +
        '<div class="it-tr">' + (it.direct ? km(it.legs[0].km) + tl(" lewat jalan", " by road") : it.transfers === 0 ? tl("Tanpa pindah", "No transfers") : transfersText(it.transfers)) + "</div></div></div>" +
        stripHTML(it) + '<div class="it-legs">' + legsText(it) + "</div>" +
        (it.direct ? "" : '<div class="it-foot"><button class="it-share" type="button" aria-label="Bagikan rute ini">' + ICO_SHARE + "Bagikan rute</button></div>") +
        (it.direct ? '<div class="ojol-actions"><button class="gojek" data-app="com.gojek.app">Buka Gojek</button><button class="grab" data-app="com.grabtaxi.passenger">Buka Grab</button></div>' : "") +
        "</div>";
    });
    html += '<p class="disclaim">Waktu dan tarif adalah perkiraan. Tarif ojol mengikuti batas tarif Kemenhub zona Jabodetabek ditambah biaya jasa; harga di aplikasi bisa berbeda saat jam sibuk.</p>';
    res.innerHTML = tr(html);
    $("#btnEdit").addEventListener("click", function () { S.field = "to"; inTo.focus(); });
    $("#btnClear").addEventListener("click", clearPlan);
    $("#btnFav").addEventListener("click", toggleFav); paintFavBtn();
    // "Tampilkan semua": layar tetap di posisi tombol; opsi tambahan muncul di bawahnya.
    if ($("#btnMore")) $("#btnMore").addEventListener("click", function () {
      var tab = $("#tab-plan"), btnTop = this.getBoundingClientRect().top, keep = tab.scrollTop;
      var firstNew = results.indexOf(transit[LIMIT]);
      S.showAll = true; renderResults(allResults, dep);
      tab.scrollTop = keep;
      var el = $('.it[data-i="' + firstNew + '"]', res);
      if (el) tab.scrollTop = keep + (el.getBoundingClientRect().top - btnTop);
    });
    $$(".fbar .chip", res).forEach(function (c) {
      c.addEventListener("click", function () {
        if (c.dataset.sort) S.filt.sort = c.dataset.sort;
        else S.filt.modes[c.dataset.mode] = !S.filt.modes[c.dataset.mode];
        var top = $("#tab-plan").scrollTop;
        renderResults(allResults, dep);
        $("#tab-plan").scrollTop = top;
      });
    });
    $$(".it", res).forEach(function (el) {
      el.addEventListener("click", function (e) {
        var app = e.target.closest("[data-app]");
        if (app) { e.stopPropagation(); openApp(app.dataset.app); return; }
        if (e.target.closest(".it-share")) { e.stopPropagation(); shareTrip(results[+el.dataset.i]); return; }
        openTrip(results[+el.dataset.i]);
      });
    });
  }

  /* ------------------------------------------------------- peta */
  /*
   * Peta dasar gratis TANPA API key:
   *  - OpenFreeMap (vektor, digambar MapLibre GL): tajam di semua zoom, zoom/geser halus, tanpa batas pemakaian.
   *  - OpenStreetMap standar (raster) sebagai cadangan bila WebGL tidak tersedia.
   */
  var MAPSTYLES = {
    liberty: { name: "Liberty (berwarna)", gl: "https://tiles.openfreemap.org/styles/liberty" },
    bright: { name: "Bright (kontras)", gl: "https://tiles.openfreemap.org/styles/bright" },
    positron: { name: "Positron (terang, polos)", gl: "https://tiles.openfreemap.org/styles/positron" },
    osm: { name: "OpenStreetMap standar", raster: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
    google: { name: "Google Maps (raster)", google: true }
  };
  var ATTR_OFM = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
  var ATTR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors';
  var ATTR_GOOGLE = 'Peta &copy; <a href="https://www.google.com/maps" target="_blank">Google</a>';
  var GL_OK = null;
  function glOk() {
    if (GL_OK !== null) return GL_OK;
    try { var c = document.createElement("canvas"); GL_OK = !!(window.maplibregl && L.maplibreGL && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (e) { GL_OK = false; }
    return GL_OK;
  }
  function mapStyleKey() { var b = cfg().basemap; return MAPSTYLES[b] ? b : "liberty"; }
  var GL_DOWN = false;   // R9: OpenFreeMap tidak menjawab → peta raster OSM sampai aplikasi dibuka ulang
  function baseLayer() {
    var st = MAPSTYLES[mapStyleKey()];
    /* Peta Google: petak raster dari Static Maps, dimuat lewat <img> yang headernya
     * dipasang shouldInterceptRequest (lihat GoogleKeys.java). */
    if (st.google && window.LumiGoogle) return LumiGoogle.tileLayer(ATTR_GOOGLE);
    if (st.gl && glOk() && !GL_DOWN) {
      var gl = L.maplibreGL({ style: st.gl, attribution: ATTR_OFM });
      gl.once("add", function () {
        var mm = null, styled = false;
        try { mm = gl.getMaplibreMap && gl.getMaplibreMap(); if (mm) mm.once("styledata", function () { styled = true; }); } catch (e) { lumiLog(e); }
        if (!mm) return;
        setTimeout(function () {
          if (GL_DOWN || styled || !navigator.onLine) return;
          GL_DOWN = true;
          lumiLog(new Error("gaya peta OpenFreeMap tidak termuat"), "map");
          toast(tl("Server peta lambat — memakai peta OpenStreetMap standar.", "Map server is slow — using the standard OpenStreetMap map."));
          applyBasemap();
        }, 12000);
      });
      return gl;
    }
    return L.tileLayer(MAPSTYLES.osm.raster, { maxZoom: 20, maxNativeZoom: 19, keepBuffer: 4, attribution: ATTR_OSM });
  }
  var allMaps = [];
  function makeMap(el) {
    var m = L.map(el, { zoomControl: false, attributionControl: true, maxZoom: 20, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 }).setView(JKT, 12);
    m._lumiTiles = baseLayer().addTo(m);
    m.attributionControl.setPrefix(false);
    allMaps.push(m);
    return m;
  }
  function applyBasemap() {
    allMaps.forEach(function (m) { try { if (m._lumiTiles) m.removeLayer(m._lumiTiles); } catch (e) { lumiLog(e); } m._lumiTiles = baseLayer().addTo(m); });
  }
  function dotIcon(cls, color) {
    return L.divIcon({ className: "", html: '<div class="' + cls + '" style="--c:' + (color || "#1565D8") + '"></div>', iconSize: cls === "lm-stop" ? [12, 12] : [22, 22], iconAnchor: cls === "lm-stop" ? [6, 6] : [11, 11] });
  }
  function shapeSlice(line, dirIndex, fromP, toP) {
    var sh = line.dirs[dirIndex].shape;
    if (!sh || sh.length < 2) return null;
    function nearest(p) { var bi = 0, bd = 1e9; for (var i = 0; i < sh.length; i++) { var d = E.hav(p, sh[i]); if (d < bd) { bd = d; bi = i; } } return [bi, bd]; }
    var a = nearest(fromP), b = nearest(toP);
    if (a[1] > 0.4 || b[1] > 0.4 || b[0] <= a[0]) return null;
    return sh.slice(a[0], b[0] + 1);
  }

  /* ------------------------------------------------------- detail perjalanan */
  var tripMap, tripLayer, tripBoard;
  function showStopsText(n) { return tl("Lihat " + n + " pemberhentian", "Show " + n + (n === 1 ? " stop" : " stops")); }
  function openTrip(it) {
    colorize(it);
    S.openTrip = it;
    var sheet = $("#sheetTrip"); sheet.hidden = false; raiseSheet(sheet);
    $("#tripTitle").textContent = S.from.name + tl(" ke ", " to ") + S.to.name;
    if (!tripMap) { tripMap = makeMap($("#tripMap")); }
    setTimeout(function () {
      tripMap.invalidateSize();
      if (tripLayer) tripLayer.remove();
      tripLayer = L.featureGroup().addTo(tripMap);
      it.legs.forEach(function (l) {
        if (l.type === "ride") {
          var pts = shapeSlice(l.line, l.dirIndex, l.fromP, l.toP);
          pts = pts ? [l.fromP].concat(pts, [l.toP]) : l.stops.map(function (s) { return s.p; });
          L.polyline(pts, { color: "#fff", weight: 9, opacity: .9 }).addTo(tripLayer);
          L.polyline(pts, { color: lc(l), weight: 6 }).addTo(tripLayer);
          l.stops.forEach(function (s, k) {
            var mk = L.marker(s.p, { icon: dotIcon("lm-stop", lc(l)) }).addTo(tripLayer);
            if (k === 0 || k === l.stops.length - 1) mk.bindTooltip(s.n, { className: "lm-tip", direction: "top", offset: [0, -6] });
          });
        } else {
          var a = l.from && l.from.length === 2 && typeof l.from[0] === "number" ? l.from : l.fromP;
          var b = l.to && l.to.length === 2 && typeof l.to[0] === "number" ? l.to : l.toP;
          if (a && b) L.polyline([a, b], { color: l.type === "ojol" ? "#00AA13" : "#6B7891", weight: 4, dashArray: l.type === "ojol" ? "10 6" : "2 7", lineCap: "round" }).addTo(tripLayer);
        }
      });
      L.marker(S.from.p, { icon: dotIcon("lm-end") }).addTo(tripLayer);
      L.marker(S.to.p, { icon: dotIcon("lm-dest") }).addTo(tripLayer);
      tripMap.fitBounds(tripLayer.getBounds(), { padding: [30, 30] });
      if (GT.trip.layer) { GT.trip.layer.remove(); GT.trip.layer = null; } if (GT.trip.me) { GT.trip.me.remove(); GT.trip.me = null; } GT.trip.sig = null;
      if (S.guide && S.guide.it === it) { GT.trip.fitted = false; GT.trip.zoomed = false; GT.trip.follow = true; paintGuideMap(S.guideSt); }
      else recenterBtn(false);
    }, 60);

    var dep = S.dep || nowWib(), t = 0;
    var html = '<div class="trip-sum"><div class="big tnum">' + (it.min < 60 ? it.min + "<small>mnt</small>" : Math.floor(it.min / 60) + "<small>j</small> " + (it.min % 60) + "<small>mnt</small>") +
      '</div><div class="facts"><b class="tnum">' + fareText(it.fareLo, it.fareHi) + "</b><br>" + clock(dep) + " – " + clock(addMin(dep, it.min)) +
      (it.direct ? "" : " · " + (it.transfers ? transfersText(it.transfers) : tl("tanpa pindah", "no transfers"))) + "</div></div>";
    if (!it.direct) html += '<button class="nav-start" id="btnGuide" type="button">' + ICO_NAV + (S.guide && S.guide.it === it ? "Pendampingan sedang berjalan" : "Mulai pendampingan") + "</button>";
    html += '<div class="steps">';
    function step(cls, color, time, place, body) {
      return '<div class="step ' + cls + '" style="--c:' + (color || "#8D98AE") + '"><div class="st-time tnum">' + (time || "") + '</div><div class="st-rail"><i class="st-node"></i></div><div class="st-body">' +
        (place ? '<div class="st-place">' + esc(place) + "</div>" : "") + body + "</div></div>";
    }
    html += step("endpoint", "#1565D8", clock(dep), S.from.name, "");
    it.legs.forEach(function (l, i) {
      var startT = addMin(dep, t);
      if (l.type === "walk" || l.type === "transfer") {
        var dest = l.type === "transfer" ? l.to : (i === it.legs.length - 1 ? S.to.name : l.label);
        var desc = l.type === "transfer"
          ? (l.km < 0.05 ? sameStopText(it.legs[i - 1], it.legs[i + 1]) : tl("Jalan kaki ", "Walk ") + km(l.km) + " (±" + mins(l.min) + ")" + tl(" ke ", " to ") + esc(l.to) + nextRideText(it.legs[i + 1]))
          : tl("Jalan kaki ", "Walk ") + km(l.km) + " (±" + mins(l.min) + ")" + (dest ? tl(" ke ", " to ") + esc(dest) : "");
        html += step(l.type, null, "", "", '<div class="st-desc" data-walk="' + i + '">' + desc + "</div>");
        t += l.min;
      } else if (l.type === "ojol") {
        html += step("ojol", "#00AA13", "", "", '<div class="st-card"><div class="row"><span class="badge sm" style="background:#00AA13">' + (l.kind === "car" ? "Mobil" : "Motor") +
          '</span><span class="ttl">' + (l.kind === "car" ? tl("Naik ojol mobil", "Ride-hail car") : tl("Naik ojol motor", "Ride-hail bike")) + "</span></div>" +
          '<div class="dir">' + km(l.km) + " · ±" + mins(l.min) + " · " + fareText(l.fare.lo, l.fare.hi) + (l.label && i === 0 ? tl(" · turun di ", " · drop-off at ") + "<b>" + esc(l.label) + "</b>" : "") + "</div>" +
          '<div class="ojol-actions"><button class="gojek" data-app="com.gojek.app">Buka Gojek</button><button class="grab" data-app="com.grabtaxi.passenger">Buka Grab</button></div></div>');
        t += l.min;
      } else {
        t += l.wait;
        var boardT = addMin(dep, t);
        var inner = l.stops.slice(1, -1);
        var alts = (l.alts || []).map(function (a) { return badge(a, "xs"); }).join(" ");
        html += step("ride", lc(l), clock(boardT), l.from,
          '<div class="st-card"><div class="row">' + badge(l.line, "sm", lc(l)) + '<span class="ttl">' + esc(modeLabel(l.line)) + " " + esc(l.line.code) + (l.night ? '<span class="night-tag">AMARI</span>' : "") + "</span></div>" +
          '<div class="dir">Arah <b>' + esc(l.headsign) + "</b></div>" +
          (l.variant ? '<div class="alt">' + esc(T(l.variant)) + "</div>" : "") +
          (l.fareNote ? '<div class="alt">' + tl("Tarif: ", "Fare: ") + esc(T(l.fareNote)) + "</div>" : "") +
          (liveOk(l.line) ? '<div class="live-eta" data-leg="' + i + '"><i class="live-dot"></i>' + tl("Mencari posisi bus ", "Finding bus ") + esc(l.line.code) + "…</div>" : "") +
          '<div class="meta"><span>' + stopWord(l.stops.length - 1, RAIL[l.line.mode]) + "</span><span>±" + mins(l.min) + "</span><span>" + (l.farePaid === 0 && l.fare > 0 ? tl("sudah termasuk", "already paid") : fareText(l.farePaid, l.farePaid)) + "</span><span>" + tl("tunggu ±", "wait ±") + mins(l.wait) + "</span></div>" +
          (alts ? '<div class="alt">Bisa juga naik ' + alts + "</div>" : "") +
          (inner.length ? '<ul class="st-stops" hidden>' + inner.map(function (s) { return "<li>" + esc(s.n) + "</li>"; }).join("") + "</ul>" : "") +
          '<div class="st-foot">' + (inner.length ? '<button class="st-toggle" data-tog="' + inner.length + '">' + showStopsText(inner.length) + "</button>" : "") +
          '<button class="st-toggle" data-line="' + l.line.id + '">' + tl("Info rute ", "Route info ") + esc(l.line.code) + "</button></div></div>");
        t += l.min;
        html += step("ride", lc(l), clock(addMin(dep, t)), l.to, '<div class="st-desc">Turun di sini</div>');
      }
    });
    html += step("dest", "#38BDF8", clock(addMin(dep, it.min)), S.to.name, '<div class="st-desc">Sampai tujuan</div>');
    html += "</div>";
    html += '<div class="trip-foot"><button class="btn-sec" id="btnShare2" type="button">Bagikan rute (gambar)</button>' +
      '<button class="btn-sec" id="btnReportStop" type="button">Laporkan halte/rute salah</button>' +
      '<p class="disclaim">Jadwal tidak real-time. Cek pengumuman operator untuk gangguan atau perubahan rute.</p></div>';
    var body = $("#tripBody"); body.innerHTML = tr(html); body.scrollTop = 0;
    $("#btnReportStop").addEventListener("click", reportStopIssue);
    $$("[data-tog]", body).forEach(function (b) {
      b.addEventListener("click", function () { var ul = b.closest(".st-card").querySelector(".st-stops"); ul.hidden = !ul.hidden; b.textContent = ul.hidden ? showStopsText(+b.dataset.tog) : tl("Sembunyikan pemberhentian", "Hide stops"); });
    });
    $$("[data-app]", body).forEach(function (b) { b.addEventListener("click", function () { openApp(b.dataset.app); }); });
    $$("[data-line]", body).forEach(function (b) { b.addEventListener("click", function () { openLine(planner.byId[b.dataset.line], 0); }); });
    $("#btnShare2").addEventListener("click", function () { shareTrip(it); });
    if ($("#btnGuide")) $("#btnGuide").addEventListener("click", function () {
      if (S.guide && S.guide.it === it) { toast(tl("Pendampingan sudah berjalan — lihat kartu biru di bawah", "Guidance is already running — see the blue card below")); return; }
      if (S.guide) stopGuide();
      startGuide(it);
    });
    bindTjApp(body);
    // Bus langsung untuk tiap ruas Transjakarta/Mikrotrans/Royaltrans: posisi di peta + perkiraan tiba di halte naik.
    if (tripBoard) { tripBoard.stop(); tripBoard = null; }
    LumiLive.clearAlerts();
    var liveLegs = [];
    it.legs.forEach(function (l, i) { if (l.type === "ride" && liveOk(l.line)) liveLegs.push({ l: l, i: i }); });
    if (liveLegs.length && tripMap) {
      var codeColor = {}; liveLegs.forEach(function (x) { codeColor[LumiLive.norm(x.l.line.code)] = x.l.line.color; });
      var renderT = function () {
        liveLegs.forEach(function (x) {
          var el = $('.live-eta[data-leg="' + x.i + '"]', body); if (!el) return;
          var best = null;
          Object.keys(tripBoard.buses).forEach(function (k) {
            var b = tripBoard.buses[k];
            if (LumiLive.norm(b.code) !== LumiLive.norm(x.l.line.code)) return;
            // ETA presisi dari ID halte; sebelum ID-nya siap, pakai pencocokan nama/koordinat.
            var feed = x.fromId ? LumiLive.etaFor(b, x.fromId, x.toId) : etaTo(b, x.l.from, x.l.to, x.l.fromP, x.l.toP);
            var e = busEta(b, x.l.line, x.l.stops[0].p, feed);
            if (e != null && (!best || e < best.e)) best = { e: e, b: b };
          });
          var st = LumiLive.state();
          el.classList.toggle("on", !!best);
          el.innerHTML = '<i class="live-dot"></i>' + (best ? tl("Bus " + esc(x.l.line.code) + " berikutnya tiba di " + esc(x.l.from) + " ", "Next " + esc(x.l.line.code) + " bus reaches " + esc(x.l.from) + " ") + "<b>" + fmtEta(best.e) + "</b> <span>(" + esc(best.b.key) + ")</span>" :
            st === "connected" ? tl("Belum ada bus " + esc(x.l.line.code) + " menuju " + esc(x.l.from) + " yang terpantau", "No " + esc(x.l.line.code) + " bus heading to " + esc(x.l.from) + " spotted yet") :
            /error|reconnecting/.test(st) ? tl("Data armada belum bisa dihubungi. ", "Can't reach the fleet feed yet. ") + T(liveStatusText(st, 0)) + ' <button class="st-toggle" data-tjapp>' + tl("Buka aplikasi TJ", "Open the TJ app") + "</button>" :
            tl("Menghubungkan ke data armada…", "Connecting to the fleet feed…"));
          bindTjApp(el);
          if (best) {
            // "Bus makin dekat": beri tahu saat melewati 10 / 5 / 2 menit dan saat tiba.
            var am = LumiLive.alert("leg" + x.i, x.l.line.code, x.l.from, best.b.key, best.e);
            if (am) { toast(am.text); LumiLive.notify(am.title, am.text); }
          }
        });
      };
      var tT = null;
      tripBoard = new LiveBoard(tripMap, liveLegs.map(function (x) { return x.l.line.code; }), function (b) { return codeColor[LumiLive.norm(b.code)]; },
        function () { if (!tT) tT = setTimeout(function () { tT = null; renderT(); }, 700); });
      stopWhenHidden($("#sheetTrip"), tripBoard);
      // ID halte naik/turun dicari sekali (REST TJ), supaya ETA dibaca dari eta_by_parent_stop_id.
      liveLegs.forEach(function (x) {
        if (!x.l.fromP) return;
        LumiLive.stopIdFor(x.l.fromP[0], x.l.fromP[1], x.l.from).then(function (id) { if (id) { x.fromId = id; renderT(); } });
        if (x.l.toP) LumiLive.stopIdFor(x.l.toP[0], x.l.toP[1], x.l.to).then(function (id) { if (id) { x.toId = id; renderT(); } });
      });
    }
    // Jarak jalan kaki sebenarnya (menyusuri jalan) untuk langkah jalan kaki > 150 m.
    it.legs.forEach(function (l, i) {
      if ((l.type !== "walk" && l.type !== "transfer") || l.km < 0.15) return;
      var a = i === 0 ? S.from.p : (it.legs[i - 1].toP || null);
      var b = i === it.legs.length - 1 ? S.to.p : (it.legs[i + 1] && it.legs[i + 1].fromP) || null;
      if (!a || !b) return;
      footPath(a, b, function (pts) {
        var real = E.hav(a, pts[0]) + pathKm(pts) + E.hav(pts[pts.length - 1], b);
        if (real < l.km * 1.25 + 0.05) return;                 // tidak jauh beda: biarkan
        var el = $('[data-walk="' + i + '"]', body); if (!el || el.querySelector(".walk-real")) return;
        var mn = Math.round(real / 4.5 * 60);
        el.insertAdjacentHTML("beforeend", '<span class="walk-real">' + tl("Lewat jalan sebenarnya ±", "Along actual streets ±") + km(real) + " (±" + mins(mn) + ")" + tl(" — harus memutar", " — a detour is needed") + "</span>");
      });
    });
  }
  /* ------------------------------------------------------- bagikan rute sebagai gambar */
  var ICO_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2.5" fill="currentColor"/><circle cx="18" cy="6" r="2.5" fill="currentColor"/><circle cx="18" cy="18" r="2.5" fill="currentColor"/><path d="m8 11 8-4M8 13l8 4" stroke="currentColor" stroke-width="2"/></svg>';
  function tripText(it) {
    var lines = [tl("Rute ", "Route ") + S.from.name + " → " + S.to.name + " (±" + mins(it.min) + ", " + fareText(it.fareLo, it.fareHi) + ")"];
    it.legs.forEach(function (l) {
      var ns = l.stops ? l.stops.length - 1 : 0;
      if (l.type === "ride") lines.push(tl("• Naik ", "• Take ") + modeLabel(l.line) + " " + l.line.code + tl(" dari ", " from ") + l.from + tl(" arah ", " towards ") + l.headsign + tl(", turun di ", ", get off at ") + l.to + " (" + ns + tl(" pemberhentian)", ns === 1 ? " stop)" : " stops)"));
      else if (l.type === "ojol") lines.push(tl("• Ojol ", "• Ride-hail ") + km(l.km) + (l.label ? tl(" ke ", " to ") + l.label : ""));
      else if (l.km > 0.1) lines.push(tl("• Jalan kaki ", "• Walk ") + km(l.km) + (l.type === "transfer" ? tl(" ke ", " to ") + l.to : ""));
    });
    lines.push(tl("Direncanakan dengan Lumi Transport", "Planned with Lumi Transport"));
    return lines.join("\n");
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    var words = String(text).split(" "), out = [], line = "";
    words.forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
    return out;
  }
  function tripImage(it) {
    var W = 1080, P = 64, F = '"PJS", system-ui, sans-serif';
    var dep = S.dep || nowWib();
    var c = document.createElement("canvas"), ctx = c.getContext("2d");
    // susun langkah dulu untuk menghitung tinggi
    var steps = [], t = 0;
    steps.push({ kind: "end", color: "#1565D8", time: clock(dep), title: S.from.name, sub: tl("Berangkat", "Depart") });
    it.legs.forEach(function (l, i) {
      if (l.type === "walk" || l.type === "transfer") {
        if (l.km < 0.03) { t += l.min; return; }
        var dest = l.type === "transfer" ? l.to : (i === it.legs.length - 1 ? S.to.name : l.label);
        steps.push({ kind: "walk", color: "#89A2B8", title: (l.type === "transfer" && l.km < 0.05 ? tl("Pindah di stasiun/halte yang sama", "Change at the same station/stop") : tl("Jalan kaki ", "Walk ") + km(l.km) + " (±" + mins(l.min) + ")"), sub: dest ? tl("ke ", "to ") + dest : "" });
        t += l.min;
      } else if (l.type === "ojol") {
        steps.push({ kind: "ride", color: "#00AA13", badge: l.kind === "car" ? tl("Mobil", "Car") : tl("Ojol", "Bike"), title: (l.kind === "car" ? tl("Naik ojol mobil ", "Ride-hail car ") : tl("Naik ojol motor ", "Ride-hail bike ")) + km(l.km), sub: "±" + mins(l.min) + " · " + fareText(l.fare.lo, l.fare.hi) + (l.label ? tl(" · turun di ", " · drop-off at ") + l.label : "") });
        t += l.min;
      } else {
        t += l.wait;
        steps.push({ kind: "ride", color: lc(l), badge: l.line.code, time: clock(addMin(dep, t)),
          title: tl("Naik ", "Take ") + modeLabel(l.line) + " " + l.line.code + (l.variant ? (/Tol/.test(l.variant) ? tl(" (via Tol)", " (via toll road)") : tl(" (varian)", " (variant)")) : ""),
          sub: tl("Dari ", "From ") + l.from + tl(" arah ", " towards ") + l.headsign,
          sub2: stopWord(l.stops.length - 1, RAIL[l.line.mode]) + " · ±" + mins(l.min) + " · " + (l.farePaid === 0 && l.fare > 0 ? tl("tanpa bayar lagi", "no extra fare") : fareText(l.farePaid, l.farePaid)) });
        t += l.min;
        steps.push({ kind: "stop", color: lc(l), time: clock(addMin(dep, t)), title: l.to, sub: tl("Turun di sini", "Get off here") });
      }
    });
    steps.push({ kind: "dest", color: "#38BDF8", time: clock(addMin(dep, it.min)), title: S.to.name, sub: tl("Sampai tujuan", "Arrived at destination") });
    // ukur
    ctx.font = "600 34px " + F;
    var textW = W - P * 2 - 150;
    steps.forEach(function (st) {
      ctx.font = "700 36px " + F; st.tl = wrap(ctx, st.title, textW).slice(0, 2);
      ctx.font = "500 30px " + F; st.sl = (st.sub ? wrap(ctx, st.sub, textW) : []).concat(st.sub2 ? wrap(ctx, st.sub2, textW) : []).slice(0, 4);
      st.h = 34 + st.tl.length * 46 + st.sl.length * 40 + 30;
    });
    var headH = 250, sumH = 330, footH = 150;
    var H = headH + sumH + steps.reduce(function (a, st) { return a + st.h; }, 0) + footH + 40;
    c.width = W; c.height = H;
    // latar
    ctx.fillStyle = "#EEF6FC"; ctx.fillRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, W, headH + 120);
    g.addColorStop(0, "#63CFF7"); g.addColorStop(.55, "#2E95F0"); g.addColorStop(1, "#1565D8");
    ctx.fillStyle = g; rr(ctx, 0, -40, W, headH + 140, 56); ctx.fill();
    // logo
    ctx.save(); ctx.translate(P, 56);
    var lg = ctx.createLinearGradient(0, 0, 112, 112); lg.addColorStop(0, "#7FCBF7"); lg.addColorStop(1, "#3A7BE4");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(56, 56, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(40, 32); ctx.lineTo(40, 62); ctx.quadraticCurveTo(40, 80, 58, 80); ctx.lineTo(78, 80); ctx.stroke();
    ctx.fillStyle = "#1565D8"; ctx.beginPath(); ctx.arc(40, 32, 10, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 7; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(78, 80, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(80, 18); ctx.lineTo(83.5, 27); ctx.lineTo(92, 30.5); ctx.lineTo(83.5, 34); ctx.lineTo(80, 43); ctx.lineTo(76.5, 34); ctx.lineTo(68, 30.5); ctx.lineTo(76.5, 27); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff"; ctx.font = "800 52px " + F; ctx.fillText("Lumi Transport", P + 140, 112);
    ctx.font = "500 30px " + F; ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillText(tl("Rute perjalanan · ", "Trip route · ") + dayWord(dep) + clock(dep), P + 140, 158);
    // kartu ringkasan
    var y = headH - 40;
    ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(14,72,150,.18)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    rr(ctx, P - 20, y, W - (P - 20) * 2, sumH - 20, 40); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.fillStyle = "#0F2740"; ctx.font = "700 36px " + F;
    var od = wrap(ctx, S.from.name + "  →  " + S.to.name, W - P * 2 - 20).slice(0, 2);
    od.forEach(function (ln, k) { ctx.fillText(ln, P + 10, y + 64 + k * 44); });
    var yy = y + 64 + od.length * 44 + 70;
    ctx.font = "800 84px " + F; ctx.fillStyle = "#0F2740";
    var tm = mins(it.min);
    ctx.fillText(tm, P + 10, yy);
    ctx.textAlign = "right"; ctx.font = "800 48px " + F; ctx.fillText(fareText(it.fareLo, it.fareHi), W - P - 10, yy - 30);
    ctx.font = "500 30px " + F; ctx.fillStyle = "#527089";
    ctx.fillText((it.transfers ? transfersText(it.transfers) : tl("Tanpa pindah", "No transfers")) + tl(" · tiba ±", " · arrive ±") + clock(addMin(dep, it.min)), W - P - 10, yy + 12);
    ctx.textAlign = "left";
    // strip
    var sx = P + 10, sw = W - P * 2 - 20, sy = yy + 40, rides = it.legs.filter(function (l) { return l.type !== "walk" && l.type !== "transfer"; });
    var tot = rides.reduce(function (a, l) { return a + Math.max(4, l.min); }, 0) || 1, gx = sx;
    rides.forEach(function (l) {
      var w = Math.max(90, (sw - (rides.length - 1) * 10) * Math.max(4, l.min) / tot);
      w = Math.min(w, sx + sw - gx);
      ctx.fillStyle = l.type === "ojol" ? "#00AA13" : lc(l); rr(ctx, gx, sy, w, 54, 16); ctx.fill();
      ctx.fillStyle = l.type === "ojol" ? "#fff" : textColor(lc(l)); ctx.font = "800 28px " + F; ctx.textAlign = "center";
      ctx.fillText(l.type === "ojol" ? tl("Ojol", "Ride") : l.line.code, gx + w / 2, sy + 37); ctx.textAlign = "left";
      gx += w + 10;
    });
    // langkah
    y = headH + sumH;
    var railX = P + 118;
    steps.forEach(function (st, i) {
      var top = y, nodeY = top + 44;
      // garis rel ke langkah berikutnya
      if (i < steps.length - 1) {
        var solid = st.kind === "ride";
        ctx.strokeStyle = solid ? st.color : "#89A2B8";
        ctx.lineWidth = solid ? 12 : 6;
        ctx.setLineDash(solid ? [] : [2, 14]); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(railX, nodeY); ctx.lineTo(railX, top + st.h + 44); ctx.stroke(); ctx.setLineDash([]);
      }
      if (st.time) { ctx.fillStyle = "#527089"; ctx.font = "600 28px " + F; ctx.textAlign = "right"; ctx.fillText(st.time, railX - 34, nodeY + 10); ctx.textAlign = "left"; }
      if (st.kind === "walk") {
        // ikon orang berjalan (bukan sekadar titik) supaya jelas ini langkah jalan kaki
        ctx.beginPath(); ctx.arc(railX, nodeY, 24, 0, Math.PI * 2); ctx.fillStyle = "#6E89A3"; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = "#EEF6FC"; ctx.stroke();
        ctx.save(); ctx.translate(railX, nodeY);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(2, -11, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 4.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(-1.5, 4); ctx.lineTo(-7, 13); ctx.stroke();      // badan + kaki belakang
        ctx.beginPath(); ctx.moveTo(-1.5, 4); ctx.lineTo(4, 8); ctx.lineTo(6, 14); ctx.stroke();        // kaki depan
        ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(0, -4); ctx.lineTo(6, 1); ctx.stroke();          // lengan
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(railX, nodeY, 17, 0, Math.PI * 2);
        ctx.fillStyle = st.kind === "dest" ? "#38BDF8" : "#fff"; ctx.fill();
        ctx.lineWidth = 8; ctx.strokeStyle = st.kind === "dest" ? "#38BDF8" : st.color; ctx.stroke();
      }
      var tx = railX + 44, ty = top + 56;
      if (st.badge) {
        ctx.font = "800 28px " + F; var bw = Math.max(70, ctx.measureText(st.badge).width + 30);
        ctx.fillStyle = st.color; rr(ctx, tx, ty - 38, bw, 48, 12); ctx.fill();
        ctx.fillStyle = textColor(st.color); ctx.textAlign = "center"; ctx.fillText(st.badge, tx + bw / 2, ty - 4); ctx.textAlign = "left";
        st.tl[0] && (ctx.font = "700 36px " + F, ctx.fillStyle = "#0F2740");
        // judul di samping lencana
        ctx.font = "700 36px " + F; ctx.fillStyle = "#0F2740";
        var t0 = wrap(ctx, st.title, W - P - tx - bw - 20)[0];
        ctx.fillText(t0, tx + bw + 18, ty);
        ty += 46;
      } else {
        ctx.font = (st.kind === "walk" ? "600 32px " : st.kind === "stop" ? "700 34px " : "800 38px ") + F; ctx.fillStyle = st.kind === "walk" ? "#527089" : "#0F2740";
        st.tl.forEach(function (ln) { ctx.fillText(ln, tx, ty); ty += 46; });
      }
      ctx.font = "500 30px " + F; ctx.fillStyle = "#527089";
      st.sl.forEach(function (ln) { ctx.fillText(ln, tx, ty); ty += 40; });
      y += st.h;
    });
    // kaki
    ctx.fillStyle = "#D5E5F2"; ctx.fillRect(P, H - footH, W - P * 2, 2);
    ctx.fillStyle = "#1565D8"; ctx.font = "800 32px " + F; ctx.fillText("✦ Lumi Transport", P, H - footH + 62);
    ctx.fillStyle = "#89A2B8"; ctx.font = "500 26px " + F;
    ctx.fillText(tl("Waktu & tarif perkiraan · cek info operator", "Times & fares are estimates · check operator info"), P, H - footH + 104);
    return c.toDataURL("image/png");
  }
  function shareTrip(it) {
    it = it && it.legs ? it : S.openTrip;
    if (!it) return;
    var go = function () {
      var url;
      try { url = tripImage(it); } catch (e) { url = null; }
      var text = tl("Rute ", "Route ") + S.from.name + " → " + S.to.name + tl(" · dibuat dengan Lumi Transport", " · made with Lumi Transport");
      if (url && NATIVE && NATIVE.shareImage) { NATIVE.shareImage(url, text); return; }
      if (url && navigator.canShare) {
        fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
          var f = new File([b], "rute-lumi.png", { type: "image/png" });
          if (navigator.canShare({ files: [f] })) return navigator.share({ files: [f], text: text });
          throw 0;
        }).catch(function () { download(url); });
        return;
      }
      if (url) { download(url); return; }
      var tx = tripText(it);
      if (NATIVE) NATIVE.share(tx); else { try { navigator.clipboard.writeText(tx); toast(tl("Rute disalin", "Route copied")); } catch (e) { toast(tx); } }
    };
    function download(url) { var a = document.createElement("a"); a.href = url; a.download = "rute-lumi.png"; document.body.appendChild(a); a.click(); a.remove(); toast("Gambar rute diunduh"); }
    toast("Membuat gambar rute…");
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 40px "PJS"'), document.fonts.load('500 30px "PJS"'), document.fonts.load('700 36px "PJS"')]) : Promise.resolve();
    ready.then(go, go);
  }
  window.__lumiTripImage = function (i) { return tripImage(S.results[i]); };   // untuk pengujian
  window.__lumiOpenTrip = function (it, f, t) { if (f) S.from = f; if (t) S.to = t; S.dep = S.dep || nowWib(); S.results = [colorize(it)]; openTrip(it); };   // untuk pengujian

  /* Pintasan dari app shortcut (tekan lama ikon) dan ubin Quick Settings. */
  window.__lumiShortcut = function (name) {
    try {
      if (name === "history") {
        setTab("info");
        openSettings();
        setTimeout(function () { var c = $("#settingsBody"); if (c) c.scrollTop = c.scrollHeight; }, 220);
      } else {
        var ss = $("#sheetSettings"); if (ss) ss.hidden = true;
        setTab("plan");
        setTimeout(function () {
          var f = name === "home" ? $("#inTo") : $("#inFrom");
          if (f) { f.focus(); f.select(); }
        }, 160);
      }
    } catch (e) { lumiLog(e); }
  };
  $("#btnShare").addEventListener("click", function () { shareTrip(S.openTrip); });
  $$("[data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest(".sheet").hidden = true; }); });

  /* ------------------------------------------------------- daftar rute */
  var FILTERS = [
    ["all", "Semua"], ["TJ", "Transjakarta"], ["TJNB", "TJ non-BRT"], ["KRL", "KRL"], ["MRT", "MRT"], ["LRT", "LRT"],
    ["MIKRO", "Mikrotrans"], ["ROYAL", "Royaltrans & Jabodetabek"], ["KABANDARA", tl("KA Bandara", "Airport Rail")], ["WHOOSH", "Whoosh"]
  ];
  function filterOk(l, f) {
    if (f === "all") return true;
    if (f === "TJ") return l.mode === "TJ" && l.brt;
    if (f === "TJNB") return l.mode === "TJ" && !l.brt;
    if (f === "LRT") return l.mode === "LRT" || l.mode === "LRTJ";
    return l.mode === f;
  }
  var ORDER = { TJ: 0, KRL: 2, MRT: 3, LRT: 4, LRTJ: 5, KABANDARA: 6, WHOOSH: 7, ROYAL: 8, MIKRO: 9 };
  function groupName(l) {
    if (l.mode === "TJ") {
      if (l.brt) return l.main ? "Transjakarta · koridor utama (24 jam)" : "Transjakarta · lintas koridor BRT";
      return { RUSUN: "Transjakarta · angkutan rusun", WISATA: "Transjakarta · bus wisata" }[l.cat] || "Transjakarta · angkutan pengumpan";
    }
    if (l.mode === "ROYAL") return l.cat === "JABODETABEK" ? "Transjabodetabek" : "Royaltrans";
    return MODES[l.mode].label;
  }
  // Urutan kelompok tetap (tiap kelompok punya peringkat sendiri, tidak saling bercampur).
  var GROUP_RANK = ["Transjakarta · koridor utama (24 jam)", "Transjakarta · lintas koridor BRT", "Transjakarta · angkutan pengumpan",
    "Transjakarta · angkutan rusun", "Transjakarta · bus wisata", "Mikrotrans", "Royaltrans", "Transjabodetabek"];
  function sortKey(l) {
    var gn = groupName(l), g = GROUP_RANK.indexOf(gn);
    if (g < 0) g = 20 + (ORDER[l.mode] != null ? ORDER[l.mode] : 15);
    var n = parseInt(String(l.code).replace(/\D/g, ""), 10); if (isNaN(n)) n = 999;
    return [g, n, l.code];
  }
  function cmp(a, b) { var x = sortKey(a), y = sortKey(b); for (var i = 0; i < 3; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; }

  function renderFilters() {
    $("#filters").innerHTML = FILTERS.map(function (f) { return '<button data-f="' + f[0] + '" class="' + (S.lineFilter === f[0] ? "is-on" : "") + '">' + f[1] + "</button>"; }).join("");
    $$("#filters button").forEach(function (b) { b.addEventListener("click", function () { S.lineFilter = b.dataset.f; renderLines(); }); });
  }
  function ends(l) {
    // Nama trayek resmi (mis. "Pinang Ranti - Simpang Cawang") lebih jelas daripada halte awal–akhir,
    // terutama untuk rute memutar yang awal dan akhirnya sama.
    if ((l.mode === "TJ" || l.mode === "MIKRO" || l.mode === "ROYAL") && / - /.test(l.name || "")) return esc(l.name).replace(" - ", " – ");
    if (l.dirs.length) {
      var d = l.dirs[0], a = d.s[0].n, b = d.s[d.s.length - 1].n;
      if (a === b) b = d.s[turnIndex(d)].n;
      return esc(a) + " – " + esc(b);
    }
    return esc(l.name).replace(" - ", " – ");
  }
  /* Label arah: "Arah <tujuan>"; untuk pola memutar pakai titik baliknya. */
  function dirName(d) {
    var a = d.s[0].n, b = d.s[d.s.length - 1].n;
    return a === b && d.s.length > 3 ? d.s[turnIndex(d)].n + tl(" (memutar)", " (loop)") : b;
  }
  function is24(l) { return l.hours && l.hours.length === 1 && l.hours[0][0] === 0 && l.hours[0][1] >= 1440; }
  function renderLines() {
    renderFilters();
    var q = $("#inLine").value;
    var list = planner.searchLines(q).filter(function (l) { return filterOk(l, S.lineFilter); });
    if (!q) list = list.slice().sort(cmp);
    var html = "", lastG = null;
    if (!list.length) html = '<div class="empty"><b>Rute tidak ditemukan</b>Coba kode seperti 9, 13C, JAK.10, atau nama halte/stasiun.</div>';
    list.forEach(function (l) {
      var g = q ? null : groupName(l);
      if (g && g !== lastG) { html += '<div class="l-group">' + esc(g) + "</div>"; lastG = g; }
      var d = l.dirs[0];
      html += '<button class="l-item" data-id="' + l.id + '">' + badge(l) + '<div class="l-main"><div class="l-name"><span class="l-nm">' + ends(l) + "</span>" + (is24(l) ? '<span class="l-24">24 jam</span>' : "") +
        '</div><div class="l-sub">' + esc(modeLabel(l)) + (d && d.s.length ? " · " + stopWord(d.s.length, RAIL[l.mode]) : "") + '</div></div></button>';
    });
    $("#lineList").innerHTML = html;
    $$("#lineList .l-item").forEach(function (b) { b.addEventListener("click", function () { openLine(planner.byId[b.dataset.id], 0); }); });
  }
  var lineT;
  $("#inLine").addEventListener("input", function () { clearTimeout(lineT); lineT = setTimeout(renderLines, 120); });

  /* ------------------------------------------------------- detail rute */
  var lineMap, lineLayer, lineBoard;
  function openLine(line, dirIndex) {
    if (!line) return;
    S.openLineObj = line; S.lineDir = dirIndex || 0;
    var sheet = $("#sheetLine"); sheet.hidden = false; raiseSheet(sheet);
    sheet.style.setProperty("--c", line.color);
    var fg = textColor(line.color);
    $("#lineHero").style.color = fg;
    $("#lineHero").innerHTML = '<div class="bar"><button class="back" data-close-line aria-label="Kembali"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>' +
      '<div class="hero-main"><div class="code">' + esc(line.code) + '</div><div><div class="mode">' + esc(modeLabel(line)) + '</div><div class="name">' + ends(line) + "</div></div></div>";
    $("[data-close-line]").addEventListener("click", function () { sheet.hidden = true; });
    if (!lineMap) lineMap = makeMap($("#lineMap"));
    paintLine();
  }
  var ICO_CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function hoursBox(line) {
    return '<div class="hours">' + ICO_CLOCK + "<div><b>" + tl("Jam operasional", "Operating hours") + "</b>" + esc(T(line.hoursText || "-")) +
      (line.mode === "TJ" || line.mode === "MIKRO" ? "" : "") + "</div></div>";
  }
  function paintLine() {
    var line = S.openLineObj, d = line.dirs[S.lineDir];
    $("#lineMap").hidden = !!line.noStops;
    if (line.noStops) {
      $("#lineBody").innerHTML = hoursBox(line) + '<div class="nostops"><b>' + esc(line.code) + " · " + esc(line.name) + "</b>" + esc(T(line.note)) +
        '<div class="btn-row"><button class="btn-sec" id="btnOfficial">Buka peta rute di transjakarta.co.id</button></div></div>';
      $("#btnOfficial").addEventListener("click", function () { openUrl("https://transjakarta.co.id/rute"); });
      return;
    }
    setTimeout(function () {
      lineMap.invalidateSize();
      if (lineLayer) lineLayer.remove();
      lineLayer = L.featureGroup().addTo(lineMap);
      var pts = d.shape && d.shape.length > 1 ? d.shape : d.s.map(function (s) { return s.p; });
      L.polyline(pts, { color: "#fff", weight: 9, opacity: .9 }).addTo(lineLayer);
      L.polyline(pts, { color: line.color, weight: 6 }).addTo(lineLayer);
      d.s.forEach(function (s, k) {
        var mk = L.marker(s.p, { icon: dotIcon("lm-stop", line.color) }).addTo(lineLayer);
        mk.bindTooltip(s.n, { className: "lm-tip", direction: "top", offset: [0, -6], permanent: k === 0 || k === d.s.length - 1 });
      });
      lineMap.fitBounds(lineLayer.getBounds(), { padding: [24, 24] });
    }, 60);
    var html = "";
    if (line.dirs.length > 1) {
      var labels = line.dirs.map(function (dd) { return tl("Arah ", "Towards ") + (dd.h === "Arah balik" && dd.s.length < 2 ? T(dd.h) : dirName(dd)); });
      html += '<div class="dir-toggle">' + line.dirs.map(function (dd, i) {
        var dup = !dd.v && labels.filter(function (x, j) { return x === labels[i] && !line.dirs[j].v; }).length > 1;
        var sub = dd.v ? T(dd.vs || (/Tol/.test(dd.v) ? "via Tol" : "pola lain")) : dup ? tl("dari ", "from ") + dd.s[0].n : "";
        return '<button data-dir="' + i + '" class="' + (i === S.lineDir ? "is-on" : "") + (dd.v ? " is-var" : "") + '">' + esc(labels[i]) +
          (sub ? '<small class="dv">' + esc(sub) + "</small>" : "") + "</button>";
      }).join("") + "</div>";
    }
    if (d.v) html += '<div class="warn">' + esc(T(d.v)) + "</div>";
    html += hoursBox(line);
    if (liveOk(line)) html += '<div class="live-card" id="lineLive"><div class="live-h"><b>Posisi bus langsung</b><span class="live-status" id="lineLiveSt">Menghubungkan…</span></div><ul class="bus-list" id="lineLiveList"></ul></div>';
    html += '<p class="line-note">' + esc(T(line.note || "")) + " " + stopWord(d.s.length, RAIL[line.mode]) + ". " +
      (RAIL[line.mode] ? tl("Ketuk stasiun untuk memakainya sebagai asal atau tujuan.", "Tap a station to use it as your origin or destination.")
        : tl("Ketuk halte untuk memakainya sebagai asal atau tujuan.", "Tap a stop to use it as your origin or destination.")) + "</p>";
    html += '<ol class="stops" style="--c:' + line.color + '">';
    d.s.forEach(function (s, k) {
      var conns = planner.connections(line, s.p);
      var major = conns.filter(function (c) { return RAIL[c.mode] || (c.mode === "TJ" && c.brt); });
      var other = conns.length - major.length;
      var connH = major.slice(0, 8).map(function (c) { return badge(c, "xs"); }).join("") +
        (other > 0 ? '<span class="s-num">+' + other + tl(" rute lain", other === 1 ? " other route" : " other routes") + "</span>" : "");
      html += '<li class="stop' + (k === 0 || k === d.s.length - 1 ? " term" : "") + '"><div class="rail"><i class="pin"></i></div><div class="s-body">' +
        '<div class="s-name">' + esc(s.n) + '<span class="s-num">' + (k + 1) + "</span></div>" +
        (connH ? '<div class="s-conn">' + connH + "</div>" : "") +
        '<div class="s-acts"><button class="btn-plan" data-from="' + k + '">Berangkat dari sini</button><button class="btn-plan" data-to="' + k + '">Pergi ke sini</button></div>' +
        "</div></li>";
    });
    html += "</ol>";
    var body = $("#lineBody"); body.innerHTML = tr(html); body.scrollTop = 0;
    $$(".stop", body).forEach(function (li) {
      li.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        $$(".stop.open", body).forEach(function (o) { if (o !== li) o.classList.remove("open"); });
        li.classList.toggle("open");
      });
    });
    $$("[data-dir]", body).forEach(function (b) { b.addEventListener("click", function () { S.lineDir = +b.dataset.dir; paintLine(); }); });
    if (lineBoard) { lineBoard.stop(); lineBoard = null; }
    if (liveOk(line)) {
      var endName = d.s[d.s.length - 1].n;
      var renderL = function () {
        if (!$("#lineLiveList")) return;
        var bs = Object.keys(lineBoard.buses).map(function (k) { return lineBoard.buses[k]; });
        // bus searah dengan arah yang dipilih ditaruh di atas
        bs.forEach(function (b) { b.same = nmKey(b.head) === nmKey(endName) || nmKey(b.head).indexOf(nmKey(endName)) >= 0; });
        bs.sort(function (a, b) { return (b.same - a.same) || (a.key < b.key ? -1 : 1); });
        $("#lineLiveSt").textContent = liveStatusText(LumiLive.state(), bs.length);
        $("#lineLiveList").innerHTML = bs.length ? bs.slice(0, 12).map(function (b) {
          var ns = nextStop(b);
          return '<li data-bus="' + esc(b.key) + '"><span class="bus-dot" style="--c:' + line.color + '"></span><div><b>' + tl("Menuju ", "Towards ") + esc(b.head || "-") + "</b><span>" +
            (ns ? tl("Berikutnya ", "Next ") + esc(ns.name) + " · " + fmtEta(ns.eta) : "Bus " + esc(b.key)) + "</span></div><em>" + esc(b.key) + "</em></li>";
        }).join("") : '<li class="muted">' + (LumiLive.state() === "connected" ? tl("Belum ada bus " + esc(line.code) + " yang mengirim posisi. Mungkin di luar jam operasi.", "No " + esc(line.code) + " bus is reporting its position yet. It may be outside operating hours.") :
          /error|reconnecting/.test(LumiLive.state()) ? tl("Belum bisa terhubung ke data armada.", "Can't connect to the fleet feed yet.") + (LumiLive.lastError() ? " (" + esc(LumiLive.lastError()) + ")" : "") + ' <button class="st-toggle" data-tjapp>' + tl("Buka aplikasi TJ", "Open the TJ app") + "</button>" :
          tl("Menghubungkan ke data armada…", "Connecting to the fleet feed…")) + "</li>";
        bindTjApp($("#lineLiveList"));
        $$("[data-bus]", $("#lineLiveList")).forEach(function (li) {
          li.addEventListener("click", function () { var b = lineBoard.buses[li.dataset.bus]; if (b) { lineMap.setView([b.lat, b.lon], 16); $("#lineBody").scrollTop = 0; } });
        });
      };
      var lT = null;
      lineBoard = new LiveBoard(lineMap, [line.code], function () { return line.color; }, function () { if (!lT) lT = setTimeout(function () { lT = null; renderL(); }, 700); });
      stopWhenHidden($("#sheetLine"), lineBoard);
      renderL();
    }
    $$("[data-from],[data-to]", body).forEach(function (b) {
      b.addEventListener("click", function () {
        var k = +(b.dataset.from || b.dataset.to), s = d.s[k], which = b.dataset.from !== undefined ? "from" : "to";
        setPoint(which, { name: s.n, p: s.p });
        $("#sheetLine").hidden = true; $("#sheetTrip").hidden = true; setTab("plan");
        if (S.from && S.to) runPlan(); else { S.field = which === "from" ? "to" : "from"; (which === "from" ? inTo : inFrom).focus(); }
      });
    });
  }

  /* ------------------------------------------------------- info tarif */
  function renderInfo() {
    function card(title, color, rows, note) {
      return '<div class="info-card"><h3><i class="info-swatch" style="background:' + color + '"></i><span>' + title + "</span></h3>" +
        rows.map(function (r) { return '<div class="fare-row"><span>' + r[0] + "</span><span>" + r[1] + "</span></div>"; }).join("") + (note ? "<p>" + note + "</p>" : "") + "</div>";
    }
    var c = DATA.meta.counts;
    var html = "";
    html += card("Jam operasional", "#1565D8", [
      ["Transjakarta koridor 1–14", "24 jam (AMARI 22.00–05.00)"], ["TJ lintas koridor & pengumpan", "05.00–22.00"],
      ["Mikrotrans JAK36, JAK47, JAK52, JAK75", "24 jam"], ["Mikrotrans lainnya", "05.00–22.00"],
      ["Royaltrans & Transjabodetabek", "±05.00–21.00"], ["KRL Commuter Line", "±04.00–24.00"],
      ["MRT Jakarta", "05.00–24.00"], ["LRT Jakarta", "05.30–00.20"], ["LRT Jabodebek", "±05.00–23.00"],
      [tl("KA Bandara", "Airport Rail"), "±05.00–23.00"], ["Whoosh", "±06.00–21.30"], [tl("Ojol", "Ride-hailing"), "24 jam"]],
      "Saat kamu memilih jam berangkat, Lumi hanya memakai moda yang beroperasi pada jam itu. Jadwal bisa berubah saat libur nasional.");
    // Angka tarif dari data/fares.json (R8); catatan berbahasa ganda ada di fares.notes.
    var F = E.fares(), note = function (k) { var n = (F.notes || {})[k]; return n ? tl(n.id, n.en) : ""; };
    var range2 = function (a) { return rp(a[0]) + "–" + rp(a[1]).replace("Rp", ""); };
    var prem = function (re) { var p = F.tj.premium.filter(function (x) { return x[0] === re; })[0]; return p ? rp(p[1]) : "–"; };
    html += card("Transjakarta", "#C1272D", [["BRT, non-BRT & Transjabodetabek (mis. T31, P11, SH1)", rp(F.tj.base)], ["Pukul 05.00–07.00", rp(F.tj.morning)],
      ["Pindah rute tanpa keluar halte", "Gratis"], ["Turun di luar halte lalu naik lagi", "Bayar lagi (tap ulang)"], ["SH2 Blok M – Bandara Soetta (sejak 1 Sep 2026)", prem("^SH2$")],
      ["Hub Connector HC2 PIK 2 – Dukuh Atas", prem("^HC\\d")], ["Royaltrans", rp(F.tj.royal)], ["Mikrotrans (JakLingko)", F.tj.mikro ? rp(F.tj.mikro) : "Gratis"]],
      note("tj"));
    html += card("KRL Commuter Line", "#E2231A", [["25 km pertama", rp(F.krl.base)], ["Tiap 10 km berikutnya", "+" + rp(F.krl.step)]], note("krl"));
    html += card("MRT Jakarta", "#0069B4", [["1 stasiun (mis. Lebak Bulus – Fatmawati)", rp(F.mrt.base + F.mrt.perStop)], ["Tiap stasiun berikutnya", "+" + rp(F.mrt.perStop)],
      ["Lebak Bulus – Blok M", rp(Math.min(F.mrt.max, F.mrt.base + 5 * F.mrt.perStop))], ["Maksimum (mis. Lebak Bulus – Bundaran HI)", rp(F.mrt.max)]]);
    html += card("LRT", "#2C9E8E", [["LRT Jakarta, termasuk Velodrome – Manggarai (flat)", rp(F.lrt.flat)], ["LRT Jabodebek, 1 km pertama", rp(F.lrtj.base)], ["LRT Jabodebek, per km berikutnya", "+" + rp(F.lrtj.perKm)],
      ["LRT Jabodebek, jam sibuk (Sen–Jum 06.00–08.59 & 16.00–19.59)", tl("maks. ", "max. ") + rp(F.lrtj.max)], ["LRT Jabodebek, di luar jam sibuk, Sabtu, Minggu & libur", tl("maks. ", "max. ") + rp(F.lrtj.offPeakMax)]],
      note("lrt"));
    html += card("KA Bandara & Whoosh", "#0F5E9C", [["KA Bandara Manggarai / BNI City / Duri – Soetta", rp(F.kaBandara.airportFar)], ["KA Bandara Rawa Buaya / Batu Ceper – Soetta", rp(F.kaBandara.airportNear)], ["KA Bandara Manggarai – BNI City", rp(F.kaBandara.city)], ["Whoosh Halim – Tegalluar/Padalarang", tl("mulai ", "from ") + rp(F.whoosh.from)]],
      note("rail"));
    html += card("Ojol (estimasi)", "#00AA13", [["Motor per km (zona Jabodetabek)", range2(F.ojol.motor.perKm)], ["Motor minimum (4 km pertama)", range2(F.ojol.motor.min)], ["Mobil per km (perkiraan)", range2(F.ojol.car.perKm)], ["Biaya jasa aplikasi", "±" + range2([F.ojol.motor.fee[0], F.ojol.car.fee[1]])]],
      note("ojol"));
    html += '<p class="info-upd">' + tl("Tarif diperbarui ", "Fares updated ") + esc(F.updated) + "</p>";
    html += '<div class="info-card src"><h3>Sumber data rute</h3><ul>' +
      "<li>Daftar & kode rute Transjakarta: <a data-url=\"https://transjakarta.co.id/rute\">transjakarta.co.id/rute</a> (diakses 10 Okt 2026).</li>" +
      (ROUTE_SRC.kind === "gtfs" ? "<li><b>Aktif:</b> " + (ROUTE_SRC.bundled ? tl("GTFS resmi Transjakarta " + esc(ROUTE_SRC.date) + ", bawaan aplikasi (" + ROUTE_SRC.count + " rute).", "official Transjakarta GTFS of " + esc(ROUTE_SRC.date) + ", built into the app (" + ROUTE_SRC.count + " routes).") : tl("GTFS resmi Transjakarta diunduh " + esc(ROUTE_SRC.date) + " (" + ROUTE_SRC.count + " rute).", "official Transjakarta GTFS downloaded " + esc(ROUTE_SRC.date) + " (" + ROUTE_SRC.count + " routes).")) + "</li>" : "") +
      "<li>Halte & rute BRT Transjakarta: GTFS resmi Transjakarta (unduhan 26 Jan 2024) via <a data-url=\"https://github.com/altilunium/BRT-tj\">altilunium/BRT-tj</a>.</li>" +
      "<li>Rute non-BRT, Mikrotrans, Royaltrans: GTFS Transjakarta 2021 via <a data-url=\"https://github.com/akherlan/transjakartagtfs\">akherlan/transjakartagtfs</a> — sebagian rute mungkin sudah berubah.</li>" +
      "<li>Koordinat stasiun KA: data sarana prasarana Kemenhub via <a data-url=\"https://github.com/Rebornian48/map-visualizer\">Rebornian48/map-visualizer</a>.</li>" +
      "<li>Urutan stasiun KRL, MRT, LRT, KA Bandara: Wikipedia & pengumuman operator (2026).</li>" +
      "<li>Peta: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors; pilihan Google Maps memakai kunci internal aplikasi Google Maps. Alamat: saran Google Places (kunci internal) dengan cadangan Photon/OSM. Jarak jalan untuk ojol: OSRM.</li></ul>" +
      "<p>" + tl("Data mencakup " + (c.TJ || 0) + " rute Transjakarta, " + (c.MIKRO || 0) + " Mikrotrans, " + (c.ROYAL || 0) + " Royaltrans, " + (c.KRL || 0) + " lintas KRL, MRT, " + ((c.LRT || 0) + (c.LRTJ || 0)) + " lintas LRT, KA Bandara, dan Whoosh.",
        "The data covers " + (c.TJ || 0) + " Transjakarta routes, " + (c.MIKRO || 0) + " Mikrotrans, " + (c.ROYAL || 0) + " Royaltrans, " + (c.KRL || 0) + " KRL lines, MRT, " + ((c.LRT || 0) + (c.LRTJ || 0)) + " LRT lines, Airport Rail and Whoosh.") + "</p></div>";
    $("#infoBody").innerHTML = tr(html);
    $$("#infoBody [data-url]").forEach(function (a) { a.addEventListener("click", function () { NATIVE ? NATIVE.openUrl(a.dataset.url) : window.open(a.dataset.url); }); });
  }

  /* Kartu Tentang (dipindah ke Pengaturan). */
  function aboutCardHTML() {
    return '<div class="set-card" id="aboutCard"><h3>Tentang Lumi</h3>' +
      '<p><b>Lumi Transport</b> v' + esc(appVersion()) + ". " + tl("Perencana rute bekerja offline di ponsel; internet hanya dipakai untuk peta, pencarian alamat, dan jarak jalan untuk estimasi ojol.",
        "Route planning works offline on the phone; the internet is only used for maps, address search and road distances for ride-hailing estimates.") + "</p>" +
      '<p>Lisensi <a data-url="https://github.com/VAMvicky/LumiTransport/blob/main/LICENSE">GPL-3.0</a> · <a data-url="https://github.com/VAMvicky/LumiTransport">Repo GitHub</a></p>' +
      '<p><button type="button" class="about-btn" id="btnUpdate">Cek update</button><button type="button" class="about-btn" id="btnReport">Laporkan masalah</button></p></div>';
  }

  /* ------------------------------------------------------- tentang, update, laporan */
  function appVersion() {
    try { if (NATIVE && NATIVE.versionName) { var v = NATIVE.versionName(); if (v && v !== "0") return v; } } catch (e) { lumiLog(e); }
    return "2.1";
  }
  function openExt(url) { if (NATIVE && NATIVE.openUrl) NATIVE.openUrl(url); else window.open(url); }

  function checkUpdate() {
    var btn = $("#btnUpdate");
    if (btn) { btn.disabled = true; btn.textContent = "Memeriksa…"; }
    var done = function () { if (btn) { btn.disabled = false; btn.textContent = tl("Cek update", "Check for updates"); } };
    http("https://api.github.com/repos/VAMvicky/LumiTransport/releases/latest", 12000).then(function (r) {
      var tag = (r && r.tag_name) || "";
      var cur = "v" + appVersion();
      if (!tag) { toast("Belum ada rilis untuk dibandingkan"); return; }
      if (tag === cur) { toast(tl("Lumi sudah versi terbaru (", "Lumi is up to date (") + cur + ")"); return; }
      toast(tl("Versi baru tersedia: ", "New version available: ") + tag);
      setTimeout(function () { openExt("https://github.com/VAMvicky/LumiTransport/releases/latest"); }, 900);
    }).catch(function () { toast("Tidak bisa memeriksa update (offline?)"); }).then(done);
  }

  function reportStopIssue() {
    var it = S.openTrip, v = appVersion();
    var lines = [], seen = {};
    if (it && it.legs) it.legs.forEach(function (l) {
      if (l.type === "ride" && l.line && !seen[l.line.code]) { seen[l.line.code] = 1; lines.push(l.line.code); }
    });
    var body = tl("### Halte / rute yang salah\n\n", "### Wrong stop / route\n\n") +
      tl("- Dari: ", "- From: ") + (S.from ? S.from.name + " (" + ((S.from.p || []).join(", ")) + ")" : "-") + "\n" +
      tl("- Ke: ", "- To: ") + (S.to ? S.to.name + " (" + ((S.to.p || []).join(", ")) + ")" : "-") + "\n" +
      (lines.length ? tl("- Rute: ", "- Routes: ") + lines.join(" · ") + "\n" : "") +
      tl("\n### Apa yang salah\n\n(halte tidak ada / urutan salah / tarif salah / lainnya)\n\n", "\n### What is wrong\n\n(missing stop / wrong order / wrong fare / other)\n\n") +
      tl("### Lingkungan\n", "### Environment\n") + "- Lumi Transport v" + v + "\n- " + (navigator.userAgent || "") + "\n";
    openExt("https://github.com/VAMvicky/LumiTransport/issues/new?title=" + encodeURIComponent("[halte/rute] ") + "&body=" + encodeURIComponent(body));
  }

  function reportIssue() {
    var v = appVersion();
    var body = tl("### Apa yang terjadi\n\n\n### Langkah mengulang\n1. \n2. \n\n### Lingkungan\n", "### What happened\n\n\n### Steps to reproduce\n1. \n2. \n\n### Environment\n") + "- Lumi Transport v" + v + "\n- " + (navigator.userAgent || "") + "\n";
    // R5: lampirkan galat terakhir (aplikasi web + crash Android) supaya laporan bisa ditindaklanjuti.
    var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var errs = (window.lumiErrors ? lumiErrors() : []).slice(-12);
    if (errs.length) {
      body += "\n<details><summary>" + tl("Galat terakhir", "Recent errors") + " (" + errs.length + ")</summary>\n\n```\n" + errs.map(function (x) {
        var d = wibOf(x.t); return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + (x.n > 1 ? " ×" + x.n : "") + " " + x.m + (x.a ? "  @" + x.a : "");
      }).join("\n") + "\n```\n</details>\n";
    }
    var crash = ""; try { crash = NATIVE && NATIVE.lastCrash ? NATIVE.lastCrash() : ""; } catch (e) { lumiLog(e); }
    if (crash) body += "\n<details><summary>" + tl("Crash terakhir (Android)", "Last crash (Android)") + "</summary>\n\n```\n" + crash.slice(0, 2500) + "\n```\n</details>\n";
    var url = "https://github.com/VAMvicky/LumiTransport/issues/new?title=" + encodeURIComponent("[v" + v + "] ") + "&body=";
    var enc = encodeURIComponent(body);
    if (enc.length > 7000) enc = encodeURIComponent(body.slice(0, 3000) + "\n…");   // batas panjang URL GitHub
    openExt(url + enc);
    try { if (crash && NATIVE.clearCrash) NATIVE.clearCrash(); } catch (e) { lumiLog(e); }
  }

  /* ------------------------------------------------------- pilih titik di peta */
  var pickMap, pickWhich, pickRevT, pickLabel = "";
  function openPicker(which, o) {
    o = o || {};
    pickWhich = which;
    var sh = $("#sheetPick"); sh.hidden = false;
    $("#pickTitle").textContent = o.title || (which === "from" ? tl("Pilih titik asal", "Pick the origin point") : tl("Pilih titik tujuan", "Pick the destination point"));
    $("#pickSaveChk").checked = !!o.save; $("#pickName").hidden = !o.save; $("#pickName").value = o.name || "";
    var start = o.center || (S[which] && S[which].p) || (S[which === "from" ? "to" : "from"] || {}).p || JKT;
    var zoom = o.zoom || (S[which] ? 17 : 13);
    if (!pickMap) {
      pickMap = makeMap($("#pickMap"));
      pickMap.on("movestart", function () { $("#pickAddr").textContent = tl("Melepas pin…", "Dropping pin…"); });
      pickMap.on("moveend", function () {
        clearTimeout(pickRevT);
        var c = pickMap.getCenter(), p = [+c.lat.toFixed(6), +c.lng.toFixed(6)];
        $("#pickAddr").textContent = p[0].toFixed(5) + ", " + p[1].toFixed(5);
        pickLabel = "";
        pickRevT = setTimeout(function () {
          reverse(p).then(function (nm) {
            var c2 = pickMap.getCenter();
            if (Math.abs(c2.lat - p[0]) < 1e-6 && Math.abs(c2.lng - p[1]) < 1e-6) { pickLabel = nm; $("#pickAddr").textContent = nm; }
          });
        }, 500);
      });
    }
    setTimeout(function () { pickMap.invalidateSize(); pickMap.setView(start, zoom); }, 60);
  }
  $("#pickSaveChk").addEventListener("change", function () { $("#pickName").hidden = !this.checked; if (this.checked) $("#pickName").focus(); });
  $("#pickMe").addEventListener("click", function () {
    toast(tl("Mencari lokasi…", "Finding location…"));
    locate().then(function (o) { pickMap.setView([o.lat, o.lon], 18); }).catch(function (e) { toast(e.message); });
  });
  $("#pickOk").addEventListener("click", function () {
    var c = pickMap.getCenter(), p = [+c.lat.toFixed(6), +c.lng.toFixed(6)];
    var custom = $("#pickName").value.trim();
    var name = custom || pickLabel || (tl("Titik ", "Point ") + p[0].toFixed(5) + ", " + p[1].toFixed(5));
    if ($("#pickSaveChk").checked) {
      if (!custom) { toast(tl("Isi nama tempat untuk menyimpan", "Enter a place name to save it")); $("#pickName").focus(); return; }
      savePlace({ name: custom, sub: pickLabel || tl("Tempat tersimpan", "Saved place"), p: p }); toast(tl("Tersimpan: ", "Saved: ") + custom);
    }
    $("#sheetPick").hidden = true;
    setPoint(pickWhich, { name: name, p: p });
    afterPick(pickWhich);
  });

  /* ------------------------------------------------------- pembaruan data rute (GTFS resmi) */
  var gtfsBusy = false;
  window.__lumiGtfs = function (state, msg, changes) {
    $$(".gtfs-status").forEach(function (el) { el.textContent = state === "error" ? tl("Gagal: ", "Failed: ") + msg : state === "done" ? tl("Selesai. Memuat ulang…", "Done. Reloading…") : msg; });
    if (state === "done") {
      store("gtfsDate", msg);
      if (changes > 0) toast(changes + tl(" rute Transjakarta berubah — lihat di beranda", changes === 1 ? " Transjakarta route changed — see the home screen" : " Transjakarta routes changed — see the home screen"));
      // Jangan muat ulang saat pengguna sedang memakai layar lain — termasuk layar sambutan:
      // muat ulang membuat beranda tampil sekilas lalu sambutan muncul lagi (berkedip).
      var onboarding = !!$("#onboard");
      var busyUser = onboarding || !$("#results").hidden || !$("#sheetTrip").hidden || !!S.guide;
      if (busyUser) { if (!changes && !onboarding) toast("Data rute resmi sudah diperbarui — berlaku saat aplikasi dibuka ulang"); gtfsBusy = false; }
      else setTimeout(function () { location.reload(); }, 800);
    }
    if (state === "error") { gtfsBusy = false; $$(".gtfs-btn").forEach(function (b) { b.disabled = false; }); }
  };
  function startGtfsUpdate() {
    if (!NATIVE || !NATIVE.updateGtfs) { toast("Pembaruan data hanya tersedia di aplikasi Android"); return; }
    if (gtfsBusy) return; gtfsBusy = true;
    $$(".gtfs-btn").forEach(function (b) { b.disabled = true; });
    $$(".gtfs-status").forEach(function (el) { el.textContent = "Menghubungi server Transjakarta…"; });
    NATIVE.updateGtfs();
  }
  function gtfsCardHTML(compact) {
    var updated = ROUTE_SRC.kind === "gtfs";
    return '<div class="gtfs-card"><b>' + (updated ? "Data rute: GTFS resmi Transjakarta" : "Perbarui rute Transjakarta") + "</b>" +
      "<p>" + (updated ? tl((ROUTE_SRC.bundled ? "Bawaan aplikasi, data " : "Diunduh ") + esc(ROUTE_SRC.date) + " · " + ROUTE_SRC.count + " rute. Lumi memeriksa data resmi secara berkala dan memberi tahu bila ada rute yang berubah.",
          (ROUTE_SRC.bundled ? "Built into the app, data of " : "Downloaded ") + esc(ROUTE_SRC.date) + " · " + ROUTE_SRC.count + " routes. Lumi checks the official data regularly and tells you when a route changes.") :
        "Data bawaan memakai halte BRT 2024 dan rute non-BRT 2021, sehingga sebagian rute (mis. 9H, T31, P11) belum ada/sesuai. Lumi mengunduh GTFS resmi Transjakarta otomatis; tekan tombol di bawah bila belum berhasil.") + "</p>" +
      '<button class="btn-go gtfs-btn">' + (updated ? "Perbarui lagi" : "Unduh data rute resmi") + '</button><div class="gtfs-status"></div></div>';
  }
  function renderGtfsBanner() {
    var el = $("#gtfsBanner");
    el.innerHTML = ROUTE_SRC.kind === "gtfs" ? "" : gtfsCardHTML(true);
    $$(".gtfs-btn", el).forEach(function (b) { b.addEventListener("click", startGtfsUpdate); });
    renderChangesCard();
    // Perbarui otomatis SETIAP HARI (juga dijadwalkan di latar belakang oleh Android).
    // Belum pernah berhasil → dicoba ulang tiap 6 jam.
    if (!NATIVE || !NATIVE.updateGtfs) return;
    var last = store("gtfsAutoTry") || 0, age = ROUTE_SRC.date ? (Date.now() - new Date(ROUTE_SRC.date + "T00:00:00").getTime()) / 86400000 : 999;
    if ((ROUTE_SRC.kind !== "gtfs" && Date.now() - last > 6 * 3600000) || (ROUTE_SRC.kind === "gtfs" && age >= 1 && Date.now() - last > 20 * 3600000)) {
      store("gtfsAutoTry", Date.now());
      setTimeout(startGtfsUpdate, 1500);
    }
  }

  /* ------------------------------------------------------- pengaturan */
  function openSettings() {
    $("#sheetSettings").hidden = false; raiseSheet($("#sheetSettings"));
    renderSettings();
  }

  function renderSettings(status) {
    var c = cfg(), places = savedPlaces();
    function st(k) { return status && status[0] === k ? '<div class="set-status ' + status[1] + '">' + esc(status[2]) + "</div>" : ""; }
    var cur = mapStyleKey();
    var html = gtfsCardHTML() + changesHistoryHTML() + '<div class="set-card"><h3>Peta</h3><p>' +
      tl("Bawaan gratis tanpa API key: <b>OpenFreeMap</b> (data OpenStreetMap). Pilihan <b>Google Maps</b> memakai kunci internal aplikasi Google Maps.",
        "The default is free with no API key: <b>OpenFreeMap</b> (OpenStreetMap data). The <b>Google Maps</b> option uses Google Maps' internal key.") + "</p>" +
      '<label class="set-field"><span>Gaya peta</span><select id="setMap">' + Object.keys(MAPSTYLES).map(function (k) {
        return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + esc(MAPSTYLES[k].name) + "</option>";
      }).join("") + "</select></label>" + (glOk() ? "" : '<p style="margin:6px 0 0">Perangkat ini tidak mendukung WebGL, jadi peta memakai OpenStreetMap standar.</p>') +
      st("map") + "</div>";
    html += '<div class="set-card"><h3>Mencari alamat</h3><p>' + tl("Ketik di kolom <b>Dari</b> atau <b>Ke</b> — saran alamat diambil langsung dari <b>Google Places</b> memakai kunci internal aplikasi Google Maps (paket + sertifikat Google ditiru). Ketuk baris pertama bila ingin mencari di aplikasi Google Maps lalu <b>Bagikan</b> ke <b>Lumi Transport</b>.",
      "Type in the <b>From</b> or <b>To</b> field — suggestions come straight from <b>Google Places</b> using Google Maps' own internal key (package + certificate are spoofed). Tap the first row to search inside Google Maps and <b>Share</b> the place back to <b>Lumi Transport</b>.") + "</p>" +
      '<label class="set-row"><span>' + tl("Saran alamat dari Google", "Address suggestions from Google") + '</span><input type="checkbox" id="setGsearch"' + (c.gsearch ? " checked" : "") + "></label>" +
      (window.LumiGoogle && LumiGoogle.isDown() ? '<p style="margin:6px 0 0">' + tl("Google menolak kunci ini (" + LumiGoogle.reason() + "). Saran alamat jatuh ke Photon/OpenStreetMap.",
        "Google rejected this key (" + LumiGoogle.reason() + "). Suggestions fall back to Photon/OpenStreetMap.") + "</p>" : "") +
      st("search") + "</div>";
    html += '<div class="set-card"><h3>Tempat tersimpan</h3><p>Tempat yang pernah kamu bagikan dari Google Maps. Muncul saat mengetik di kolom Dari/Ke.</p>' +
      (places.length ? places.map(function (pl, i) {
        return '<div class="place-row"><span class="sg-ico saved">' + ICO_STAR + '</span><div class="pm"><b>' + esc(pl.name) + "</b><span>" + esc(pl.sub || (pl.p[0].toFixed(5) + ", " + pl.p[1].toFixed(5))) + '</span></div><button data-del="' + i + '">Hapus</button></div>';
      }).join("") : '<p>Belum ada tempat tersimpan.</p>') + "</div>";
    html += historyCardHTML();
    html += favCardHTML();
    html += backupCardHTML();
    html += accessCardHTML();
    html += langCardHTML();
    html += aboutCardHTML();
    $("#settingsBody").innerHTML = tr(html);
    var aboutUp = $("#btnUpdate"), aboutRep = $("#btnReport");
    if (aboutUp) aboutUp.addEventListener("click", checkUpdate);
    if (aboutRep) aboutRep.addEventListener("click", reportIssue);
    $$("#settingsBody [data-url]").forEach(function (a) { a.addEventListener("click", function () { openExt(a.dataset.url); }); });
    var langSel = $("#setLang");
    if (langSel) langSel.addEventListener("change", function () {
      var c = cfg(); c.lang = this.value === "en" ? "en" : "id"; store("cfg", c);
      try { NATIVE && NATIVE.setLang && NATIVE.setLang(c.lang); } catch (e) { lumiLog(e); }
      // Muat ulang halaman supaya semua layar (termasuk yang sudah dirender) ikut berganti bahasa.
      try {
        sessionStorage.setItem("lumi:reopen", "lang");
        // B9: rute yang sedang dicari ikut dipulihkan setelah muat ulang.
        sessionStorage.setItem("lumi:reopenPlan", JSON.stringify({ from: S.from, to: S.to, time: S.time, results: !$("#results").hidden }));
      } catch (e) { lumiLog(e); }
      location.reload();
    });
    var btnBackup = $("#btnBackup"), btnRestore = $("#btnRestore");
    if (btnBackup) btnBackup.addEventListener("click", doBackup);
    if (btnRestore) btnRestore.addEventListener("click", doRestore);
    var accBox = $("#setAccess");
    if (accBox) accBox.addEventListener("change", function () {
      var c = cfg(); c.accessible = !!this.checked; store("cfg", c); applyAccessible();
      renderSettings(["access", "ok", this.checked ? "Mode aksesibel aktif." : "Mode aksesibel dimatikan."]);
    });
    var voiceBox = $("#setVoice");
    if (voiceBox) voiceBox.addEventListener("change", function () {
      var c = cfg(); c.voice = !!this.checked; store("cfg", c);
      if (!this.checked) { try { NATIVE && NATIVE.stopSpeak && NATIVE.stopSpeak(); } catch (e) { lumiLog(e); } }
      renderSettings(["voice", "ok", this.checked ? "Panduan suara aktif." : "Panduan suara dimatikan."]);
    });
    var gsearchBox = $("#setGsearch");
    if (gsearchBox) gsearchBox.addEventListener("change", function () {
      var c = cfg(); c.gsearch = !!this.checked; store("cfg", c);
      if (this.checked) { if (window.LumiGoogle) LumiGoogle.reset(); }
      renderSettings(["search", "ok", this.checked ? tl("Saran alamat Google aktif.", "Google address suggestions on.") : tl("Saran alamat Google dimatikan.", "Google address suggestions off.")]);
    });
    var clearTrips = $("#btnClearTrips");
    if (clearTrips) clearTrips.addEventListener("click", function () { store("trips", []); renderSettings(["trips", "ok", "Riwayat perjalanan dihapus."]); });
    var saveFavBtn = $("#btnSaveFav");
    if (saveFavBtn) saveFavBtn.addEventListener("click", saveFav);
    $$("[data-fav]", $("#settingsBody")).forEach(function (b) { b.addEventListener("click", function () { useFav(+b.dataset.fav); }); });
    $$("[data-favdel]", $("#settingsBody")).forEach(function (b) { b.addEventListener("click", function () { delFav(+b.dataset.favdel); }); });
    $$(".gtfs-btn", $("#settingsBody")).forEach(function (b) { b.addEventListener("click", startGtfsUpdate); });
    bindChangeLinks($("#settingsBody"));
    $$("[data-show]", $("#settingsBody")).forEach(function (b) {
      b.addEventListener("click", function () { var i = $("#" + b.dataset.show); i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "Lihat" : "Sembunyi"; });
    });
    $("#setMap").addEventListener("change", function () {
      var c = cfg(); c.basemap = this.value; store("cfg", c);
      applyBasemap();
      renderSettings(["map", "ok", tl("Gaya peta diganti: ", "Map style changed: ") + T(MAPSTYLES[this.value].name) + "."]);
      if (this.value === "google" && window.LumiGoogle && LumiGoogle.isDown()) toast(tl("Kunci Google ditolak — peta bisa tetap kosong.", "Google key rejected — the map may stay blank."));
    });
    $$("[data-del]", $("#settingsBody")).forEach(function (b) { b.addEventListener("click", function () { deletePlace(+b.dataset.del); renderSettings(); }); });
  }
  $("#btnSettings").addEventListener("click", openSettings);

  /* Perbarui koreksi titik halte (OpenStreetMap) dan tarif dari GitHub, paling sering tiap 3 hari.
   * Isi diperiksa (ukuran, bentuk, rentang) sebelum disimpan; dipakai sejak aplikasi dibuka berikutnya. */
  (function refreshRemoteData() {
    var last = 0; try { last = +localStorage.getItem("lumi:stopfixAt") || 0; } catch (e) { lumiLog(e); }
    if (Date.now() - last < 3 * 864e5) return;
    var BASE = "https://raw.githubusercontent.com/VAMvicky/LumiTransport/main/data/";
    function fetchJson(name, maxBytes) {
      return http(BASE + name, 20000, null, true).then(function (r) {
        if (r.status !== 200) throw new Error(name + ": HTTP " + r.status);
        if (!r.body || r.body.length > maxBytes) throw new Error(name + ": ukuran tidak wajar");
        return JSON.parse(r.body);
      });
    }
    setTimeout(function () {
      try { localStorage.setItem("lumi:stopfixAt", String(Date.now())); } catch (e) { lumiLog(e); }
      fetchJson("stop_fix.json", 3000000).then(function (j) {
        if (!validStopFix(j)) throw new Error("stop_fix.json tidak valid");
        try { localStorage.setItem("lumi:stopfix", JSON.stringify(j)); } catch (e) { lumiLog(e); }
      }).catch(function (e) { lumiLog(e, "stopfix"); });
      fetchJson("fares.json", 100000).then(function (f) {
        if (!validFares(f)) throw new Error("fares.json tidak valid");
        try { localStorage.setItem("lumi:fares", JSON.stringify(f)); } catch (e) { lumiLog(e); }
      }).catch(function (e) { lumiLog(e, "fares"); });
    }, 8000);
  })();

  /* ------------------------------------------------------- lokasi dibagikan dari Google Maps */
  window.lumiShared = function (text) {
    text = String(text || "").trim();
    if (!text) return;
    var urlM = text.match(/https?:\/\/\S+/);
    var lines = text.replace(/https?:\/\/\S+/g, "").split(/\n+/).map(function (x) { return x.trim().replace(/^["“]|["”]$/g, ""); }).filter(Boolean);
    var name = lines[0] || tl("Lokasi dari Google Maps", "Location from Google Maps");
    var sh = $("#sheetShare"); sh.hidden = false;
    $("#shareIco").innerHTML = ICO_STAR;
    $("#shareName").textContent = name; $("#shareSub").textContent = tl("Membaca lokasi dari tautan…", "Reading location from the link…");
    $("#shareFrom").disabled = $("#shareTo").disabled = true;
    var direct = parseCoords(text);
    // Aplikasi menambahkan "ll=lat,lon" di akhir URL hanya bila koordinat TEMPAT ditemukan.
    function resolvedLL(u) { var m = String(u || "").match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)$/); return m ? [+m[1], +m[2]] : null; }
    var getP = direct ? Promise.resolve({ p: direct, url: text }) :
      (urlM ? resolveUrl(urlM[0]).then(function (u) { return { p: NATIVE ? resolvedLL(u) : parseCoords(u), url: u }; }) : Promise.resolve({ p: null }));
    // Kolom tujuan (Dari/Ke) yang sedang diisi saat pengguna membuka Google Maps dari Lumi.
    var st0 = store("shareTarget");
    var target = S.shareTarget || (st0 && st0.w && Date.now() - st0.t < 20 * 60000 ? st0.w : null);
    getP.then(function (r) {
      if (!lines.length && r.url) { var nm0 = placeNameFromUrl(r.url); if (nm0) { name = nm0; $("#shareName").textContent = nm0; } }
      if (target && r.p) {                       // lokasi tempat terbaca tepat → langsung dipakai
        sh.hidden = true; $$(".sheet").forEach(function (x) { x.hidden = true; }); setTab("plan");
        var sub0 = lines.slice(1).join(", ") || tl("Dari Google Maps", "From Google Maps");
        savePlace({ name: name, sub: sub0, p: r.p });
        S.shareTarget = null; store("shareTarget", null);
        setPoint(target, { name: name, p: r.p });
        toast(tl("Lokasi dari Google Maps: ", "Location from Google Maps: ") + name);
        afterPick(target);
        return;
      }
      if (target && !r.p) {
        sh.hidden = true; setTab("plan"); S.shareTarget = null; store("shareTarget", null);
        openPicker(target, { name: name, save: true, title: tl("Letakkan pin di ", "Place the pin at ") + name, center: S.myPos || JKT, zoom: 15 });
        $("#pickAddr").textContent = tl("Koordinat tidak terbaca dari tautan — geser pin ke lokasinya", "Couldn't read coordinates from the link — drag the pin to the place");
        return;
      }
      if (!r.p) {
        $("#shareSub").textContent = tl("Koordinat tidak terbaca dari tautan. Pilih titiknya di peta (nama sudah terisi).", "Couldn't read coordinates from the link. Pick the point on the map (the name is already filled in).");
        $("#shareFrom").disabled = $("#shareTo").disabled = false;
        var pickFor = function (which) {
          sh.hidden = true; setTab("plan");
          openPicker(which, { name: name, save: true, title: tl("Letakkan pin di ", "Place the pin at ") + name, center: S.myPos || JKT, zoom: 15 });
        };
        $("#shareFrom").onclick = function () { pickFor("from"); };
        $("#shareTo").onclick = function () { pickFor("to"); };
        return;
      }
      if (lines.length < 1) { var nm = r.url && placeNameFromUrl(r.url); if (nm) { name = nm; $("#shareName").textContent = nm; } }
      var sub = lines.slice(1).join(", ") || (r.p[0].toFixed(5) + ", " + r.p[1].toFixed(5));
      $("#shareSub").textContent = sub;
      $("#shareFrom").disabled = $("#shareTo").disabled = false;
      function use(which) {
        sh.hidden = true; $$(".sheet").forEach(function (x) { x.hidden = true; }); setTab("plan"); S.shareTarget = null;
        if ($("#shareSave").checked) savePlace({ name: name, sub: sub, p: r.p });
        setPoint(which, { name: name, p: r.p });
        afterPick(which);
      }
      $("#shareFrom").onclick = function () { use("from"); };
      $("#shareTo").onclick = function () { use("to"); };

    });
  };

  /* ------------------------------------------------------- tombol kembali */
  window.lumiBack = function () {
    if ($("#onboard")) return false;   // layar sambutan belum selesai: tombol kembali menutup aplikasi, tidak melewatinya
    if ($("#gpsAsk")) { var w0 = gpsWait; gpsWait = null; closeGpsAsk(); if (w0) w0.reject(new Error("GPS belum aktif")); return true; }
    if (!$("#sheetTime").hidden) { $("#sheetTime").hidden = true; return true; }
    if (!$("#sheetShare").hidden) { $("#sheetShare").hidden = true; return true; }
    if ($("#sheetStop") && !$("#sheetStop").hidden) { $("#sheetStop").hidden = true; return true; }
    // Tutup lembar yang paling atas (yang terakhir dibuka), mis. Info rute di atas Pengaturan.
    var open = $$("#app > .sheet").filter(function (x) { return !x.hidden; });
    if (open.length) { open[open.length - 1].hidden = true; return true; }
    if (!$("#suggest").hidden) { hideSuggest(); document.activeElement && document.activeElement.blur(); return true; }
    if (S.tab !== "plan") { setTab("plan"); return true; }
    if (!$("#results").hidden) { $("#results").hidden = true; $("#planIntro").hidden = false; renderIntro(); return true; }
    return false;
  };

  /* ------------------------------------------------------- layar sambutan (pertama kali dibuka) */
  var OB_LOGO = '<img src="img/icon.png" alt="Lumi Transport">';
    '<circle cx="54" cy="54" r="52" fill="url(#obg)"/><path d="M42,38 L42,60 Q42,70 52,70 L68,70" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
    '<circle cx="42" cy="38" r="7" fill="#1565D8" stroke="#fff" stroke-width="5"/><circle cx="68" cy="70" r="13" fill="#fff" fill-opacity=".33"/><circle cx="68" cy="70" r="8" fill="#fff"/>' +
    '<path d="M70,30 L72.6,36.4 L79,39 L72.6,41.6 L70,48 L67.4,41.6 L61,39 L67.4,36.4 Z" fill="#fff"/></svg>';
  var OB_ICO = {
    route: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    nav: '<svg viewBox="0 0 24 24"><path d="M12 2.5 4.5 20.5 12 16.5l7.5 4z" fill="currentColor"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 5 13.5h6L10 22l8-11.5h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#34C27A"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#0B2545" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function permState() {
    try { if (NATIVE && NATIVE.permState) return JSON.parse(NATIVE.permState()); } catch (e) { lumiLog(e); }
    return { loc: false, notif: false, battery: false, oem: true, browser: true };
  }
  function showOnboarding(step) {
    var ob = $("#onboard");
    if (!ob) { ob = document.createElement("div"); ob.id = "onboard"; ob.className = "ob"; $("#app").appendChild(ob); }
    if (step === 1) {
      ob.innerHTML = '<div class="ob-top"><div class="ob-hero">' + OB_LOGO + '</div><h1 class="ob-title">Lumi Transport</h1>' +
        '<p class="ob-lead">Semua transportasi Jabodetabek dalam satu rute: Transjakarta, Mikrotrans, KRL, MRT, LRT, sampai ojol.</p></div>' +
        '<ul class="ob-feats">' +
        '<li><span class="ob-ico">' + OB_ICO.route + '</span><div><b>Semua kombinasi rute</b><span>Tercepat, termurah, atau minim transit, lengkap dengan tarif dan waktu tiba.</span></div></li>' +
        '<li><span class="ob-ico">' + OB_ICO.nav + '</span><div><b>Pendampingan GPS</b><span>Tahu posisimu, sisa pemberhentian, dan diingatkan saat harus turun.</span></div></li>' +
        '<li><span class="ob-ico">' + OB_ICO.bell + '</span><div><b>Rute selalu terbaru</b><span>Data resmi Transjakarta dicek berkala, kamu diberi tahu bila ada rute berubah.</span></div></li>' +
        '</ul><div class="ob-bottom"><button class="ob-cta" id="obNext" type="button">Mulai</button>' +
        '<p class="ob-foot">Alamat dicari lewat Google Maps lalu dibagikan ke Lumi. Lokasimu hanya disimpan di HP ini.</p></div>';
      $("#obNext").addEventListener("click", function () { store("onboarded", 1); showOnboarding(2); });
      return;
    }
    var p = permState();
    // Lokasi, notifikasi, dan latar belakang wajib diizinkan sebelum masuk ke layar utama.
    // "Mulai otomatis" (OEM) tidak bisa dideteksi, jadi tetap opsional.
    var allOk = !!(p.loc && p.notif && p.battery) || !!p.browser;
    function item(key, ico, title, desc, ok, opt) {
      return '<button class="ob-item' + (ok ? " ok" : "") + (opt ? " opt" : "") + '" data-perm="' + key + '" type="button" aria-pressed="' + !!ok + '">' +
        '<span class="ob-ico">' + (ok ? OB_ICO.ok : ico) + '</span><div><b>' + title + (opt ? '<i class="ob-opt">opsional</i>' : "") + "</b>" +
        '<span class="' + (ok ? "ob-ok" : "") + '">' + (ok ? "✓ Sudah diizinkan" : desc) + "</span></div></button>";
    }
    ob.innerHTML = '<div class="ob-head"><span class="ob-mini">' + OB_LOGO + '</span><h1 class="ob-title sm">Satu langkah lagi</h1></div>' +
      '<p class="ob-lead left">Izinkan agar Lumi bisa mendampingi perjalanan dan memberi tahu saat harus turun.</p>' +
      '<div class="ob-list">' +
      item("loc", OB_ICO.pin, "Izinkan lokasi", "Untuk “Lokasi saya” dan pendampingan GPS.", p.loc) +
      item("notif", OB_ICO.bell, "Izinkan notifikasi", "Peringatan turun dan info rute berubah.", p.notif) +
      item("battery", OB_ICO.bolt, "Berjalan di latar belakang", "Agar pendampingan tetap jalan saat layar mati.", p.battery) +
      (p.oem ? '<div class="ob-oem"><div class="ob-oem-h"><b>Xiaomi, Oppo, Vivo, Realme, Infinix</b><i class="ob-opt">opsional</i></div>' +
        '<span>Aktifkan “Mulai otomatis” agar Lumi tidak ditutup oleh HP.</span>' +
        '<button class="ob-oem-btn" id="obAuto" type="button">Buka pengaturan Mulai otomatis</button></div>' : "") +
      '</div><div class="ob-bottom"><button class="ob-cta' + (allOk ? "" : " is-locked") + '" id="obDone" type="button" aria-disabled="' + !allOk + '">Mulai cari rute</button>' +
      '<p class="ob-foot" id="obNeed"' + (allOk ? " hidden" : "") + '>Izinkan ketiga akses di atas dulu untuk melanjutkan.</p></div>';
    $$("[data-perm]", ob).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("ok")) return;
        if (!NATIVE || !NATIVE.requestPerm) { toast("Izin diatur di aplikasi Android"); return; }
        NATIVE.requestPerm(b.dataset.perm);
      });
    });
    if ($("#obAuto")) $("#obAuto").addEventListener("click", function () { if (NATIVE && NATIVE.openAutostart) NATIVE.openAutostart(); else toast("Hanya di aplikasi Android"); });
    $("#obDone").addEventListener("click", function () {
      var q = permState();
      if (!(q.loc && q.notif && q.battery) && !q.browser) {
        // Status izin bisa berubah tanpa layar ini dirender ulang; selalu cek ulang saat diketuk.
        showOnboarding(2);
        var first = $("[data-perm]:not(.ok)", $("#onboard"));
        if (first) { first.classList.add("is-shake"); setTimeout(function () { first.classList.remove("is-shake"); }, 600); }
        toast("Izinkan lokasi, notifikasi, dan latar belakang dulu");
        return;
      }
      store("onboarded", 2); ob.remove();
    });
  }
  window.__lumiPerm = function () { if ($("#onboard") && $("#obDone")) showOnboarding(2); };
  var obStage = store("onboarded");
  if (obStage !== 2) showOnboarding(obStage === 1 ? 2 : 1);
  document.documentElement.classList.remove("ob-pending");

  var inStopEl = $('#inStop');
  if (inStopEl) inStopEl.addEventListener('input', function () { renderStops(this.value); });
  applyAccessible();
  applyLang();
  // Setelah ganti bahasa (halaman dimuat ulang), kembali ke kartu Bahasa di Pengaturan.
  try {
    if (sessionStorage.getItem("lumi:reopen") === "lang") {
      sessionStorage.removeItem("lumi:reopen");
      var rp0 = JSON.parse(sessionStorage.getItem("lumi:reopenPlan") || "null");
      sessionStorage.removeItem("lumi:reopenPlan");
      if (rp0) {
        if (rp0.time) S.time = rp0.time;
        if (rp0.from) setPoint("from", rp0.from);
        if (rp0.to) setPoint("to", rp0.to);
        if (rp0.results && S.from && S.to) setTimeout(runPlan, 50);
      }
      if (store("onboarded") === 2) {
        openSettings();
        setTimeout(function () { var sel = $("#setLang"); if (sel) sel.closest(".set-card").scrollIntoView({ block: "center" }); toast(tl("Bahasa disetel ke Indonesia.", "Language set to English.")); }, 120);
      }
    }
  } catch (e) { lumiLog(e); }
  syncTimeChip();
  renderIntro();
  renderGtfsBanner();
  try { var pend = NATIVE && NATIVE.takeShared && NATIVE.takeShared(); if (pend) window.lumiShared(pend); } catch (e) { lumiLog(e); }
  // Pendampingan yang masih berjalan (mis. setelah aplikasi dibuka ulang dari notifikasi).
  try {
    var gs = NATIVE && NATIVE.guideState && NATIVE.guideState();
    if (gs) { compass(true); var sg0 = store("guide"); S.guide = sg0 ? { title: sg0.title, names: sg0.names } : { names: [] }; var st0 = JSON.parse(gs); renderGuide(st0.title ? st0 : { title: "Pendampingan berjalan", text: "Menunggu posisi GPS…", stopsLeft: -1, metersLeft: -1 }); }
    else store("guide", null);
  } catch (e) { lumiLog(e); }
  try { var op = NATIVE && NATIVE.takeOpen && NATIVE.takeOpen(); if (op) window.lumiOpen(op); } catch (e) { lumiLog(e); }
})();
