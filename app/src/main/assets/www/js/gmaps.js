/* =============================================================================
 * Lumi Ã¢â‚¬â€ lapisan Google Maps.
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

  /* Kunci dari res/values/strings.xml APK Google Maps Ã¢â‚¬â€ Places + Static Maps. */
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

  /* Cari tempat dengan kata bebas (Place Text Search) Ã¢â‚¬â€ cadangan bila autocomplete kosong. */
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

  /* Tengah petak slippy (Web Mercator) untuk z/x/y. Wajib (x+0.5, y+0.5):
     sudut kiri-atas petak bukan tengahnya, dan selisihnya berubah tiap zoom. */
  function center(z, x, y) {
    var n = Math.PI - 2 * Math.PI * (y + 0.5) / Math.pow(2, z);
    var lat = Math.atan(Math.sinh ? Math.sinh(n) : (Math.exp(n) - Math.exp(-n)) / 2) * 180 / Math.PI;
    return [lat, (x + 0.5) / Math.pow(2, z) * 360 - 180];
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

  /*
   * Peta dasar gaya Google: SATU gambar Static Maps per layar, bukan per petak.
   *
   * Static Maps bukan tile server. Tiap gambar yang diminta adalah render peta
   * utuh lengkap dengan logo + "Map data Â©â€¦ Google" miliknya sendiri, jadi
   * menyusunnya sebagai petak 256 px menggandakan watermark di setiap kotak.
   * Di sini satu gambar 640 px digeoreferensi sebagai ImageOverlay: satu
   * atribusi per layar (seperti aplikasi peta sungguhan), dan posisinya tepat
   * karena batas geografisnya dihitung dari pusat + zoom yang kita pilih.
   * Gambar disegarkan setiap kali peta berhenti bergerak atau berubah zoom.
   */
  function overlayLayer(attribution) {
    var Img = L.ImageOverlay.extend({
      onAdd: function (map) {
        L.ImageOverlay.prototype.onAdd.call(this, map);
        this._sync();
        map.on("moveend zoomend", this._sync, this);
      },
      onRemove: function (map) {
        map.off("moveend zoomend", this._sync, this);
        L.ImageOverlay.prototype.onRemove.call(this, map);
      },
      _sync: function () {
        var map = this._map;
        if (!map) return;
        var size = map.getSize(), c = map.getCenter();
        // gambar harus MENUTUPI layar: 640 px @ zImg >= sisiTerpanjang @ z peta
        var zImg = Math.floor(map.getZoom() + Math.log(640 / Math.max(240, size.x, size.y)) / Math.LN2);
        zImg = Math.max(2, Math.min(20, zImg));
        var px = project(c.lat, c.lng, zImg), half = 320;
        var sw = unproject(px[0] - half, px[1] + half, zImg);
        var ne = unproject(px[0] + half, px[1] - half, zImg);
        this.setBounds(L.latLngBounds([sw[0], sw[1]], [ne[0], ne[1]]));
        this.setUrl(staticUrl(c.lat, c.lng, zImg, 640, 1));
      }
    });
    return new Img("", [[-85, -180], [85, 180]], {
      interactive: false, attribution: attribution || ATTR, className: "lm-google"
    });
  }

  /* Zoom yang memasukkan semua titik ke kotak wÃ—h dengan tepi aman. */
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
   * Gambar rute siap tempel: Static Maps dengan garis polyline dan dua penanda
   * ujung. `points` = [[lat,lng], ...] mengikuti urutan perjalanan.
   * Pusat dan zoom dihitung sendiri (fitView) â€” auto-fit Static Maps tidak
   * selalu memasukkan `path` ke perhitungan bounds, sehingga rute bisa terpotong.
   * Ukuran dijaga <= 640 px supaya tetap di jalur gratis; URL dibatasi 8192
   * karakter, jadi titik yang dikirim sudah diencerkan oleh pemanggil.
   */
  function staticRouteUrl(points, opts) {
    var o = opts || {};
    var w = Math.max(200, Math.min(640, o.w || 600));
    var h = Math.max(160, Math.min(640, o.h || 360));
    var pts = (points || []).filter(function (p) {
      return p && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 85 && Math.abs(p[1]) <= 180;
    });
    if (pts.length < 2) return null;
    var fit = fitView(pts, w, h, 22);
    var parts = [];
    var a = pts[0], b = pts[pts.length - 1];
    parts.push("center=" + fit.c[0].toFixed(6) + "," + fit.c[1].toFixed(6));
    parts.push("zoom=" + fit.z);
    parts.push("path=" + encodeURIComponent("color:0x1565D8ff|weight:6") +
      "|" + pts.map(function (p) { return p[0].toFixed(5) + "," + p[1].toFixed(5); }).join("|"));
    parts.push("size=" + w + "x" + h);
    parts.push("scale=1");
    parts.push("language=id");
    parts.push("key=" + KEY);
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
    autocomplete: autocomplete,
    details: details,
    search: search,
    nearby: nearby,
    staticUrl: staticUrl,
    staticRouteUrl: staticRouteUrl,
    mapFit: mapFit,
    overlayLayer: overlayLayer
  };
})();
