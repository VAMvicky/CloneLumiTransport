/* =============================================================================
 * Lumi â€” lapisan Google Maps.
 *
 * Kunci di bawah diekstrak dari APK Google Maps 26.44.06 (lihat
 * docs/google-api-keys.md). Kuncinya dibatasi ke aplikasi Google Maps, jadi
 * setiap permintaan membawa dua header tiruan supaya lolos pembatasan:
 *
 *     X-Android-Package: com.google.android.apps.maps
 *     X-Android-Cert:    <SHA-1 sertifikat penandatangan Google Maps>
 *
 * Permintaan JSON lewat jembatan native (LumiNative.httpH) karena
 * maps.googleapis.com tidak mengirim header CORS sehingga fetch/XHR dari
 * halaman file:// akan ditolak. Petak peta lewat <img> dan headernya
 * dipasang oleh shouldInterceptRequest di MainActivity.
 *
 * Yang dipakai di sini hanya API yang memang terbuka untuk kunci ini:
 * Place Autocomplete, Place Details, Place Query/Nearby/Text Search,
 * dan Static Maps. Directions/Routes, Geocoding, dan Timezone ditolak
 * (API-nya tidak diaktifkan pada proyek Google pemilik kunci).
 * ========================================================================== */
var LumiGoogle = (function () {
  "use strict";

  /* Kunci dari res/values/strings.xml APK Google Maps â€” Places + Static Maps. */
  var KEY = "AIzaSyAwL-YrZb2V2cHyiT40jAXVFYDqlqs41gs";
  var PKG = "com.google.android.apps.maps";
  var CERT = "38918A453D07199354F8B19AF05EC6562CED5788";
  var HEADERS = { "X-Android-Package": PKG, "X-Android-Cert": CERT };
  var API = "https://maps.googleapis.com/maps/api/";
  var ATTR = 'Peta &copy; <a href="https://www.google.com/maps" target="_blank">Google</a>';

  var httpFn = null;   // diisi app.js: fungsi http(url, timeout, headers)
  var down = null;     // alasan kunci berhenti dipakai, atau null

  function bind(fn) { httpFn = fn; }
  function isDown() { return down !== null; }
  function reason() { return down; }
  function markDown(why) {
    if (down === null) {
      down = why;
      try { console.warn("[lumi] Google Maps berhenti dipakai: " + why); } catch (e) { /* diam */ }
    }
  }
  function reset() { down = null; }

  function build(path, params) {
    var out = [], k;
    for (k in params) {
      if (params[k] === undefined || params[k] === null || params[k] === "") continue;
      out.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    }
    out.push("key=" + KEY);
    return API + path + "?" + out.join("&");
  }

  function call(path, params, ms) {
    if (down !== null) return Promise.reject(new Error(down));
    if (!httpFn) return Promise.reject(new Error("jembatan HTTP belum siap"));
    return httpFn(build(path, params), ms || 9000, HEADERS).then(function (j) {
      if (!j) throw new Error("jawaban kosong");
      if (j.status === "OK" || j.status === "ZERO_RESULTS") return j;
      if (j.status === "REQUEST_DENIED" || j.status === "OVER_QUERY_LIMIT" ||
          j.status === "INVALID_REQUEST" || j.status === "UNKNOWN_ERROR") markDown(j.status);
      var e = new Error(j.error_message || j.status || "permintaan ditolak");
      e.status = j.status;
      throw e;
    });
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
      radius: 50000
    }).then(function (j) {
      return (j.predictions || []).map(function (x) {
        var f = x.structured_formatting || {};
        return { id: x.place_id, name: f.main_text || x.description || "", sub: f.secondary_text || x.description || "" };
      }).filter(function (x) { return !!x.id; });
    });
  }

  /* Koordinat & nama satu tempat dari place_id. */
  function details(id) {
    return call("place/details/json", {
      place_id: id,
      fields: "name,geometry,formatted_address,vicinity",
      language: "id"
    }).then(function (j) {
      var r = j.result || {}, loc = r.geometry && r.geometry.location;
      if (!loc) throw new Error("tempat tanpa koordinat");
      return { name: r.name || "", sub: r.formatted_address || r.vicinity || "", p: [loc.lat, loc.lng] };
    });
  }

  /* Cari tempat dengan kata bebas (Place Text Search) â€” cadangan bila autocomplete kosong. */
  function search(q, near) {
    var p = near || [-6.2, 106.83];
    return call("place/textsearch/json", {
      query: q, language: "id", region: "id",
      location: p[0].toFixed(6) + "," + p[1].toFixed(6), radius: 50000
    }).then(function (j) {
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
    }).then(function (j) {
      return (j.results || []).map(function (x) {
        var g = x.geometry && x.geometry.location;
        return g ? { id: x.place_id, name: x.name || "", sub: x.vicinity || "", p: [g.lat, g.lng] } : null;
      }).filter(Boolean);
    });
  }

  /* ------------------------------------------------------------------ peta */

  function staticUrl(lat, lng, z, size, scale) {
    var px = size || 256;
    return API + "staticmap?center=" + lat.toFixed(7) + "," + lng.toFixed(7) +
      "&zoom=" + Math.max(0, Math.min(20, Math.round(z))) +
      "&size=" + px + "x" + px + "&scale=" + (scale || 1) +
      "&language=id&sensor=false&key=" + KEY;
  }

  /* Tengah petak slippy (Web Mercator) untuk z/x/y. */
  function center(z, x, y) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    var lat = Math.atan(Math.sinh ? Math.sinh(n) : (Math.exp(n) - Math.exp(-n)) / 2) * 180 / Math.PI;
    return [lat, x / Math.pow(2, z) * 360 - 180];
  }

  /*
   * Lapisan peta dasar Google memakai Static Maps: satu panggilan per petak
   * 256 px yang berpusat tepat di petak itu, jadi hasilnya menempel rapi.
   * Biayanya satu permintaan per petak â€” pilih ini hanya bila memang perlu.
   */
  function tileLayer(attribution) {
    var G = L.GridLayer.extend({
      createTile: function (coords, done) {
        var img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.className = "lm-gtile";
        var c = center(coords.z, coords.x, coords.y);
        img.onload = function () { done(null, img); };
        img.onerror = function () { done(new Error("petak peta Google gagal")); };
        img.src = staticUrl(c[0], c[1], coords.z, 256, 1);
        return img;
      }
    });
    return new G({
      minZoom: 3, maxZoom: 20, maxNativeZoom: 20,
      keepBuffer: 3, updateWhenIdle: false,
      attribution: attribution || ATTR
    });
  }

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
    autocomplete: autocomplete,
    details: details,
    search: search,
    nearby: nearby,
    staticUrl: staticUrl,
    tileLayer: tileLayer
  };
})();
