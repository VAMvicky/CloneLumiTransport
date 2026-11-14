/*
 * Lumi Transport — klien REST Transjakarta (tjapi.js).
 *
 * Satu tempat untuk semua endpoint TJ yang dipakai antarmuka. Token tamu, jembatan HTTP native,
 * dan penanganan galat memakai yang sudah ada di live.js (LumiLive.apiGet), jadi tidak ada
 * salinan kedua dari logika token.
 *
 * Aturan yang dipegang:
 *  - semua panggilan malas (lazy) dan di-cache: tidak ada jaringan saat boot;
 *  - kegagalan tidak pernah melempar ke antarmuka: balikannya null / array kosong;
 *  - nama halte dari server dipakai apa adanya (termasuk "Sbr." dan "Arah …"): itu bagian identitas.
 *
 * v2.21: dipakai untuk sheet halte (fasilitas, rute per halte), detail rute (jam operasional,
 * headway, tarif), bus offline, pengalihan rute, pola arah, config server, geocoder cadangan,
 * dan cuaca.
 */
(function (root) {
  "use strict";

  var BASE = "https://tijeapi.transjakarta.co.id";
  var WX = "https://api.open-meteo.com/v1/forecast";
  var store = {};          // key -> { at, ttl, val }
  var busy = {};           // key -> Promise

  function tl(id, en) {
    var I = root.LumiI18n;
    return I && I.en ? en : id;
  }

  function now() { return Date.now(); }

  function cacheGet(key) {
    var e = store[key];
    if (!e) return null;
    if (now() - e.at > e.ttl) { delete store[key]; return null; }
    return e;
  }

  function cachePut(key, val, ttl) {
    store[key] = { at: now(), ttl: ttl, val: val };
    return val;
  }

  /* ---------------------------------------------------------------- HTTP */

  var nativeCb = {}, nativeSeq = 0, hooked = false;

  function native() {
    var n = root.LumiNative;
    return n && n.httpPost ? n : null;
  }

  function hookNative() {
    if (hooked) return;
    hooked = true;
    var prev = root.__lumiHttp;
    root.__lumiHttp = function (id, status, body) {
      var cb = nativeCb[id];
      if (cb) { delete nativeCb[id]; cb(status, body); return; }
      if (prev) prev(id, status, body);
    };
  }

  function nativeGet(url, headers) {
    hookNative();
    return new Promise(function (resolve, reject) {
      var n = native();
      if (!n) { reject(new Error("no native bridge")); return; }
      var id = "tj" + (++nativeSeq);
      nativeCb[id] = function (status, body) {
        if (!status) reject(new Error(String(body || "network")));
        else if (status >= 400) reject(new Error("HTTP " + status));
        else resolve(body);
      };
      try { n.httpH(id, url, JSON.stringify(headers || {})); }
      catch (e) { delete nativeCb[id]; reject(e); }
    });
  }

  function browserGet(url, headers) {
    return fetch(url, { headers: headers || {} }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return t;
      });
    });
  }

  /* JSON tanpa token (cuaca). */
  function json(url, headers) {
    var run = native() ? nativeGet(url, headers) : browserGet(url, headers);
    return run.then(function (body) {
      try { return JSON.parse(body); } catch (e) { return null; }
    }).catch(function () { return null; });
  }

  /* JSON dari TJ: token tamu + header aplikasi, lewat live.js supaya satu jalur. */
  function tj(path) {
    var key = "tj:" + path;
    var hit = cacheGet(key);
    if (hit) return Promise.resolve(hit.val);
    if (busy[key]) return busy[key];
    var L = root.LumiLive;
    if (!L || !L.apiGet) return Promise.resolve(null);
    busy[key] = L.apiGet(path).then(function (j) {
      delete busy[key];
      if (!j) return null;
      return cachePut(key, j, 5 * 60000).val;
    }, function () { delete busy[key]; return null; });
    return busy[key];
  }

  function arr(j) {
    if (!j) return [];
    var d = j.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  }

  /* ------------------------------------------------------------ halte */

  /* Halte di sekitar satu titik, URUT jarak dari server. Semua field dipertahankan:
     fasilitas, gerbang, jenis halte/bus_stop, kampanye. */
  function nearStops(lat, lon) {
    var k = (+lat).toFixed(4) + "," + (+lon).toFixed(4);
    var hit = cacheGet("near:" + k);
    if (hit) return Promise.resolve(hit.val);
    return tj("/v1/bus-stop?latitude=" + lat + "&longitude=" + lon).then(function (j) {
      var list = arr(j).map(function (s) {
        return {
          id: s.stop_id, name: s.stop_name,
          lat: +s.stop_lat, lon: +s.stop_lon,
          dist: s.distance == null ? null : +s.distance,
          type: s.bus_stop_type || "bus_stop",
          parent: s.parent_station || "",
          wheelchair: s.wheelchair_boarding || 0,
          facilities: s.facilities || [],
          v2: s.v2_facilities || [],
          gates: s.stop_gates || {},
          campaign: s.campaign || null,
          routes: s.routes || []
        };
      });
      return cachePut("near:" + k, list, 10 * 60000).val;
    });
  }

  /* Detail satu halte + semua rute yang berhenti di sana (dengan warna resmi). */
  function stopDetail(id) {
    if (!id) return Promise.resolve(null);
    var hit = cacheGet("stop:" + id);
    if (hit) return Promise.resolve(hit.val);
    return tj("/v1/bus-stop/" + encodeURIComponent(id)).then(function (j) {
      if (!j || !j.data) return null;
      var s = j.data;
      var out = {
        id: s.stop_id, name: s.stop_name,
        lat: +s.stop_lat, lon: +s.stop_lon,
        type: s.bus_stop_type || "bus_stop",
        wheelchair: s.wheelchair_boarding || 0,
        facilities: s.facilities || [],
        v2: s.v2_facilities || [],
        gates: s.stop_gates || {},
        campaign: s.campaign || null,
        routes: (s.routes || []).map(function (r) {
          return {
            id: r.route_id, code: r.route_short_name || r.route_id,
            name: r.route_long_name, desc: r.route_desc,
            color: "#" + (r.route_color || "1565D8"),
            text: "#" + (r.route_text_color || "FFFFFF")
          };
        })
      };
      return cachePut("stop:" + id, out, 30 * 60000).val;
    });
  }

  /* ------------------------------------------------------------ rute */

  var ROUTES = null;

  /* Daftar seluruh rute (238 record): id, kode, nama, tarif resmi, warna. */
  function routes() {
    if (ROUTES) return Promise.resolve(ROUTES);
    var hit = cacheGet("routes");
    if (hit) { ROUTES = hit.val; return Promise.resolve(ROUTES); }
    return tj("/v1/route?limit=300").then(function (j) {
      var list = arr(j).map(function (r) {
        return {
          id: r.route_id, code: r.route_short_name || r.route_id,
          name: r.route_long_name, desc: r.route_desc,
          price: r.price || 0,
          color: "#" + (r.route_color || "1565D8"),
          text: "#" + (r.route_text_color || "FFFFFF")
        };
      });
      ROUTES = cachePut("routes", list, 60 * 60000).val;
      return ROUTES;
    });
  }

  /* Detail satu rute: jam operasional, headway, tarif, halte berurutan. */
  function routeDetail(id) {
    if (!id) return Promise.resolve(null);
    var hit = cacheGet("route:" + id);
    if (hit) return Promise.resolve(hit.val);
    return tj("/v1/route/" + encodeURIComponent(id)).then(function (j) {
      if (!j || !j.data) return null;
      var R = j.data.route || {};
      var out = {
        id: R.route_id, code: R.route_short_name || R.route_id,
        name: R.route_long_name, desc: R.route_desc,
        price: R.price || 0,
        start: R.start_time || "", end: R.end_time || "",
        headway: R.headway_secs || 0,
        days: R.operational_days || null,
        facilities: (j.data.facilities || []).length,
        stops: []
      };
      return cachePut("route:" + id, out, 30 * 60000).val;
    });
  }

  /* ------------------------------------------------------- bus & arah */

  function buses() {
    return tj("/v1/bus").then(function (j) { return arr(j); });
  }

  /* Bus yang sedang putus sinyal: masih dijadwalkan, posisinya tidak diterima. */
  function busesOffline() {
    return tj("/v1/bus/offline").then(function (j) { return arr(j); });
  }

  /* Pengalihan/pemindahan rute resmi (mis. koridor dialihkan sementara). */
  function diversions() {
    return tj("/v1/route-diversion").then(function (j) { return arr(j); });
  }

  /* Pola arah/trip: dipakai untuk memastikan satu arah rute benar-benar melewati sebuah titik. */
  function directions() {
    return tj("/v1/direction").then(function (j) { return arr(j); });
  }

  /* --------------------------------------------------------- config */

  /* Config server per nama (mis. "royal_trans_config"). isActive = saklar fitur. */
  function config(name) {
    if (!name) return Promise.resolve(null);
    var hit = cacheGet("cfg:" + name);
    if (hit) return Promise.resolve(hit.val);
    return tj("/v1/settings/api/config/" + encodeURIComponent(name)).then(function (j) {
      if (!j || !j.data) return null;
      var d = j.data;
      var out = { name: d.name, active: d.isActive !== false, props: d.properties || {}, at: d.updatedAt || "" };
      return cachePut("cfg:" + name, out, 30 * 60000).val;
    });
  }

  /* -------------------------------------------------------- geocoder */

  /* Cadangan first-party kalau lapisan Google dimatikan atau kuncinya dicabut. */
  function geocode(q, lat, lon) {
    var path = "/v1/maps/autocomplete?query=" + encodeURIComponent(q);
    if (isFinite(+lat) && isFinite(+lon)) path += "&latitude=" + lat + "&longitude=" + lon;
    return tj(path).then(function (j) {
      return arr(j).map(function (x) {
        return {
          name: x.name || x.description || x.formatted_address || "",
          lat: +(x.latitude || (x.geometry && x.geometry.location && x.geometry.location.lat) || NaN),
          lon: +(x.longitude || (x.geometry && x.geometry.location && x.geometry.location.lng) || NaN),
          raw: x
        };
      }).filter(function (x) { return x.name; });
    });
  }

  /* ------------------------------------------------------------ cuaca */

  var WMO = {
    0: ["Cerah", "Clear"], 1: ["Cerah berawan", "Mostly clear"], 2: ["Berawan", "Partly cloudy"],
    3: ["Mendung", "Overcast"], 45: ["Berkabut", "Foggy"], 48: ["Kabut beku", "Freezing fog"],
    51: ["Gerimis ringan", "Light drizzle"], 53: ["Gerimis", "Drizzle"], 55: ["Gerimis lebat", "Heavy drizzle"],
    61: ["Hujan ringan", "Light rain"], 63: ["Hujan", "Rain"], 65: ["Hujan lebat", "Heavy rain"],
    66: ["Hujan beku", "Freezing rain"], 67: ["Hujan beku lebat", "Heavy freezing rain"],
    80: ["Hujan lokal ringan", "Light showers"], 81: ["Hujan lokal", "Showers"], 82: ["Hujan lokal lebat", "Heavy showers"],
    95: ["Badai petir", "Thunderstorm"], 96: ["Badai + hujan es", "Thunderstorm with hail"],
    99: ["Badai + hujan es lebat", "Severe thunderstorm with hail"]
  };

  /* Cuaca sekarang di satu titik. Tanpa kunci API. */
  function weather(lat, lon) {
    if (!isFinite(+lat) || !isFinite(+lon)) return Promise.resolve(null);
    var k = "wx:" + (+lat).toFixed(2) + "," + (+lon).toFixed(2);
    var hit = cacheGet(k);
    if (hit) return Promise.resolve(hit.val);
    var url = WX + "?latitude=" + (+lat).toFixed(3) + "&longitude=" + (+lon).toFixed(3) +
      "&current=temperature_2m,weather_code&timezone=Asia%2FJakarta";
    return json(url).then(function (j) {
      if (!j || !j.current) return null;
      var code = +j.current.weather_code;
      var w = WMO[code] || ["Cuaca tidak diketahui", "Unknown conditions"];
      var out = {
        temp: Math.round(+j.current.temperature_2m),
        code: code,
        text: tl(w[0], w[1]),
        wet: code >= 51
      };
      return cachePut(k, out, 15 * 60000).val;
    });
  }

  function clear() { store = {}; ROUTES = null; }

  root.LumiTJ = {
    base: BASE,
    nearStops: nearStops,
    stopDetail: stopDetail,
    routes: routes,
    routeDetail: routeDetail,
    buses: buses,
    busesOffline: busesOffline,
    diversions: diversions,
    directions: directions,
    config: config,
    geocode: geocode,
    weather: weather,
    clear: clear
  };
})(typeof window !== "undefined" ? window : this);
