/* =============================================================================
 * Lumi — lapisan Google.
 *
 * Kunci di bawah diekstrak dari APK Google Maps (lihat docs/google-api-keys.md).
 * Kuncinya dibatasi ke aplikasi Google Maps, jadi setiap permintaan membawa dua
 * header tiruan supaya lolos pembatasan:
 *
 *     X-Android-Package: com.google.android.apps.maps
 *     X-Android-Cert:    <SHA-1 sertifikat penandatangan Google Maps>
 *
 * Permintaan JSON lewat jembatan native (LumiNative.httpH) karena
 * maps.googleapis.com tidak mengirim header CORS sehingga fetch/XHR dari
 * halaman file:// akan ditolak. Gambar (Static Maps) lewat <img> dan headernya
 * dipasang oleh shouldInterceptRequest di MainActivity.
 *
 * Yang dipakai di sini: Place Autocomplete, Place Details, Place Query/Nearby/
 * Text Search, dan Static Maps untuk gambar rute yang dibagikan. Directions,
 * Geocoding, dan Timezone ditolak (API-nya tidak diaktifkan pada proyek Google
 * pemilik kunci).
 * ========================================================================== */
var LumiGoogle = (function () {
  "use strict";

  /* Kunci dari res/values/strings.xml APK Google Maps — Places + Static Maps. */
  var KEY = "AIzaSyAwL-YrZb2V2cHyiT40jAXVFYDqlqs41gs";
  var PKG = "com.google.android.apps.maps";
  var CERT = "38918A453D07199354F8B19AF05EC6562CED5788";
  var HEADERS = { "X-Android-Package": PKG, "X-Android-Cert": CERT };
  var API = "https://maps.googleapis.com/maps/api/";
  var ATTR = 'Peta &copy; <a href="https://www.google.com/maps" target="_blank">Google</a>';

  var httpFn = null;   // diisi app.js: fungsi http(url, timeout, headers)
  var down = null;     // alasan kunci berhenti dipakai, atau null

  function bind(fn) { httpFn = fn; }

  /*
   * Kegagalan dicatat PER KEMAMPUAN, bukan satu saklar. Dulu satu
   * REQUEST_DENIED dari endpoint mana pun mematikan seluruh lapisan Google —
   * termasuk autocomplete yang sehat. Sekarang tiap kemampuan punya statusnya
   * sendiri, dan OVER_QUERY_LIMIT hanya menidurkan sementara (cooldown
   * berlipat), bukan mematikan permanen.
   */
  var CAPS = ["autocomplete", "details", "search", "nearby"];
  var fault = {};                       // cap -> { why, until, n }; until 0 = permanen
  var COOL_BASE = 60000, COOL_MAX = 15 * 60000;
  function capKey(cap) { return CAPS.indexOf(cap) >= 0 ? cap : "autocomplete"; }
  function blocked(cap) {
    var c = capKey(cap), f = fault[c];
    if (!f) return false;
    if (!f.until) return true;          // kunci/izin ditolak: permanen
    if (Date.now() < f.until) return true;
    delete fault[c];                    // cooldown habis: boleh dicoba lagi
    return false;
  }
  function isDown(cap) {
    if (cap) return blocked(cap);
    return CAPS.every(function (c) { return blocked(c); });
  }
  function reason(cap) {
    if (!cap) {
      for (var i = 0; i < CAPS.length; i++) if (fault[CAPS[i]]) return reason(CAPS[i]);
      return null;
    }
    var f = fault[capKey(cap)];
    if (!f) return null;
    if (!f.until) return f.why;
    return f.why + " (" + Math.ceil((f.until - Date.now()) / 1000) + " dtk)";
  }
  function markDown(cap, why, status) {
    var c = capKey(cap), f = fault[c];
    var n = (f && f.n ? f.n : 0) + 1;
    var soft = status === "OVER_QUERY_LIMIT" || status === "UNKNOWN_ERROR";
    fault[c] = soft
      ? { why: why, until: Date.now() + Math.min(COOL_MAX, COOL_BASE * Math.pow(2, n - 1)), n: n }
      : { why: why, until: 0, n: n };
    try {
      console.warn("[lumi] Google/" + c + ": " + why + (soft ? " (cooldown)" : " (berhenti)"));
    } catch (e) { /* diam */ }
  }
  function reset(cap) {
    if (cap) delete fault[capKey(cap)];
    else fault = {};
  }

  function build(path, params) {
    var out = [], k;
    for (k in params) {
      if (params[k] === undefined || params[k] === null || params[k] === "") continue;
      out.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    }
    out.push("key=" + KEY);
    return API + path + "?" + out.join("&");
  }

  function call(path, params, ms, cap) {
    if (blocked(cap)) return Promise.reject(new Error(reason(cap)));
    if (!httpFn) return Promise.reject(new Error("jembatan HTTP belum siap"));
    return httpFn(build(path, params), ms || 9000, HEADERS).then(function (j) {
      if (!j) throw new Error("jawaban kosong");
      if (j.status === "OK" || j.status === "ZERO_RESULTS") return j;
      if (j.status === "REQUEST_DENIED" || j.status === "OVER_QUERY_LIMIT" ||
          j.status === "INVALID_REQUEST" || j.status === "UNKNOWN_ERROR") {
        markDown(cap, j.status + (j.error_message ? ": " + j.error_message : ""), j.status);
      }
      var e = new Error(j.error_message || j.status || "permintaan ditolak");
      e.status = j.status;
      throw e;
    });
  }

  /* ------------------------------------------------- sesi & cache place_id */

  /*
   * Satu sesi ketik = satu sessiontoken: Places menagih satu sesi autocomplete
   * + satu Details sebagai satu unit, bukan satu panggilan per ketukan.
   * Sesi ditutup setelah Details dipakai.
   */
  var sess = null, sessAt = 0;
  function sessionToken() {
    var now = Date.now();
    if (!sess || now - sessAt > 120000) {          // v2.20: sesi menganggur >2 mnt dianggap selesai
      sess = "lumi-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      sessAt = now;
    }
    return sess;
  }
  function endSession() { sess = null; sessAt = 0; }

  /* place_id -> koordinat di localStorage: panggilan berulang tidak perlu
     menyentuh Google lagi. Cache hanya bonus; penuh/gagal = dilewati. */
  var CACHE_KEY = "lumi:pcache", CACHE_TTL = 30 * 86400000, CACHE_MAX = 400;
  function cacheAll() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function cacheGet(id) {
    var c = cacheAll()[id];
    if (!c || !c.p || (Date.now() - (c.ts || 0)) > CACHE_TTL) return null;
    return { name: c.name || "", sub: c.sub || "", p: c.p };
  }
  function cachePut(id, d) {
    try {
      var c = cacheAll();
      c[id] = { name: d.name, sub: d.sub, p: d.p, ts: Date.now() };
      var keys = Object.keys(c);
      if (keys.length > CACHE_MAX) {
        keys.sort(function (a, b) { return (c[a].ts || 0) - (c[b].ts || 0); });
        for (var i = 0; i < keys.length - CACHE_MAX; i++) delete c[keys[i]];
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) { /* kuota penuh / mode privat: cache dilewati */ }
  }

  /* ---------------------------------------------------------------- Places */

  /* Saran alamat (Place Autocomplete). Dipusatkan di sekitar titik acuan. */
  function autocomplete(q, near) {
    var p = near || [-6.2, 106.83];
    return call("place/autocomplete/json", {
      input: q,
      language: "id",
      components: "country:id",
      location: p[0].toFixed(6) + "," + p[1].toFixed(6),
      radius: 50000,
      sessiontoken: sessionToken()
    }, 9000, "autocomplete").then(function (j) {
      return (j.predictions || []).map(function (x) {
        var f = x.structured_formatting || {};
        return { id: x.place_id, name: f.main_text || x.description || "", sub: f.secondary_text || x.description || "" };
      }).filter(function (x) { return !!x.id; });
    });
  }

  /* Koordinat & nama satu tempat dari place_id (cache dulu, baru Google). */
  function details(id) {
    var hit = cacheGet(id);
    if (hit) { endSession(); return Promise.resolve(hit); }
    return call("place/details/json", {
      place_id: id,
      fields: "name,geometry,formatted_address,vicinity",
      language: "id",
      sessiontoken: sessionToken()
    }, 9000, "details").then(function (j) {
      var r = j.result || {}, loc = r.geometry && r.geometry.location;
      if (!loc) throw new Error("tempat tanpa koordinat");
      var d = { name: r.name || "", sub: r.formatted_address || r.vicinity || "", p: [loc.lat, loc.lng] };
      cachePut(id, d);
      return d;
    }).then(function (d) { endSession(); return d; },
            function (e) { endSession(); throw e; });
  }

  /* Cari tempat dengan kata bebas (Place Text Search) — cadangan bila autocomplete kosong. */
  function search(q, near) {
    var p = near || [-6.2, 106.83];
    return call("place/textsearch/json", {
      query: q, language: "id", region: "id",
      location: p[0].toFixed(6) + "," + p[1].toFixed(6), radius: 50000
    }, 9000, "search").then(function (j) {
      return (j.results || []).map(function (x) {
        var loc = x.geometry && x.geometry.location;
        return loc ? { id: x.place_id, name: x.name || "", sub: x.formatted_address || x.vicinity || "", p: [loc.lat, loc.lng] } : null;
      }).filter(Boolean);
    });
  }

  /* Halte/stasiun di sekitar titik (Place Nearby Search) untuk mode halte terdekat. */
  function nearby(loc, type, radius) {
    return call("place/nearbysearch/json", {
      location: loc[0].toFixed(6) + "," + loc[1].toFixed(6),
      radius: radius || 1500,
      type: type || "transit_station",
      language: "id"
    }, 9000, "nearby").then(function (j) {
      return (j.results || []).map(function (x) {
        var g = x.geometry && x.geometry.location;
        return g ? { id: x.place_id, name: x.name || "", sub: x.vicinity || "", p: [g.lat, g.lng] } : null;
      }).filter(Boolean);
    });
  }

  /* ------------------------------------------------------------------ peta */

  /* URL satu gambar Static Maps yang berpusat di (lat,lng) pada zoom z. */
  function staticUrl(lat, lng, z, size, scale) {
    var px = size || 256;
    return API + "staticmap?center=" + lat.toFixed(7) + "," + lng.toFixed(7) +
      "&zoom=" + Math.max(0, Math.min(20, Math.round(z))) +
      "&size=" + px + "x" + px + "&scale=" + (scale || 1) +
      "&language=id&sensor=false&key=" + KEY;
  }

  /* Web Mercator: derajat -> piksel dunia pada zoom z, dan sebaliknya. */
  function project(lat, lng, z) {
    var s = 256 * Math.pow(2, z);
    var sin = Math.sin(lat * Math.PI / 180);
    return [(lng + 180) / 360 * s,
            (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
  }
  function unproject(x, y, z) {
    var s = 256 * Math.pow(2, z);
    var n = Math.PI - 2 * Math.PI * y / s;
    var lat = Math.atan(Math.sinh ? Math.sinh(n) : (Math.exp(n) - Math.exp(-n)) / 2) * 180 / Math.PI;
    return [lat, x / s * 360 - 180];
  }

  /* Zoom yang memasukkan semua titik ke kotak w×h dengan tepi aman. */
  function fitView(pts, w, h, pad) {
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (var i = 0; i < pts.length; i++) {
      minLat = Math.min(minLat, pts[i][0]); maxLat = Math.max(maxLat, pts[i][0]);
      minLng = Math.min(minLng, pts[i][1]); maxLng = Math.max(maxLng, pts[i][1]);
    }
    var p1 = project(minLat, minLng, 0), p2 = project(maxLat, maxLng, 0);
    var dx = Math.abs(p2[0] - p1[0]), dy = Math.abs(p2[1] - p1[1]);
    var aw = Math.max(64, w - pad * 2), ah = Math.max(64, h - pad * 2);
    var z = 18;
    if (dx > 1e-9) z = Math.min(z, Math.floor(Math.log(aw / dx) / Math.LN2));
    if (dy > 1e-9) z = Math.min(z, Math.floor(Math.log(ah / dy) / Math.LN2));
    return {
      c: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
      z: Math.max(3, Math.min(18, z))
    };
  }

  /*
   * Peta rute berwarna per ruas: satu `path=` untuk tiap ruas naik, memakai
   * warna trayeknya. Perpindahan jadi kelihatan sebagai pergantian warna.
   * `segs` = [{ pts: [[lat,lng],...], color: "RRGGBB", weight: 6 }, ...]
   */
  function staticRouteSegs(segs, opts) {
    var o = opts || {};
    var w = Math.max(200, Math.min(640, o.w || 600));
    var h = Math.max(160, Math.min(640, o.h || 360));
    var fitPts = [], paths = [];
    (segs || []).forEach(function (sg) {
      var pts = (sg.pts || []).filter(function (p) {
        return p && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 85 && Math.abs(p[1]) <= 180;
      });
      if (pts.length < 2) return;
      fitPts = fitPts.concat(pts);
      var hex = String(sg.color || "1565D8").replace("#", "").slice(0, 6);
      paths.push("path=" + encodeURIComponent("color:0x" + hex + "ff|weight:" + (sg.weight || 6)) +
        "|" + pts.map(function (p) { return p[0].toFixed(5) + "," + p[1].toFixed(5); }).join("|"));
    });
    if (fitPts.length < 2 || !paths.length) return null;
    var fit = fitView(fitPts, w, h, 22);
    var parts = ["center=" + fit.c[0].toFixed(6) + "," + fit.c[1].toFixed(6), "zoom=" + fit.z];
    parts = parts.concat(paths);
    parts.push("size=" + w + "x" + h, "scale=1", "language=id", "key=" + KEY);
    return API + "staticmap?" + parts.join("&");
  }

  /* Pusat + zoom yang dipakai peta rute; dipakai juga untuk menempatkan titik A/B. */
  function mapFit(points, w, h, pad) { return fitView(points, w, h, pad || 22); }

  return {
    KEY: KEY,
    OWNER_PACKAGE: PKG,
    OWNER_CERT: CERT,
    HEADERS: HEADERS,
    ATTRIBUTION: ATTR,
    bind: bind,
    isDown: isDown,
    reason: reason,
    reset: reset,
    endSession: endSession,
    autocomplete: autocomplete,
    details: details,
    search: search,
    nearby: nearby,
    staticUrl: staticUrl,
    staticRouteSegs: staticRouteSegs,
    mapFit: mapFit
  };
})();
