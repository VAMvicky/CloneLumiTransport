/*
 * Lumi Transport — kereta: jadwal pasti + posisi langsung (v2.15).
 *
 * 1. Jadwal (data/rail_schedule.json, dibuat tools/rail_schedule.py dari stop_times GTFS / jadwal
 *    KAI Commuter) disimpan di HP dan diserahkan ke mesin rute (LumiEngine.useSchedule) sehingga
 *    waktu tunggu & lama perjalanan ruas KRL/MRT/LRT/KA Bandara mengikuti jadwal, bukan headway.
 * 2. Posisi kereta:
 *    a. LANGSUNG dari feed GTFS-Realtime (VehiclePositions / TripUpdates / Alerts) bila operator
 *       menyediakannya — URL diatur di data/remote_config.json → rail.realtime; protobuf didekode
 *       native (GtfsRt.java). KAI Commuter belum membuka feed publik, jadi daftar ini bisa kosong.
 *    b. PERKIRAAN dari jadwal bila tidak ada feed: posisi diinterpolasi di antara dua stasiun
 *       menurut jam berangkatnya, ditambah keterlambatan dari TripUpdates bila ada. Selalu ditandai
 *       "perkiraan" di layar supaya tidak tertukar dengan posisi sungguhan.
 * Tanpa jadwal maupun feed, modul ini diam dan aplikasi berperilaku seperti sebelumnya.
 */
(function (root) {
  "use strict";
  var SKEY = "lumi:railSched", RKEY = "lumi:railRt";
  var E = null, fetchRt = null;
  var sched = null;
  var feeds = [];             // [{id,url,kind,modes,routeMap}]
  var rt = { at: 0, vehicles: [], trips: {}, alerts: [] };
  var subs = [], pollT = null, polling = false;

  function digits(s) { var m = String(s || "").match(/\d{2,6}/); return m ? m[0] : ""; }
  function hav(a, b) { return E ? E.hav(a, b) : 0; }
  function brg(a, b) {
    var k = Math.cos(a[0] * Math.PI / 180), dx = (b[1] - a[1]) * k, dy = b[0] - a[0];
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }
  function wibMin(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    var w = new Date(d.getTime() + (d.getTimezoneOffset() + 420) * 60000);
    return w.getHours() * 60 + w.getMinutes() + w.getSeconds() / 60;
  }

  /* ------------------------------------------------------------ jadwal */
  function loadCached() {
    try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); if (s && E.useSchedule(s)) sched = s; } catch (e) { lumiLog(e); }
  }
  /* Simpan jadwal baru (sudah diunduh & diparse). Mengembalikan true bila valid & dipakai. */
  function setSchedule(s) {
    if (!E || !E.useSchedule(s)) return false;
    sched = s;
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { lumiLog(e); }
    return true;
  }
  function trips(line, d) {
    var L = sched && line && sched.lines[line.id], dd = L && L.d[d], dir = line && line.dirs && line.dirs[d];
    return dd && dir && dd.n === dir.s.length ? dd.trips : null;
  }
  function hasSchedule(line) { return !!(line && line.dirs && line.dirs.some(function (_, i) { return trips(line, i); })); }

  /* ------------------------------------------------------------ keterlambatan (TripUpdates) */
  /* Keterlambatan (menit) untuk perjalanan berlabel `label` (mis. "KA 1234"), atau null. */
  function delayOf(label) {
    var k = digits(label);
    if (!k || !rt.trips[k]) return null;
    return rt.trips[k];
  }

  /* ------------------------------------------------------------ posisi perkiraan dari jadwal */
  /*
   * Kereta yang sedang berjalan pada satu arah rute menurut jadwal (+ keterlambatan bila diketahui).
   * Hasil: [{ key, label, d, lat, lon, bearing, nextK, nextName, eta, delay, est:true }]
   */
  function estimate(line, d, atMin) {
    var tt = trips(line, d);
    if (!tt) return [];
    var st = line.dirs[d].s, now = atMin == null ? wibMin() : atMin, out = [];
    var cands = now < 360 ? [now, now + 1440] : [now];
    tt.forEach(function (t) {
      var times = t[1], dl = delayOf(t[0]), add = dl ? dl.min : 0;
      var idx = [];
      for (var i = 0; i < times.length; i++) if (times[i] != null) idx.push(i);
      if (idx.length < 2) return;
      cands.forEach(function (c) {
        var first = times[idx[0]] + add, last = times[idx[idx.length - 1]] + add;
        if (c < first || c > last) return;
        for (var j = 0; j < idx.length - 1; j++) {
          var a = idx[j], b = idx[j + 1], ta = times[a] + add, tb = times[b] + add;
          if (c < ta || c > tb) continue;
          var f = tb > ta ? (c - ta) / (tb - ta) : 0;
          var p = [st[a].p[0] + (st[b].p[0] - st[a].p[0]) * f, st[a].p[1] + (st[b].p[1] - st[a].p[1]) * f];
          out.push({ key: line.id + ":" + d + ":" + t[0], label: t[0], d: d, lat: p[0], lon: p[1], bearing: brg(st[a].p, st[b].p),
            nextK: b, nextName: st[b].n, eta: Math.max(0, tb - c), delay: dl, est: true, line: line });
          break;
        }
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ posisi langsung (GTFS-Realtime) */
  function lineForVehicle(v, feed, lines) {
    var id = feed.routeMap && v.route && feed.routeMap[v.route];
    if (id) { for (var i = 0; i < lines.length; i++) if (lines[i].id === id) return lines[i]; }
    // Tanpa peta rute: cocokkan nomor KA dengan label perjalanan di jadwal.
    var k = digits(v.label || v.trip || v.id);
    if (!k || !sched) return null;
    for (var j = 0; j < lines.length; j++) {
      var L = sched.lines[lines[j].id]; if (!L) continue;
      for (var d = 0; d < L.d.length; d++) {
        var dd = L.d[d]; if (!dd) continue;
        for (var t = 0; t < dd.trips.length; t++) if (digits(dd.trips[t][0]) === k) return lines[j];
      }
    }
    return null;
  }
  function ingest(feed, j, lines) {
    var now = Date.now();
    (j.vehicles || []).forEach(function (v) {
      var line = lineForVehicle(v, feed, lines);
      if (!line || feed.modes.indexOf(line.mode) < 0) return;
      var key = "rt:" + (v.id || v.label);
      rt.vehicles = rt.vehicles.filter(function (x) { return x.key !== key; });
      rt.vehicles.push({ key: key, label: v.label || (v.trip ? "KA " + digits(v.trip) : v.id), lat: +v.lat, lon: +v.lon,
        bearing: +v.bearing || 0, occ: v.occ || null, occPct: v.occPct, at: v.ts ? v.ts * 1000 : now, line: line, est: false, stop: v.stop || null });
    });
    (j.trips || []).forEach(function (t) {
      var k = digits(t.trip); if (!k) return;
      var sec = t.delay;
      if (sec == null) (t.stops || []).some(function (s) { var x = s.depDelay != null ? s.depDelay : s.arrDelay; if (x != null) { sec = x; return true; } return false; });
      if (sec == null) return;
      rt.trips[k] = { min: Math.round(sec / 60), at: now };
    });
    (j.alerts || []).forEach(function (a) {
      rt.alerts = rt.alerts.filter(function (x) { return x.id !== feed.id + ":" + a.id; });
      var lines2 = [];
      (a.routes || []).forEach(function (r) { var id = feed.routeMap && feed.routeMap[r]; if (id) lines2.push(id); });
      rt.alerts.push({ id: feed.id + ":" + a.id, src: "gtfs-rt", modes: feed.modes, lineIds: lines2, routes: a.routes || [],
        severity: a.severity === "SEVERE" ? "severe" : a.severity === "INFO" ? "info" : "warn",
        title: a.header || {}, text: a.desc || {}, url: a.url && (a.url.id || a.url.en || a.url._) || null,
        from: a.start ? a.start * 1000 : null, until: a.end ? a.end * 1000 : null, effect: a.effect || null });
    });
    // buang data basi
    rt.vehicles = rt.vehicles.filter(function (x) { return now - x.at < 5 * 60000; });
    Object.keys(rt.trips).forEach(function (k) { if (now - rt.trips[k].at > 20 * 60000) delete rt.trips[k]; });
    rt.at = now;
  }
  function pollOnce(lines) {
    if (polling || !feeds.length || !fetchRt) return Promise.resolve();
    polling = true;
    return Promise.all(feeds.map(function (f) {
      return fetchRt(f.url).then(function (j) { ingest(f, j, lines); }).catch(function (e) { lumiLog(e, "rail-rt"); });
    })).then(function () {
      polling = false;
      try { localStorage.setItem(RKEY, JSON.stringify({ at: rt.at, alerts: rt.alerts })); } catch (e) { lumiLog(e); }
      subs.forEach(function (s) { try { s.fn(); } catch (e) { lumiLog(e); } });
    });
  }
  /* Pantau posisi kereta untuk beberapa rute; fn() dipanggil saat data baru masuk. Mengembalikan fungsi berhenti. */
  function watch(lines, fn) {
    var s = { lines: lines, fn: fn };
    subs.push(s);
    if (feeds.length && !pollT) {
      var all = function () { var ls = []; subs.forEach(function (x) { ls = ls.concat(x.lines); }); return ls; };
      pollOnce(all());
      pollT = setInterval(function () { pollOnce(all()); }, 30000);
    }
    return function () {
      subs = subs.filter(function (x) { return x !== s; });
      if (!subs.length && pollT) { clearInterval(pollT); pollT = null; }
    };
  }
  /* Kereta untuk satu rute: posisi langsung bila ada, kalau tidak perkiraan dari jadwal. */
  function trainsFor(line, atMin) {
    var live = rt.vehicles.filter(function (v) { return v.line && v.line.id === line.id; });
    if (live.length) return live;
    var out = [];
    (line.dirs || []).forEach(function (_, d) { out = out.concat(estimate(line, d, atMin)); });
    return out;
  }

  var Rail = {
    init: function (engine, rtFetcher) { E = engine; fetchRt = rtFetcher; loadCached();
      try { var c = JSON.parse(localStorage.getItem(RKEY) || "null"); if (c && c.alerts && Date.now() - c.at < 3600000) rt.alerts = c.alerts; } catch (e) { lumiLog(e); } },
    setSchedule: setSchedule,
    schedule: function () { return sched; },
    hasSchedule: hasSchedule,
    setFeeds: function (list) {
      feeds = (list || []).filter(function (f) { return f && /^https:\/\//.test(f.url || ""); }).map(function (f, i) {
        return { id: f.id || "rt" + i, url: f.url, kind: f.kind || "all", modes: f.modes || ["KRL"], routeMap: f.routeMap || {} };
      });
    },
    hasRealtime: function () { return feeds.length > 0; },
    estimate: estimate,
    trainsFor: trainsFor,
    delayOf: delayOf,
    watch: watch,
    alerts: function () { return rt.alerts.slice(); },
    pollNow: function (lines) { return pollOnce(lines || []); },
    _ingest: ingest, _rt: rt
  };
  root.LumiRail = Rail;
})(typeof window !== "undefined" ? window : this);
