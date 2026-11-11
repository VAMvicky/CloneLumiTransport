/*
 * Lumi Transport — posisi bus langsung (Transjakarta, Mikrotrans, Royaltrans).
 *
 * Sumber: feed MQTT publik armada Transjakarta lewat WebSocket:
 *   wss://mqtt.tj.co.id:8084/mqtt   topik /mobile_armada/{koridor}/{kode_rute}/{trip}/{nomor_bus}
 * Isi pesan (JSON): latitude/longitude (+ snap_*), bearing, route_code, route_long_name,
 * route_color, trip_headsign, bus_body_no, passengers_status, stops[{name, eta, ...}],
 * eta_by_parent_stop_id, timestamp, dll.
 *
 * PENTING (temuan v2.4): broker hanya mengizinkan koneksi anonim bila client ID diawali
 * "mqttjs_" — sama seperti klien mqtt.js yang dipakai aplikasi resmi TJ. Client ID lain
 * dijawab CONNACK kode 5 ("not authorized"). Versi Lumi yang memakai "lumi_..." karena itu
 * selalu gagal, dan fitur ini sempat dihapus. Jangan ubah awalan itu.
 *
 * Klien MQTT 3.1.1 minimal (CONNECT, SUBSCRIBE/UNSUBSCRIBE QoS 0, PUBLISH masuk, PINGREQ).
 * Di Android koneksinya native (LiveSocket.java) supaya tidak bergantung WebSocket WebView;
 * pesan rute yang tidak diminta dibuang di sisi native.
 *
 * Langganan: mula-mula per rute (hemat kuota). Bila server memutus koneksi setelah langganan
 * per rute (tanpa sempat mengirim data), Lumi SEMENTARA beralih ke topik umum "/mobile_armada/#"
 * dan menyaring sendiri. v2.15: mode umum itu tidak lagi disimpan permanen — hanya berlaku di
 * memori selama 30 menit (lalu 2 jam, maks. 6 jam bila per rute gagal lagi), setelah itu Lumi
 * mencoba per rute lagi. Begitu per rute berhasil menerima data, tenggatnya kembali ke awal.
 */
(function (root) {
  "use strict";
  var URL = "wss://mqtt.tj.co.id:8084/mqtt";
  var ALL = "/mobile_armada/#";
  var enc = new TextEncoder(), dec = new TextDecoder();

  function str(s) { var b = enc.encode(s); return [b.length >> 8, b.length & 255].concat(Array.prototype.slice.call(b)); }
  function remLen(n) { var out = []; do { var d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; }
  function packet(type, body) { return new Uint8Array([type].concat(remLen(body.length), body)); }
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(t) { var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function norm(c) { return String(c || "").toUpperCase().replace(/[.\s-]/g, ""); }
  /* Awalan client ID yang diterima broker (lihat catatan di atas). */
  function clientId() { return "mqttjs_" + Math.random().toString(16).slice(2, 10); }
  var NATIVE = function () { return root.LumiNative && root.LumiNative.liveOpen ? root.LumiNative : null; };

  var ws = null, connected = false, buf = new Uint8Array(0), bufOff = 0, pid = 1, pingT = null, retryT = null, retryMs = 2000;
  var watchers = [];        // { want: {KODE:1}, codes: [...], fn }
  var active = {};          // topik yang sedang dilanggan di koneksi ini
  var statusFns = [];
  var state = "idle", lastMsgAt = 0, lastError = "", phase = "", bytesWeb = 0, gotData = false;
  /* Cadangan topik umum: sementara saja (lihat catatan di atas). allUntil = tenggat (ms),
     allStep = berapa kali per rute gagal berturut-turut (menentukan lama cadangan berikutnya). */
  var ALL_MS = [30 * 60000, 2 * 3600000, 6 * 3600000];
  var allUntil = 0, allStep = 0, allT = null;
  // Versi lama menyimpan mode umum selamanya di sini; bersihkan supaya per rute dicoba lagi.
  try { localStorage.removeItem("lumi:liveAll"); } catch (e) { lumiLog(e); }
  function allMode() { return allUntil > Date.now(); }
  function enterAllMode() {
    allUntil = Date.now() + ALL_MS[Math.min(allStep, ALL_MS.length - 1)];
    allStep++;
    clearTimeout(allT);
    // Saat tenggat lewat, langganan ditukar kembali ke per rute (tanpa memutus koneksi).
    allT = setTimeout(function () { allUntil = 0; syncSubs(); }, allUntil - Date.now() + 50);
  }

  function setState(s) { state = s; statusFns.forEach(function (f) { try { f(s); } catch (e) { lumiLog(e); } }); }
  function send(u8) {
    if (ws === "native") { var n = NATIVE(); if (n) n.liveSend(b64(u8)); return; }
    if (ws && ws.readyState === 1) ws.send(u8);
  }
  function subscribeTopic(t) { var id = (pid++ & 0xffff) || 1; send(packet(0x82, [id >> 8, id & 255].concat(str(t), [0]))); }
  function unsubscribeTopic(t) { var id = (pid++ & 0xffff) || 1; send(packet(0xA2, [id >> 8, id & 255].concat(str(t)))); }

  /* Topik untuk satu kode rute; Mikrotrans bisa ditulis "JAK36" atau "JAK.36" di feed. */
  function topicsFor(code) {
    var c = String(code), m = c.match(/^JAK\.?(\d+\w*)$/i);
    return m ? ["/mobile_armada/+/JAK" + m[1] + "/#", "/mobile_armada/+/JAK." + m[1] + "/#"] : ["/mobile_armada/+/" + c + "/#"];
  }
  function wantedTopics() {
    var t = {};
    if (!watchers.length) return t;
    if (allMode()) { t[ALL] = 1; return t; }
    watchers.forEach(function (w) { w.codes.forEach(function (c) { topicsFor(c).forEach(function (x) { t[x] = 1; }); }); });
    return t;
  }
  function wantedCodes() { var o = {}; watchers.forEach(function (w) { Object.keys(w.want).forEach(function (k) { o[k] = 1; }); }); return Object.keys(o); }
  /* Samakan langganan dengan kebutuhan pemantau + perbarui saringan native. */
  function syncSubs() {
    var n = NATIVE();
    if (n && n.liveFilter) n.liveFilter(JSON.stringify(wantedCodes()));
    if (!connected) return;
    var want = wantedTopics();
    var leftAll = !!active[ALL] && !want[ALL], added = false;
    Object.keys(active).forEach(function (t) { if (!want[t]) { unsubscribeTopic(t); delete active[t]; } });
    Object.keys(want).forEach(function (t) { if (!active[t]) { subscribeTopic(t); active[t] = 1; added = true; } });
    // Kembali dari topik umum ke per rute: anggap koneksi ini belum terbukti menerima data per rute,
    // supaya pemutusan berikutnya dikenali sebagai "per rute ditolak" dan cadangan dipakai lagi.
    if (leftAll) gotData = false;
    if (added) phase = "sub";
  }

  /* Aliran byte → paket MQTT. v2.15: dibaca dengan offset (bufOff), bukan buf.slice() per paket
     yang menyalin sisa buffer berulang kali (O(n²) untuk banyak pesan dalam satu potongan). */
  function onBytes(u8) {
    var rest = buf.length - bufOff;
    if (rest <= 0) { buf = u8; bufOff = 0; }
    else { var nb = new Uint8Array(rest + u8.length); nb.set(buf.subarray(bufOff)); nb.set(u8, rest); buf = nb; bufOff = 0; }
    for (;;) {
      var o = bufOff;
      if (buf.length - o < 2) break;
      var mult = 1, len = 0, i = o + 1, d, whole = true;
      do { if (i >= buf.length) { whole = false; break; } d = buf[i++]; len += (d & 127) * mult; mult *= 128; } while (d & 128);
      if (!whole || buf.length < i + len) break;
      var type = buf[o] >> 4, flags = buf[o] & 15, body = buf.subarray(i, i + len);
      bufOff = i + len;
      if (type === 2) {                        // CONNACK
        if (body[1] === 0) { connected = true; phase = "connack"; retryMs = 2000; active = {}; lastError = ""; setState("connected"); syncSubs(); }
        else { lastError = lt("ditolak server (kode CONNACK ", "rejected by server (CONNACK code ") + body[1] + ")"; setState("error"); }
      } else if (type === 9) {                 // SUBACK
        for (var k = 2; k < body.length; k++) if (body[k] === 0x80) lastError = lt("langganan topik ditolak server", "topic subscription rejected by server");
      } else if (type === 3) {                 // PUBLISH
        var tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl)), p = 2 + tl;
        var qos = (flags >> 1) & 3;
        if (qos > 0) { var pi = [body[p], body[p + 1]]; p += 2; send(new Uint8Array([0x40, 2, pi[0], pi[1]])); }
        var msg;
        try { msg = JSON.parse(dec.decode(body.subarray(p))); } catch (e) { continue; }
        lastMsgAt = Date.now(); gotData = true; phase = "data";
        if (!allMode()) allStep = 0;           // per rute terbukti jalan: cadangan berikutnya kembali singkat
        var rc = norm(msg.route_code || topic.split("/")[3]);
        watchers.forEach(function (w) { if (w.want[rc]) { try { w.fn(msg, topic); } catch (e) { lumiLog(e); } } });
      }
    }
    // Buang bagian yang sudah dibaca sesekali saja (bukan per paket).
    if (bufOff > 0 && bufOff >= buf.length) { buf = new Uint8Array(0); bufOff = 0; }
    else if (bufOff > 65536) { buf = buf.slice(bufOff); bufOff = 0; }
  }

  function onOpen() {
    phase = "ws";
    var cid = clientId();
    var vh = str("MQTT").concat([4, 0x02, 0, 60]);
    send(packet(0x10, vh.concat(str(cid))));
    clearInterval(pingT);
    pingT = setInterval(function () { send(new Uint8Array([0xC0, 0])); }, 45000);
  }
  var PHASE_TXT = { "": "sebelum tersambung", ws: "sebelum login MQTT", connack: "setelah login", sub: "setelah berlangganan rute", data: "saat menerima data" };
  var PHASE_EN = { "": "before connecting", ws: "before MQTT login", connack: "after login", sub: "after subscribing to routes", data: "while receiving data" };
  function lt(id, en) { var I = root.LumiI18n; return I && I.en ? en : id; }
  function onClosed(reason) {
    var ph = phase;
    ws = null; connected = false; buf = new Uint8Array(0); bufOff = 0; clearInterval(pingT); active = {};
    lastError = (reason || lt("koneksi terputus", "connection lost")) + " · " + ((root.LumiI18n && root.LumiI18n.en ? PHASE_EN[ph] : PHASE_TXT[ph]) || ph);
    // Server memutus setelah langganan per rute (koneksi ini belum menerima data) → SEMENTARA pakai
    // topik umum seperti klien publik lain; setelah tenggat, per rute dicoba lagi (enterAllMode).
    if (ph === "sub" && !gotData && !allMode()) {
      enterAllMode();
      retryMs = 500;
    }
    if (watchers.length) { setState("reconnecting"); scheduleRetry(); } else setState("idle");
  }
  function connect() {
    if (ws || !watchers.length) return;
    setState("connecting"); phase = ""; gotData = false;   // gotData berlaku per koneksi
    var n = NATIVE();
    if (n) { ws = "native"; if (n.liveFilter) n.liveFilter(JSON.stringify(wantedCodes())); n.liveOpen(Live.url); return; }
    try { ws = new WebSocket(Live.url, ["mqtt"]); } catch (e) { ws = null; lastError = String(e.message || e); scheduleRetry(); return; }
    ws.binaryType = "arraybuffer";
    ws.onopen = onOpen;
    ws.onmessage = function (ev) { bytesWeb += ev.data.byteLength || 0; onBytes(new Uint8Array(ev.data)); };
    ws.onerror = function () { };
    ws.onclose = function (ev) { onClosed(lt("WebSocket ditutup (kode ", "WebSocket closed (code ") + ev.code + ")"); };
  }
  function scheduleRetry() { clearTimeout(retryT); retryT = setTimeout(connect, retryMs); retryMs = Math.min(30000, retryMs * 1.7); }
  function disconnect() {
    clearTimeout(retryT);
    if (ws) {
      try { send(new Uint8Array([0xE0, 0])); } catch (e) { lumiLog(e); }
      if (ws === "native") { var n = NATIVE(); if (n) n.liveClose(); } else { try { ws.close(); } catch (e) { lumiLog(e); } }
    }
    ws = null; connected = false; active = {}; clearInterval(pingT); setState("idle");
  }

  var Live = {
    url: URL,
    norm: norm,
    state: function () { return state; },
    lastError: function () { return lastError; },
    allMode: function () { return allMode(); },
    allModeUntil: function () { return allUntil; },
    bytes: function () { var n = NATIVE(); try { return n && n.liveBytes ? +n.liveBytes() : bytesWeb; } catch (e) { return bytesWeb; } },
    // dipanggil dari MainActivity (koneksi native)
    __nativeOpen: function () { if (ws === "native") onOpen(); },
    __nativeData: function (arr) { if (ws !== "native") return; for (var i = 0; i < arr.length; i++) onBytes(unb64(arr[i])); },
    __nativeClose: function (reason) { if (ws === "native") onClosed(reason || "koneksi terputus"); },
    lastMsgAt: function () { return lastMsgAt; },
    onStatus: function (f) { statusFns.push(f); return function () { statusFns = statusFns.filter(function (x) { return x !== f; }); }; },
    /* Pantau beberapa kode rute; fn(msg, topic) dipanggil untuk tiap pesan rute itu. Mengembalikan fungsi berhenti. */
    watch: function (codes, fn) {
      var w = { want: {}, codes: codes.slice(), fn: fn };
      codes.forEach(function (c) { w.want[norm(c)] = 1; });
      watchers.push(w);
      syncSubs();
      connect();
      var stopped = false;
      return function stop() {
        if (stopped) return; stopped = true;
        watchers = watchers.filter(function (x) { return x !== w; });
        if (!watchers.length) disconnect(); else syncSubs();
      };
    }
  };
  /* =====================================================================
   * Bagian 2 — REST TJ: token tamu, daftar halte, dan ETA yang presisi.
   *
   * Feed MQTT sudah membawa `stops[]` + `eta_by_parent_stop_id`, tetapi kunci
   * ETA itu adalah ID halte (mis. "B08302P"), sedangkan data rute Lumi hanya
   * menyimpan nama dan koordinat halte. Jadi ID halte dicari sekali lewat
   * GET /v1/bus-stop?latitude=…&longitude=… (titik halte itu sendiri), lalu
   * dipakai untuk membaca ETA — jauh lebih tepat daripada mencocokkan nama.
   *
   * Endpoint REST butuh token tamu (POST /v1/auth/login/guest, tanpa akun).
   * Di Android permintaan lewat jembatan native (tanpa urusan CORS); di
   * browser memakai fetch biasa.
   * ===================================================================== */
  var API = "https://tijeapi.transjakarta.co.id";
  var DEV_KEY = "lumi:liveDev", TOK_KEY = "lumi:liveTok", EXP_KEY = "lumi:liveTokExp";
  var liveCb = {}, liveSeq = 0, hooked = false;

  /* Sambungkan callback HTTP native ke antrean kita (app.js memakai nama yang sama). */
  function hookHttp() {
    if (hooked) return;
    hooked = true;
    var prev = root.__lumiHttp;
    root.__lumiHttp = function (id, status, body) {
      var cb = liveCb[id];
      if (cb) { delete liveCb[id]; cb(status, body); return; }
      if (prev) prev(id, status, body);
    };
  }

  function devId() {
    var d = null;
    try { d = localStorage.getItem(DEV_KEY); } catch (e) { lumiLog(e); }
    if (!d) {
      d = "";
      for (var i = 0; i < 16; i++) d += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
      try { localStorage.setItem(DEV_KEY, d); } catch (e) { lumiLog(e); }
    }
    return d;
  }

  /* Versi klien TJ yang dikirim di x-app-version. Satu sumber: gradle.properties (lumi.tjClientVersion)
     → BuildConfig (native) dan js/build.js (browser); bisa ditimpa dari data/remote_config.json
     tanpa rilis baru bila TJ menaikkan versi minimum klien. */
  function tjClientVersion() {
    var n = NATIVE();
    try { if (n && n.tjClientVersion) { var v = n.tjClientVersion(); if (v) return v; } } catch (e) { lumiLog(e); }
    try { var rc = JSON.parse(localStorage.getItem("lumi:remoteCfg") || "null"); if (rc && /^\d+(\.\d+){1,3}$/.test(rc.tjClientVersion || "")) return rc.tjClientVersion; } catch (e) { lumiLog(e); }
    var B = root.LUMI_BUILD;
    return (B && B.tjClientVersion) || "0";
  }
  function baseHeaders() {
    return { "Accept": "application/json", "x-app-version": tjClientVersion(), "x-app-os": "android",
      "x-app-os-version": "12", "x-app-platform": "32", "x-lang": "en", "x-device-id": devId() };
  }

  function request(method, path, body, extra) {
    var url = API + path, h = baseHeaders(), k;
    if (extra) for (k in extra) h[k] = extra[k];
    if (body != null) h["Content-Type"] = "application/json";
    return new Promise(function (resolve, reject) {
      var n = NATIVE();
      if (n && n.httpPost) {
        hookHttp();
        var id = "lv" + (++liveSeq);
        liveCb[id] = function (status, b) {
          if (!status) reject(new Error(String(b || lt("jaringan gagal", "network error"))));
          else if (status >= 400) reject(new Error("HTTP " + status));
          else resolve(b);
        };
        try {
          if (method === "GET") n.httpH(id, url, JSON.stringify(h));
          else n.httpPost(id, url, JSON.stringify(h), body == null ? "" : body);
        } catch (e) { delete liveCb[id]; reject(e); }
        return;
      }
      var opt = { method: method, headers: h };
      if (body != null) opt.body = body;
      fetch(url, opt).then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) reject(new Error("HTTP " + r.status));
          else resolve(t);
        });
      }).catch(reject);
    });
  }

  function jwtExp(t) {
    try {
      var p = String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      return +JSON.parse(atob(p)).exp || 0;
    } catch (e) { return 0; }
  }

  var tok = null, tokExp = 0, tokPromise = null;
  function token() {
    var now = Math.floor(Date.now() / 1000);
    if (tok && tokExp - 120 > now) return Promise.resolve(tok);
    if (!tok) {
      try { tok = localStorage.getItem(TOK_KEY); tokExp = +localStorage.getItem(EXP_KEY) || 0; } catch (e) { lumiLog(e); }
      if (tok && tokExp - 120 > now) return Promise.resolve(tok);
    }
    if (tokPromise) return tokPromise;
    tokPromise = request("POST", "/v1/auth/login/guest", JSON.stringify({ device_id: devId() }))
      .then(function (body) {
        var j = JSON.parse(body);
        if (!j || !j.token) throw new Error(lt("token tamu kosong", "empty guest token"));
        tok = j.token;
        tokExp = jwtExp(tok) || now + 3600;
        try { localStorage.setItem(TOK_KEY, tok); localStorage.setItem(EXP_KEY, String(tokExp)); } catch (e) { lumiLog(e); }
        return tok;
      });
    tokPromise.then(function () { tokPromise = null; }, function () { tokPromise = null; });
    return tokPromise;
  }

  function forgetToken() { tok = null; tokExp = 0; try { localStorage.removeItem(TOK_KEY); localStorage.removeItem(EXP_KEY); } catch (e) { lumiLog(e); } }

  function apiGet(path, retry) {
    return token().then(function (t) {
      return request("GET", path, null, { "Authorization": "Bearer " + t });
    }).then(function (body) {
      return JSON.parse(body);
    }, function (e) {
      if (!retry && /HTTP 401/.test(String(e && e.message))) { forgetToken(); return apiGet(path, true); }
      throw e;
    });
  }

  /* Daftar halte terdekat (dengan ID) untuk satu titik. */
  var stopCache = {};
  function nmk(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function nearbyStops(lat, lon) {
    var k = (+lat).toFixed(4) + "," + (+lon).toFixed(4);
    if (stopCache[k]) return Promise.resolve(stopCache[k]);
    return apiGet("/v1/bus-stop?latitude=" + lat + "&longitude=" + lon).then(function (j) {
      var list = (j.data || []).map(function (s) {
        return { id: s.stop_id, name: s.stop_name, lat: +s.stop_lat, lon: +s.stop_lon, dist: +s.distance };
      });
      stopCache[k] = list;
      return list;
    });
  }

  /* ID halte untuk koordinat sebuah halte rute: yang terdekat, diutamakan yang namanya sama. */
  var idCache = {};
  function stopIdFor(lat, lon, name) {
    var k = (+lat).toFixed(5) + "," + (+lon).toFixed(5);
    if (k in idCache) return Promise.resolve(idCache[k]);
    return nearbyStops(lat, lon).then(function (list) {
      if (!list || !list.length) return null;
      var nk = nmk(name), pick = list[0];
      for (var i = 0; i < list.length && i < 6; i++) {
        var sk = nmk(list[i].name);
        if (nk && sk && (sk === nk || sk.indexOf(nk) >= 0 || nk.indexOf(sk) >= 0)) { pick = list[i]; break; }
      }
      idCache[k] = pick.id;
      return pick.id;
    }).catch(function () { return null; });   // gagal (mis. offline): jangan disimpan, coba lagi nanti
  }

  function idxOfStop(b, id) {
    for (var i = 0; i < b.stops.length; i++) {
      var s = b.stops[i];
      if (s.parent_stop_id === id || s.stop_id === id) return i;
    }
    return -1;
  }

  /* ETA (menit) bus ke halte `fromId`, hanya bila bus masih akan melewati `toId` sesudahnya. */
  function etaFor(b, fromId, toId) {
    if (!fromId || !b || !b.stops) return null;
    var fi = idxOfStop(b, fromId);
    if (fi < 0) return null;                       // halte sudah dilewati / bukan jalur bus ini
    if (toId) {
      var ti = idxOfStop(b, toId);
      if (ti < 0 || ti <= fi) return null;         // arah salah
    }
    var m = b.etaMap ? +b.etaMap[fromId] : NaN;
    if (!isFinite(m)) m = +b.stops[fi].eta;
    return isFinite(m) ? m : null;
  }

  /* ---- notifikasi "bus makin dekat" ---- */
  /* Tingkat per bus: 1 = ±10 mnt, 2 = ±5 mnt, 3 = ±2 mnt, 4 = tiba. */
  var ALERTS = {};
  function levelFor(m) { return m <= 0 ? 4 : m <= 2 ? 3 : m <= 5 ? 2 : m <= 10 ? 1 : 0; }
  function alertMsg(key, code, stop, busKey, mins) {
    var lvl = levelFor(mins), st = ALERTS[key];
    if (!st) st = ALERTS[key] = {};
    var prev = st[busKey];
    if (prev === undefined) {
      // Bus ini baru terlihat: hanya beri tahu bila sudah dekat sekali.
      if (Object.keys(st).length > 40) st = ALERTS[key] = {};
      st[busKey] = lvl;
      if (lvl < 3) return null;
    } else {
      if (lvl <= prev) return null;
      st[busKey] = lvl;
    }
    var I = root.LumiI18n, en = !!(I && I.en);
    var when = en ? (lvl >= 4 ? "has arrived" : lvl === 3 ? "is ±2 min away" : lvl === 2 ? "is ±5 min away" : "is ±10 min away")
      : (lvl >= 4 ? "sudah tiba" : lvl === 3 ? "±2 menit lagi" : lvl === 2 ? "±5 menit lagi" : "±10 menit lagi");
    return { level: lvl,
      title: "Bus " + code + (lvl >= 4 ? (en ? " arriving" : " tiba") : (en ? " approaching" : " mendekat")),
      text: "Bus " + code + " " + when + (en ? " at " : " di ") + stop + " (" + busKey + ")" };
  }

  function notify(title, text) {
    var n = root.LumiNative;
    if (n && n.busNotify) { try { n.busNotify(title, text); return "native"; } catch (e) { lumiLog(e); } }
    try {
      if (root.Notification && root.Notification.permission === "granted") { new root.Notification(title, { body: text }); return "web"; }
    } catch (e) { lumiLog(e); }
    return null;
  }

  Live.tjClientVersion = tjClientVersion;
  Live.token = token;
  Live.stops = nearbyStops;
  Live.stopIdFor = stopIdFor;
  Live.etaFor = etaFor;
  Live.alert = alertMsg;
  Live.levelFor = levelFor;
  Live.clearAlerts = function () { ALERTS = {}; };
  Live.notify = notify;

  root.LumiLive = Live;
})(typeof window !== "undefined" ? window : this);
