/*
 * Lumi Transportation — mesin perencana rute multimoda (offline).
 * Bekerja di browser/WebView dan Node (untuk pengujian).
 *
 * Model:
 *  - Setiap (rute, arah, urutan halte) adalah satu simpul.
 *  - Sisi "naik": halte k -> k+1 dalam rute & arah yang sama.
 *  - Sisi "pindah": antar simpul rute berbeda yang berdekatan (jalan kaki),
 *    biaya = waktu jalan + waktu tunggu rute tujuan + penalti pindah.
 *  - Titik asal/tujuan disambungkan ke halte/stasiun terdekat lewat jalan kaki
 *    atau ojol (first/last mile).
 *  - Dijkstra dengan biaya waktu (menit) + penalti.
 */
(function (root) {
  "use strict";

  var MODES = {
    TJ:        { label: "Transjakarta", short: "TJ",   speed: 19, wait: 7,  dwell: 0.6 },
    MIKRO:     { label: "Mikrotrans",   short: "JAK",  speed: 14, wait: 12, dwell: 0.3 },
    ROYAL:     { label: "Royaltrans",   short: "RT",   speed: 28, wait: 20, dwell: 1.0 },
    KRL:       { label: "KRL Commuter Line", short: "KRL", speed: 42, wait: 8, dwell: 0.7 },
    KABANDARA: { label: "KA Bandara",   short: "KA",   speed: 55, wait: 25, dwell: 1.0 },
    MRT:       { label: "MRT Jakarta",  short: "MRT",  speed: 36, wait: 5,  dwell: 0.5 },
    LRT:       { label: "LRT Jakarta",  short: "LRT",  speed: 30, wait: 8,  dwell: 0.5 },
    LRTJ:      { label: "LRT Jabodebek", short: "LRT", speed: 40, wait: 8,  dwell: 0.5 },
    WHOOSH:    { label: "Whoosh",       short: "KCIC", speed: 190, wait: 30, dwell: 2.0 }
  };
  var RAIL = { KRL: 1, KABANDARA: 1, MRT: 1, LRT: 1, LRTJ: 1, WHOOSH: 1 };
  var BUS = { TJ: 1, MIKRO: 1, ROYAL: 1 };

  var WALK_KMH = 4.5, WALK_DETOUR = 1.3;
  var ROAD_DETOUR = 1.35;

  function hav(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLa = (b[0] - a[0]) * toR, dLo = (b[1] - a[1]) * toR;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function walkMin(km) { return km * WALK_DETOUR / WALK_KMH * 60; }

  /* ------------------------------------------------- jam operasional */
  function isNight(m) { m = ((m % 1440) + 1440) % 1440; return m >= 1320 || m < 300; }
  // Hari yang sedang direncanakan (0 = Minggu); dipakai untuk jam operasional yang berbeda per hari (mis. LRT Jabodebek).
  var PLAN_DOW = null;
  function hoursOf(line) {
    var hd = line.hoursDow;
    return hd && PLAN_DOW != null && hd[PLAN_DOW] ? hd[PLAN_DOW] : line.hours;
  }
  function openAt(line, m) {
    var hs = hoursOf(line);
    if (!hs) return true;
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    for (var i = 0; i < hs.length; i++) {
      var a = hs[i][0], b = hs[i][1];
      if (m >= a && m < b) return true;
      if (b > 1440 && m < b - 1440) return true;
    }
    return false;
  }
  function waitAt(line, m) {
    var w = MODES[line.mode].wait;
    if (isNight(m) && (line.mode === "TJ" || line.mode === "MIKRO")) return 25;   // AMARI tiap ±20–40 mnt
    return w;
  }

  /* ---------------------------------------------------------------- tarif */
  function ojolMotor(km) {
    // KP Menhub 564/2022 zona II (Jabodetabek): Rp2.550–2.800/km, minimum Rp10.200–11.200 (4 km pertama)
    // + biaya jasa aplikasi ±Rp2.000.
    var lo = Math.max(10200, km * 2550) + 2000, hi = Math.max(11200, km * 2800) + 4000;
    return { lo: round500(lo), hi: round500(hi) };
  }
  function ojolCar(km) {
    // Perkiraan taksi online Jabodetabek: ±Rp4.000–6.000/km, minimum ±Rp15.000–20.000 + biaya jasa.
    var lo = Math.max(15000, km * 4000) + 3000, hi = Math.max(20000, km * 6000) + 5000;
    return { lo: round500(lo), hi: round500(hi) };
  }
  function round500(x) { return Math.round(x / 500) * 500; }
  function ojolMinutes(km, kind) {
    var speed = kind === "car" ? 20 : 24; // rata-rata Jakarta, km/jam
    return km / speed * 60 + (kind === "car" ? 6 : 4); // + waktu jemput
  }

  /*
   * Tarif per naik (diperbarui 29 Okt 2026):
   *  - Transjakarta BRT/non-BRT & Transjabodetabek Rp3.500 (Rp2.000 pukul 05–07). Penyesuaian tarif TJ
   *    diumumkan berlaku 1 Jan 2027 (besaran belum diumumkan).
   *  - SH2 Blok M–Bandara Soetta Rp15.000 sejak 1 Sep 2026 (Kepgub 685/2026). SH1 tetap Rp3.500.
   *  - Hub Connector (HC1, HC2 PIK 2–Dukuh Atas) & Royaltrans Rp20.000. Mikrotrans gratis.
   *  - MRT: Rp3.000 + Rp1.000 per stasiun yang dilewati, maks. Rp14.000 (Lebak Bulus–Fatmawati Rp4.000 … Dukuh Atas Rp14.000).
   *  - LRT Jakarta flat Rp5.000 (termasuk Velodrome–Manggarai). LRT Jabodebek Rp5.000 + Rp700/km, maks. Rp20.000.
   *  - KRL Rp3.000 untuk 25 km pertama, +Rp1.000 tiap 10 km.
   *  - KA Bandara: Manggarai/BNI City/Duri–Bandara Rp70.000, Rawa Buaya/Batu Ceper–Bandara Rp35.000,
   *    antar-stasiun kota (mis. Manggarai–BNI City) Rp10.000.
   *  - Whoosh tarif dinamis, mulai Rp250.000.
   */
  function premiumFare(line) {
    var c = String(line.code || "").toUpperCase();
    if (c === "SH2") return 15000;
    if (/^HC\d/.test(c)) return 20000;
    return 0;
  }
  function legFare(line, km, fromName, toName, hops) {
    var pf = premiumFare(line);
    if (pf) return pf;
    switch (line.mode) {
      case "TJ": return line.code === "GR4" || line.code === "GR5" ? 0 : 3500;
      case "MIKRO": return 0;
      case "ROYAL": return line.cat === "JABODETABEK" ? 3500 : 20000;
      case "KRL": return 3000 + Math.max(0, Math.ceil((km - 25) / 10)) * 1000;
      case "MRT": return hops != null ? Math.min(14000, 3000 + Math.max(1, hops) * 1000)
        : Math.min(14000, Math.max(3000, Math.round((3000 + km * 700) / 1000) * 1000));
      case "LRT": return 5000;
      case "LRTJ": return Math.min(20000, Math.round((5000 + Math.max(0, km - 1) * 700) / 100) * 100);
      case "KABANDARA":
        var ft = fromName + "|" + toName;
        if (/Bandara|Soekarno/.test(ft)) return /(Manggarai|BNI City|Sudirman Baru|Duri)/.test(ft) ? 70000 : 35000;
        return /(Rawa Buaya|Batu Ceper)/.test(ft) ? 35000 : 10000;
      case "WHOOSH": return 250000;
    }
    return 0;
  }

  /* ---------------------------------------------------------- bangun graf */
  function Planner(data) {
    this.lines = data.lines;
    this.byId = {};
    var self = this;
    this.lines.forEach(function (l, i) { l._i = i; self.byId[l.id] = l; });
    this._build();
  }

  Planner.prototype._build = function () {
    var nodes = [];            // {li, di, k, p, n}
    var adj = [];              // [[to, cost, type]]
    var lines = this.lines;
    lines.forEach(function (l, li) {
      l.dirs.forEach(function (d, di) {
        d._start = nodes.length;
        d._km = [0];
        d.s.forEach(function (s, k) {
          nodes.push({ li: li, di: di, k: k, p: s.p, n: s.n });
          adj.push([]);
          if (k > 0) d._km.push(d._km[k - 1] + hav(d.s[k - 1].p, s.p) * (RAIL[l.mode] ? 1.05 : 1.2));
        });
        var m = MODES[l.mode];
        for (var k = 0; k + 1 < d.s.length; k++) {
          var km = d._km[k + 1] - d._km[k];
          adj[d._start + k].push([d._start + k + 1, km / m.speed * 60 + m.dwell, 0]);
        }
      });
    });
    // grid spasial ~ 0.005 derajat (~550 m)
    var G = 0.005, grid = {};
    nodes.forEach(function (nd, i) {
      var key = Math.floor(nd.p[0] / G) + ":" + Math.floor(nd.p[1] / G);
      (grid[key] = grid[key] || []).push(i);
    });
    this.grid = grid; this.G = G;
    var self = this;
    nodes.forEach(function (a, i) {
      var la = lines[a.li];
      var gx = Math.floor(a.p[0] / G), gy = Math.floor(a.p[1] / G);
      var best = {};
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var cell = grid[(gx + dx) + ":" + (gy + dy)];
        if (!cell) continue;
        for (var c = 0; c < cell.length; c++) {
          var j = cell[c], b = nodes[j];
          if (b.li === a.li) continue;
          var lb = lines[b.li];
          var km = hav(a.p, b.p);
          // Pindah antar bus boleh jalan kaki sampai ±500 m (mis. halte Makasar → Jasa Marga untuk JAK36/JAK108).
          var maxKm = (RAIL[la.mode] || RAIL[lb.mode]) ? 0.5 : 0.45;
          if (km > maxKm) continue;
          // simpul akhir rute tidak bisa dinaiki lagi
          if (b.k === lb.dirs[b.di].s.length - 1) continue;
          var w = walkMin(km) + 3;   // waktu tunggu ditambahkan saat pencarian (tergantung jam)
          var key2 = b.li + ":" + b.di;
          (best[key2] = best[key2] || []).push([j, w, b.k]);
        }
      }
      // Per rute-arah tujuan ambil simpul terdekat, TAPI untuk rute memutar (mis. JAK36 Cilangkap→Cililitan→Cilangkap
      // yang lewat Tamini dua kali) simpan juga simpul di bagian lain rute (urutan halte berjauhan).
      for (var k2 in best) {
        var arr = best[k2].sort(function (p, q) { return p[1] - q[1]; }), picked = [];
        for (var q = 0; q < arr.length && picked.length < 2; q++) {
          if (picked.every(function (pp) { return Math.abs(pp[2] - arr[q][2]) > 3; })) picked.push(arr[q]);
        }
        picked.forEach(function (pp) { adj[i].push([pp[0], pp[1], 1]); });
      }
    });
    this.nodes = nodes; this.adj = adj;
    // Graf padat (CSR) + atribut simpul dalam array bertipe: jauh lebih cepat untuk Dijkstra/A*.
    var N = nodes.length, M = 0;
    for (var a1 = 0; a1 < N; a1++) M += adj[a1].length;
    var cs = new Int32Array(N + 1), ct = new Int32Array(M), cw = new Float32Array(M), cty = new Uint8Array(M), pos = 0;
    var nli = new Int32Array(N), ndi = new Int32Array(N);
    for (var a2 = 0; a2 < N; a2++) {
      cs[a2] = pos; nli[a2] = nodes[a2].li; ndi[a2] = nodes[a2].di;
      var ea = adj[a2];
      for (var a3 = 0; a3 < ea.length; a3++) { ct[pos] = ea[a3][0]; cw[pos] = ea[a3][1]; cty[pos] = ea[a3][2]; pos++; }
    }
    cs[N] = pos;
    this.csrStart = cs; this.csrTo = ct; this.csrW = cw; this.csrT = cty; this.nodeLi = nli; this.nodeDi = ndi;
    // Halte BRT (tertutup, ada gerbang tap) = semua pemberhentian rute BRT.
    var hg = {};
    nodes.forEach(function (nd) {
      if (!lines[nd.li].brt) return;
      var key = Math.floor(nd.p[0] / 0.002) + ":" + Math.floor(nd.p[1] / 0.002);
      (hg[key] = hg[key] || []).push(nd.p);
    });
    this.halteGrid = hg;
    this.edgeCount = adj.reduce(function (s, a) { return s + a.length; }, 0);
  };

  Planner.prototype.isHalte = function (p) {
    if (!p) return false;
    var gx = Math.floor(p[0] / 0.002), gy = Math.floor(p[1] / 0.002);
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      var c = this.halteGrid[(gx + dx) + ":" + (gy + dy)];
      if (!c) continue;
      for (var i = 0; i < c.length; i++) if (hav(p, c[i]) <= 0.07) return true;
    }
    return false;
  };

  Planner.prototype.nearby = function (p, km, filter) {
    var G = this.G, r = Math.ceil(km / 0.55) + 1;
    var gx = Math.floor(p[0] / G), gy = Math.floor(p[1] / G), out = [];
    for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
      var cell = this.grid[(gx + dx) + ":" + (gy + dy)];
      if (!cell) continue;
      for (var c = 0; c < cell.length; c++) {
        var i = cell[c], nd = this.nodes[i], l = this.lines[nd.li];
        if (filter && !filter(l)) continue;
        var d = hav(p, nd.p);
        if (d <= km) out.push([i, d]);
      }
    }
    return out;
  };

  /* -------------------------------------------------------------- heap */
  function Heap() { this.a = []; }
  Heap.prototype.push = function (x) {
    var a = this.a; a.push(x); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };

  /*
   * opts: { allow(line)->bool, access: "walk"|"ojol", transferPenalty, avoid: Set(lineIdx) }
   */
  Planner.prototype.search = function (from, to, opts) {
    var self = this, N = this.nodes.length;
    var baseAllow = opts.allow || function () { return true; };
    var ban = opts.ban || null;
    var allow = baseAllow;
    var nodesRef = this.nodes, NLI = this.nodeLi, NDI = this.nodeDi, LINES = this.lines;
    // Larangan per rute ("li") atau per rute+arah ("li:di"), dipra-hitung ke array.
    var banLi = null, banDir = null;
    if (ban) {
      banLi = new Uint8Array(LINES.length);
      Object.keys(ban).forEach(function (k) { if (k.indexOf(":") < 0) banLi[+k] = 1; else (banDir = banDir || {})[k] = 1; });
    }
    function bannedNode(i) { if (!ban) return false; return banLi[NLI[i]] === 1 || (banDir !== null && banDir[NLI[i] + ":" + NDI[i]] === 1); }
    var allowLi = new Uint8Array(LINES.length);
    for (var al = 0; al < LINES.length; al++) allowLi[al] = allow(LINES[al]) ? 1 : 0;
    var dist = new Float64Array(N + 1).fill(Infinity);
    // A*: perkiraan sisa waktu = jarak lurus ke tujuan / 60 km/jam (selalu ≤ waktu sebenarnya,
    // karena tidak ada moda yang dipakai di dalam kota lebih cepat dari 60 km/jam). Whoosh: tanpa heuristik.
    var useH = !(opts.allow && opts.allow({ mode: "WHOOSH" })) || hav(from, to) <= 60;
    var nodesH = this.nodes;
    function hcost(i) { return useH ? hav(nodesH[i].p, to) : 0; }
    var prev = new Int32Array(N + 1).fill(-1);
    var prevType = new Int8Array(N + 1);
    var h = new Heap();
    var TARGET = N;
    var tp = opts.transferPenalty || 0;
    var dep = opts.depMin == null ? nowMin() : opts.depMin;
    var directKm = hav(from, to);

    var ww = opts.walkWeight || 1.6;
    function accessCost(km) {
      if (opts.access === "ojol" && km > 0.9) return { t: ojolMinutes(km * ROAD_DETOUR, "motor"), mode: "ojol" };
      return { t: walkMin(km) * ww, mode: "walk" };   // jalan kaki diberi bobot: penumpang lebih suka naik daripada jalan jauh
    }
    var reachKm = opts.access === "ojol" ? Math.min(5, Math.max(1.2, directKm * 0.3)) : 1.1;

    var startEdges = this.nearby(from, reachKm, allow);
    if (!startEdges.length && opts.access !== "ojol") startEdges = this.nearby(from, 1.8, allow);
    var self2 = this;
    startEdges = startEdges.filter(function (e) { return !bannedNode(e[0]); });
    startEdges.forEach(function (e) {
      var nd = self2.nodes[e[0]], l = self2.lines[nd.li];
      if (nd.k === l.dirs[nd.di].s.length - 1) return;
      var ac = accessCost(e[1]);
      var arrive = ac.t + (ac.mode === "ojol" ? 6 : 0);
      if (!openAt(l, dep + arrive)) return;
      var c = arrive + waitAt(l, dep + arrive);
      if (c < dist[e[0]]) { dist[e[0]] = c; prev[e[0]] = -2; h.push([c + hcost(e[0]), e[0], c]); }
    });
    var endMap = {};
    var endR = reachKm;
    var endEdges = this.nearby(to, endR, allow);
    if (!endEdges.length && opts.access !== "ojol") endEdges = this.nearby(to, 1.8, allow);
    endEdges.forEach(function (e) {
      var ac = accessCost(e[1]);
      endMap[e[0]] = ac.t + (ac.mode === "ojol" ? 6 : 0);
    });

    while (h.a.length) {
      var top = h.pop(), c = top[2], u = top[1];
      if (c > dist[u]) continue;
      if (u === TARGET) break;
      if (endMap[u] !== undefined) {
        var nc = c + endMap[u];
        if (nc < dist[TARGET]) { dist[TARGET] = nc; prev[TARGET] = u; h.push([nc, TARGET, nc]); }
      }
      var CS = this.csrStart, CT = this.csrTo, CW = this.csrW, CTY = this.csrT;
      var canTransfer = !(prev[u] < 0 || prevType[u] === 1);   // harus naik ≥1 pemberhentian sebelum pindah
      for (var i = CS[u], iEnd = CS[u + 1]; i < iEnd; i++) {
        var v = CT[i], typ = CTY[i], w = CW[i], lvi = NLI[v];
        if (allowLi[lvi] === 0) continue;
        if (typ === 1) {
          if (!canTransfer) continue;
          if (ban && bannedNode(v)) continue;
          if (opts.avoid && opts.avoid[lvi]) continue;
        }
        var cost = c + w + (typ === 1 ? tp + (ww - 1) * Math.max(0, w - 3) : 0);
        if (typ === 1) {
          var lv = LINES[lvi];
          if (!openAt(lv, dep + cost)) continue;
          cost += waitAt(lv, dep + cost);
        }
        if (cost < dist[v]) { dist[v] = cost; prev[v] = u; prevType[v] = typ; h.push([cost + hcost(v), v, cost]); }
      }
    }
    if (dist[TARGET] === Infinity) return null;
    var path = [], x = prev[TARGET];
    while (x >= 0) { path.push(x); x = prev[x]; }
    path.reverse();
    return this._toItinerary(path, from, to, opts);
  };

  Planner.prototype._toItinerary = function (path, from, to, opts) {
    var self = this, legs = [];
    // Jangan ikut bus memutar demi jalan kaki sedikit lebih pendek: bila sisa perjalanan dari halte q ke halte
    // terakhir jauh lebih panjang dari jarak lurusnya (bus memutar/U-turn) dan halte q sudah cukup dekat dengan
    // tujuan, turun di halte q (mis. JAK108: turun di Ps. Hek 1, bukan memutar dulu ke Ps. Hek 2).
    if (path.length > 2) {
      var L = path.length - 1, s0 = L, nl = this.nodes[path[L]];
      while (s0 > 0 && this.nodes[path[s0 - 1]].li === nl.li && this.nodes[path[s0 - 1]].di === nl.di &&
             this.nodes[path[s0 - 1]].k === this.nodes[path[s0]].k - 1) s0--;
      var dkm = this.lines[nl.li].dirs[nl.di]._km, dEnd = hav(nl.p, to), bestQ = -1, bestD = Infinity;
      for (var q = s0 + 1; q < L; q++) {
        var nq = this.nodes[path[q]], dq = hav(nq.p, to);
        var remain = dkm[nl.k] - dkm[nq.k], straight = hav(nq.p, nl.p);
        if (remain > 2 * straight + 0.3 && dq <= 0.4 && (dq - dEnd) * WALK_DETOUR <= 0.3 && dq < bestD) { bestD = dq; bestQ = q; }
      }
      if (bestQ > 0) path = path.slice(0, bestQ + 1);
    }
    function access(a, b, label) {
      var km = hav(a, b);
      if (opts.access === "ojol" && km > 0.9) {
        var rk = km * ROAD_DETOUR;
        return { type: "ojol", kind: "motor", km: rk, min: ojolMinutes(rk, "motor"), fare: ojolMotor(rk), from: a, to: b, label: label };
      }
      return { type: "walk", km: km * WALK_DETOUR, min: walkMin(km), from: a, to: b, label: label };
    }
    var first = this.nodes[path[0]];
    legs.push(access(from, first.p, first.n));
    var i = 0;
    while (i < path.length) {
      var a = this.nodes[path[i]], j = i;
      while (j + 1 < path.length && this.nodes[path[j + 1]].li === a.li && this.nodes[path[j + 1]].di === a.di &&
             this.nodes[path[j + 1]].k === this.nodes[path[j]].k + 1) j++;
      var b = this.nodes[path[j]], line = this.lines[a.li], dir = line.dirs[a.di];
      var km = dir._km[b.k] - dir._km[a.k];
      var m = MODES[line.mode];
      // Label varian (mis. "via Tol") hanya bila potongan halte yang dinaiki memang beda dari pola utama.
      var variant = null;
      if (dir.v) {
        var seg = dir.s.slice(a.k, b.k + 1).map(function (x) { return x.n; }).join("\u0001");
        var same = line.dirs.some(function (dd) { return !dd.v && dd.s.map(function (x) { return x.n; }).join("\u0001").indexOf(seg) >= 0; });
        if (!same) variant = dir.v;
      }
      legs.push({
        type: "ride", line: line, dirIndex: a.di, variant: variant, headsign: dir.s[dir.s.length - 1].n,
        fromK: a.k, toK: b.k, from: a.n, to: b.n, fromP: a.p, toP: b.p,
        stops: dir.s.slice(a.k, b.k + 1), km: km,
        wait: m.wait, min: km / m.speed * 60 + (b.k - a.k) * m.dwell,
        fare: legFare(line, km, a.n, b.n, b.k - a.k)
      });
      if (j + 1 < path.length) {
        var c = this.nodes[path[j + 1]];
        var tk = hav(b.p, c.p);
        legs.push({ type: "transfer", km: tk * WALK_DETOUR, min: walkMin(tk), from: b.n, to: c.n, fromP: b.p, toP: c.p });
      }
      i = j + 1;
    }
    var last = this.nodes[path[path.length - 1]];
    legs.push(access(last.p, to, last.n));
    return summarize(legs, opts.depMin == null ? nowMin() : opts.depMin, this.isHalte.bind(this), this.dow);
  };

  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  /* Tarif Transjakarta: Rp3.500 sekali tap masuk (Rp2.000 pukul 05.00–07.00). Pindah rute GRATIS selama
     penumpang tidak keluar halte (turun & naik lagi di halte yang sama). Bila turun di luar halte
     (pemberhentian pinggir jalan) atau berjalan ke halte lain, harus tap lagi = bayar lagi.
     Mikrotrans gratis; Royaltrans Rp20.000 per naik. */
  var TJ_FAMILY = function (l) { return (l.mode === "TJ" || (l.mode === "ROYAL" && l.cat === "JABODETABEK")) && !premiumFare(l); };
  /* LRT Jabodebek: jam sibuk hari kerja 06.00–08.59 & 16.00–19.59 → Rp5.000 + Rp700/km (maks. Rp20.000);
     di luar jam sibuk, Sabtu, Minggu (dan hari libur) maksimal Rp10.000. */
  function lrtjPeak(mm, dow) {
    if (dow === 0 || dow === 6) return false;
    return (mm >= 360 && mm < 540) || (mm >= 960 && mm < 1200);
  }
  function summarize(legs, depMin, isHalte, dow) {
    var min = 0, fareLo = 0, fareHi = 0, rides = 0, prevRide = null, walkSince = 0;
    isHalte = isHalte || function () { return false; };
    legs.forEach(function (l) {
      if (l.type === "ride") { l.wait = waitAt(l.line, depMin + min); l.night = isNight(depMin + min) && (l.line.mode === "TJ" || l.line.mode === "MIKRO"); }
      min += l.min + (l.wait || 0);
      if (l.type === "ride") {
        rides++;
        var f = l.fare;
        l.fareNote = "";
        if (l.line.mode === "LRTJ" && f > 10000) {
          var mmL = ((depMin + min - l.min) % 1440 + 1440) % 1440;
          var dayL = dow == null ? 1 : (dow + Math.floor((depMin + min - l.min) / 1440)) % 7;
          if (!lrtjPeak(mmL, dayL)) { f = 10000; l.fareNote = (dayL === 0 || dayL === 6 ? "akhir pekan" : "di luar jam sibuk") + ": maks. Rp10.000"; }
          else l.fareNote = "jam sibuk: Rp5.000 + Rp700/km";
        }
        if (TJ_FAMILY(l.line) && f > 0) {
          var mm = ((depMin + min - l.min) % 1440 + 1440) % 1440;
          if (mm >= 300 && mm < 420) f = 2000;          // tarif Rp2.000 pukul 05.00–07.00
          var free = prevRide && TJ_FAMILY(prevRide.line) && prevRide.farePaid !== undefined && walkSince <= 0.12 &&
            isHalte(prevRide.toP) && isHalte(l.fromP);
          if (free) { f = 0; l.fareNote = "transit di dalam halte, tanpa tap ulang"; }
          else if (prevRide && TJ_FAMILY(prevRide.line)) l.fareNote = "tap lagi: turun di luar halte";
        }
        l.farePaid = f; fareLo += f; fareHi += f;
        prevRide = l; walkSince = 0;
      } else {
        if (l.fare) { fareLo += l.fare.lo; fareHi += l.fare.hi; }
        if (l.type === "ojol") walkSince += 99; else walkSince += l.km || 0;
      }
    });
    legs = legs.filter(function (l) { return !(l.type === "walk" && l.km < 0.03); });
    return { legs: legs, min: Math.round(min), fareLo: fareLo, fareHi: fareHi, transfers: Math.max(0, rides - 1) };
  }


  function directOjol(from, to, kind) {
    var km = hav(from, to) * ROAD_DETOUR;
    var fare = kind === "car" ? ojolCar(km) : ojolMotor(km);
    var leg = { type: "ojol", kind: kind, km: km, min: ojolMinutes(km, kind), fare: fare, from: from, to: to };
    return { legs: [leg], min: Math.round(leg.min), fareLo: fare.lo, fareHi: fare.hi, transfers: 0, direct: kind };
  }

  function signature(it) {
    return it.legs.filter(function (l) { return l.type === "ride"; })
      .map(function (l) { return l.line.code + (l.variant ? "#" + l.variant : "") + "@" + l.from + ">" + l.to; }).join("|") + "/" +
      it.legs.filter(function (l) { return l.type === "ojol"; }).length;
  }

  Planner.prototype.plan = function (from, to, roadKm, depMin, dow) {
    var self = this;
    this.dow = dow == null ? new Date().getDay() : dow;   // hari (0 = Minggu) untuk tarif yang bergantung hari
    PLAN_DOW = this.dow;
    if (depMin == null) depMin = nowMin();
    var directKm = hav(from, to);
    var results = [];
    function notWhoosh(l) { return l.mode !== "WHOOSH" || directKm > 60; }
    var variants = [
      { tag: "", access: "walk", transferPenalty: 2, allow: notWhoosh },
      { tag: "", access: "walk", transferPenalty: 18, allow: notWhoosh },
      { tag: "Kereta", access: "ojol", transferPenalty: 4, allow: function (l) { return !!RAIL[l.mode]; } },
      { tag: "Kereta", access: "walk", transferPenalty: 4, allow: function (l) { return !!RAIL[l.mode]; } },
      { tag: "Bus", access: "walk", transferPenalty: 3, allow: function (l) { return !!BUS[l.mode]; } },
      { tag: "", access: "walk", transferPenalty: 3, walkWeight: 3.2, allow: notWhoosh },
      { tag: "Ojol + transit", access: "ojol", transferPenalty: 6, allow: notWhoosh }
    ];
    var seen = {}, looseSeen = {};
    function isRide(l) { return l.type === "ride"; }
    function loose(it) {
      return it.legs.filter(isRide).map(function (l) { return l.line.mode + "@" + l.from + ">" + l.to; }).join("|");
    }
    if (directKm > 0.4) {
      function consider(v, given) {
        var it = given || null;
        if (!it) {
          v.depMin = depMin;
          try { it = self.search(from, to, v); } catch (e) { it = null; }
        }
        if (!it) return null;
        var rideKm = 0, ojolKm = 0, walkKm = 0;
        it.legs.forEach(function (l) {
          if (l.type === "ride") rideKm += l.km; else if (l.type === "ojol") ojolKm += l.km; else walkKm += l.km;
        });
        if (rideKm < 0.5) return null;
        // Buang naik "0 km" (mis. rute melingkar Makasar→Makasar).
        if (it.legs.some(function (l) { return l.type === "ride" && (l.km < 0.3 || l.from === l.to); })) return null;
        if (ojolKm > rideKm * 0.5) return null;     // ojol mendominasi: lebih baik ojol langsung
        if (walkKm > 2.6) return null;              // jalan kaki terlalu jauh
        // Bolak-balik: turun di dekat tempat naik rute sebelumnya (mis. 9C Makasar→Pinang Ranti lalu 9N kembali ke Makasar).
        var rl = it.legs.filter(function (l) { return l.type === "ride" && l.fromP && l.toP; });
        for (var i1 = 1; i1 < rl.length; i1++)
          for (var i0 = 0; i0 < i1; i0++) if (hav(rl[i1].toP, rl[i0].fromP) < 0.6) return null;
        var sig = signature(it);
        if (seen[sig]) return seen[sig];
        // Rute berkode beda (mis. 9 dan 9A) sengaja TIDAK digabung: masing-masing jadi opsi sendiri.
        it.tags = v.tag ? [v.tag] : [];
        seen[sig] = it;
        results.push(it);
        return it;
      }
      variants.forEach(function (v) { consider(v); });

      // Alternatif beragam (semua kombinasi): setiap rute angkutan umum pada opsi yang sudah ditemukan
      // "dilarang" satu per satu, lalu dicari ulang. Hasil baru diproses lagi dengan cara yang sama
      // (pencarian melebar) sampai jatah pencarian habis. Contoh: 7B→9D, JAK108→LRT, JAK36→LRT, 7B→4B, …
      function hasOj(r) { return r.legs.some(function (l) { return l.type === "ojol"; }); }
      var queue = results.filter(function (r) { return !hasOj(r); }).sort(function (x, y) { return x.min - y.min; });
      queue.forEach(function (r) { r._ban = {}; });
      var triedBan = {}, budget = 24, qi = 0;
      while (qi < queue.length && budget > 0) {
        var base = queue[qi++];
        var rides = base.legs.filter(function (l) { return l.type === "ride"; });
        for (var ri = 0; ri < rides.length && budget > 0; ri++) {
          var l = rides[ri], nb = {};
          for (var k in base._ban) nb[k] = 1;
          // Larang seluruh rute (semua arah & pola) supaya tidak muncul lagi lewat pola lain yang sama saja.
          nb[l.line._i] = 1;

          var key = Object.keys(nb).sort().join(",");
          if (triedBan[key]) continue;
          triedBan[key] = 1; budget--;
          var before = results.length;
          var alt = consider({ tag: "", access: "walk", transferPenalty: 3, allow: notWhoosh, ban: nb });
          // Tetap telusuri lebih dalam walau hasilnya sudah pernah ditemukan (dengan larangan yang bertambah).
          if (alt && !hasOj(alt)) queue.push({ legs: alt.legs, _ban: nb });
        }
      }

      // Penjelajahan sistematis: semua rute langsung dan semua kombinasi 2 rute
      // (rute dekat asal × rute dekat tujuan, pindah jalan kaki ≤500 m), mis. 9/9C → Makasar → JAK36/JAK108.
      var combos = [];
      try { combos = self._combos(from, to, depMin, notWhoosh); } catch (e) { combos = []; }
      combos.forEach(function (it) { consider({ tag: "" }, it); });
    }
    // Rute transit yang jalan kakinya terlalu jauh dibuang jika ada alternatif.
    var motor = directOjol(from, to, "motor"), car = directOjol(from, to, "car");
    if (roadKm) {
      [motor, car].forEach(function (o) {
        var kind = o.direct, km = roadKm;
        o.legs[0].km = km; o.legs[0].min = ojolMinutes(km, kind);
        o.legs[0].fare = kind === "car" ? ojolCar(km) : ojolMotor(km);
        o.min = Math.round(o.legs[0].min); o.fareLo = o.legs[0].fare.lo; o.fareHi = o.legs[0].fare.hi;
      });
    }
    motor.tags = ["Ojol motor"]; car.tags = ["Ojol mobil"];
    // Rute transit yang jauh lebih lama dari ojol (mis. tengah malam) tidak masuk akal ditawarkan.
    // Buang hanya yang benar-benar tidak masuk akal dibanding ojol. Malam hari bus AMARI datang tiap 20–40 menit,
    // jadi perjalanan bisa jauh lebih lama dari ojol tapi tetap pilihan murah yang sah (mis. TJ 9 pukul 22.30).
    results = results.filter(function (r) { return r.transfers <= 3 && r.min <= Math.max(motor.min * 5, motor.min + 120); });
    function hasOjol(r) { return r.legs.some(function (l) { return l.type === "ojol"; }); }
    // Urutan: angkutan umum murni dulu (urut waktu), lalu kombinasi ojol + angkutan umum.
    // Urutan memperhitungkan jalan kaki: tiap 1 km jalan kaki di atas 600 m dianggap "+8 menit"
    // (penumpang lebih suka naik mikrotrans daripada jalan 1,4 km).
    function score(r) {
      var w = r.legs.reduce(function (s, l) { return s + (l.type === "walk" || l.type === "transfer" ? l.km : 0); }, 0);
      return r.min + 8 * Math.max(0, w - 0.6);
    }
    results.sort(function (a, b) { return (hasOjol(a) - hasOjol(b)) || (score(a) - score(b)); });
    var bestPure = results.filter(function (r) { return !hasOjol(r); }).reduce(function (m, r) { return Math.min(m, r.min); }, Infinity);
    results = results.filter(function (r) { return hasOjol(r) || r.min <= bestPure + 60; });
    // Buang opsi yang hanya "menambah" rute di depan/di belakang opsi lain tanpa untung (mis. 9D satu halte
    // lalu jalan ke 9, padahal bisa langsung jalan ke 9): lebih mahal/sama dan tidak lebih cepat.
    function rideKeys(r) { return r.legs.filter(isRide).map(function (l) { return l.line.id + "@" + l.from + ">" + l.to; }); }
    function walkOf(r) { return r.legs.reduce(function (s, l) { return s + (l.type === "walk" || l.type === "transfer" ? l.km : 0); }, 0); }
    var keyed = results.map(function (r) { return { r: r, k: rideKeys(r), w: walkOf(r) }; });
    results = keyed.filter(function (x) {
      if (hasOjol(x.r)) return true;
      return !keyed.some(function (y) {
        if (y === x || hasOjol(y.r) || y.k.length >= x.k.length || !y.k.length) return false;
        var n = y.k.length, suf = x.k.slice(x.k.length - n).join("|") === y.k.join("|"),
          pre = x.k.slice(0, n).join("|") === y.k.join("|");
        return (suf || pre) && y.r.fareLo <= x.r.fareLo && y.r.min <= x.r.min + 3 && y.w <= x.w + 0.3;
      });
    }).map(function (x) { return x.r; });
    // Opsi yang tampil identik (rute sama berurutan, waktu & tarif sama) cukup satu.
    var shown = {};
    results = results.filter(function (r) {
      var k = r.legs.filter(isRide).map(function (l) { return l.line.code + (l.variant ? "*" : ""); }).join(">") + "|" + r.min + "|" + r.fareLo + "|" + hasOjol(r);
      if (shown[k]) return false;
      shown[k] = 1; return true;
    });
    // Rute sama berurutan (mis. JAK36 saja) tapi beda halte naik/turun: buang yang kalah di semua hal
    // (lebih lama/sama, lebih mahal/sama, jalan kaki lebih jauh/sama). Tidak ada pemborosan rute.
    var byCodes = results.map(function (r) {
      return { r: r, c: r.legs.filter(isRide).map(function (l) { return l.line.code; }).join(">") + "|" + hasOjol(r), w: walkOf(r) };
    });
    results = byCodes.filter(function (x) {
      return !byCodes.some(function (y) {
        if (y === x || y.c !== x.c) return false;
        // "Hampir sama atau lebih baik" di semua hal (selisih ≤2 menit / ≤150 m jalan dianggap sama),
        // dan lebih baik secara keseluruhan → opsi x hanya pemborosan.
        if (!(y.r.fareLo <= x.r.fareLo && y.r.min <= x.r.min + 2 && y.w <= x.w + 0.15)) return false;
        var sy = score(y.r), sx = score(x.r);
        return sy < sx || (sy === sx && byCodes.indexOf(y) < byCodes.indexOf(x));
      });
    }).map(function (x) { return x.r; });
    var pureList = results.filter(function (r) { return !hasOjol(r); }).slice(0, 40);
    var ojolList = results.filter(hasOjol).slice(0, 4);
    results = pureList.concat(ojolList);
    if (results.length) {
      results.forEach(function (r) { r.tags = []; });
      var pool = pureList.length ? pureList : results;
      var fastest = pool.reduce(function (a, b) { return a.min <= b.min ? a : b; });
      var cheapest = pool.reduce(function (a, b) { return a.fareLo < b.fareLo || (a.fareLo === b.fareLo && a.min <= b.min) ? a : b; });
      var fewest = pool.reduce(function (a, b) { return a.transfers < b.transfers || (a.transfers === b.transfers && a.min <= b.min) ? a : b; });
      fastest.tags.push("Tercepat");
      if (cheapest.tags.indexOf("Termurah") < 0) cheapest.tags.push("Termurah");
      if (fewest !== fastest && fewest !== cheapest) fewest.tags.push("Minim transit");
      var RAILNAME = { KRL: "KRL", MRT: "MRT", LRT: "LRT", LRTJ: "LRT", KABANDARA: "KA Bandara", WHOOSH: "Whoosh" };
      results.forEach(function (r) {
        var rail = null, bus = null, mikro = false;
        r.legs.forEach(function (l) {
          if (l.type !== "ride") return;
          if (RAIL[l.line.mode]) rail = rail || RAILNAME[l.line.mode];
          else { bus = true; if (l.line.mode === "MIKRO") mikro = true; }
        });
        var label = hasOjol(r) ? "Ojol + " + (rail || "bus") : rail && bus ? (mikro ? "Mikrotrans" : "Bus") + " + " + rail : rail ? rail : mikro ? "Mikrotrans" : "Bus";
        if (r.tags.indexOf(label) < 0) r.tags.push(label);
      });
    }
    results.push(motor, car);
    return results;
  };

  /*
   * Enumerasi rute langsung + kombinasi dua rute. Melengkapi Dijkstra (yang hanya memberi satu jawaban
   * terbaik per pencarian) supaya semua pilihan wajar muncul.
   */
  Planner.prototype._combos = function (from, to, dep, allow) {
    var nodes = this.nodes, lines = this.lines, adj = this.adj, R = 1.2;
    function rideMin(l, d, k1, k2) { var m = MODES[l.mode]; return (d._km[k2] - d._km[k1]) / m.speed * 60 + (k2 - k1) * m.dwell; }
    var boardAll = {}, alightAll = {};
    this.nearby(from, R, allow).forEach(function (e) {
      var nd = nodes[e[0]], l = lines[nd.li], d = l.dirs[nd.di];
      if (nd.k === d.s.length - 1) return;
      var key = nd.li + ":" + nd.di;
      (boardAll[key] = boardAll[key] || []).push({ i: e[0], k: nd.k, km: e[1] });
    });
    this.nearby(to, R, allow).forEach(function (e) {
      var nd = nodes[e[0]];
      if (nd.k === 0) return;
      var key = nd.li + ":" + nd.di;
      (alightAll[key] = alightAll[key] || []).push({ i: e[0], k: nd.k, km: e[1] });
    });
    function walkC(km) { return walkMin(km) * 1.6; }
    // Halte naik: yang terdekat, plus halte di bagian lain rute bila rute memutar (maks. 3).
    var boardList = {};
    Object.keys(boardAll).forEach(function (key) {
      var arr = boardAll[key].sort(function (p, q) { return p.km - q.km; }), picked = [];
      for (var q = 0; q < arr.length && picked.length < 3; q++)
        if (picked.every(function (pp) { return Math.abs(pp.k - arr[q].k) > 3; })) picked.push(arr[q]);
      boardList[key] = picked;
    });
    // Halte turun: yang terbaik SETELAH halte naik (bukan sekadar terdekat ke tujuan).
    function bestAlight(key, fromK) {
      var arr = alightAll[key]; if (!arr) return null;
      var nd = nodes[arr[0].i], l = lines[nd.li], d = l.dirs[nd.di], best = null, bc = Infinity;
      for (var q = 0; q < arr.length; q++) {
        if (arr[q].k <= fromK) continue;
        var c = rideMin(l, d, fromK, arr[q].k) + walkC(arr[q].km);
        if (c < bc) { bc = c; best = arr[q]; }
      }
      return best;
    }
    var cands = [], direct = {};
    var self = this;
    // 1) satu rute
    Object.keys(boardList).forEach(function (key) { boardList[key].forEach(function (b) {
      var a = bestAlight(key, b.k);
      if (!a) return;
      var nd = nodes[b.i], l = lines[nd.li], d = l.dirs[nd.di];
      var t0 = walkMin(b.km);
      if (!openAt(l, dep + t0)) return;
      var est = walkC(b.km) + waitAt(l, dep + t0) + rideMin(l, d, b.k, a.k) + walkC(a.km);
      if (!direct[nd.li] || direct[nd.li].est > est) direct[nd.li] = { est: est, w0: b.km, w1: a.km };
      var path = []; for (var k = b.k; k <= a.k; k++) path.push(d._start + k);
      cands.push({ est: est, path: path, key: "L" + nd.li });
    }); });
    // 2) dua rute: naik A dekat asal, pindah (jalan kaki) ke B, turun dekat tujuan
    var best = {};
    Object.keys(boardList).forEach(function (keyA) { boardList[keyA].forEach(function (b) {
      var na = nodes[b.i], la = lines[na.li], da = la.dirs[na.di];
      var t0 = walkMin(b.km);
      if (!openAt(la, dep + t0)) return;
      var base = walkC(b.km) + waitAt(la, dep + t0);
      for (var k = b.k + 1; k < da.s.length; k++) {
        var u = da._start + k, ed = adj[u];
        var ra = rideMin(la, da, b.k, k);
        for (var x = 0; x < ed.length; x++) {
          if (ed[x][2] !== 1) continue;
          var v = ed[x][0], nv = nodes[v], keyB = nv.li + ":" + nv.di;
          if (!alightAll[keyB]) continue;
          var a = bestAlight(keyB, nv.k);
          if (!a) continue;
          var lb = lines[nv.li];
          if (lb === la || lb.code === la.code || !allow(lb)) continue;
          var db = lb.dirs[nv.di];
          var tArr = base + ra + ed[x][1] * 1.6;
          if (!openAt(lb, dep + tArr)) continue;
          var est = tArr + waitAt(lb, dep + tArr) + rideMin(lb, db, nv.k, a.k) + walkC(a.km) + 2;
          var pk = na.li + ">" + nv.li;
          if (!best[pk] || best[pk].est > est) best[pk] = { est: est, a: [da._start + b.k, u], b: [v, db._start + a.k], la: na.li, lb: nv.li, w0: b.km, w1: a.km };
        }
      }
    }); });
    Object.keys(best).forEach(function (pk) {
      var c = best[pk];
      // Pindah tidak masuk akal bila salah satu rute saja sudah sampai dan tidak lebih lambat.
      // (Tetap ditampilkan bila rute langsung itu butuh jalan kaki jauh lebih panjang, mis. 9 → Makasar lalu jalan 1,4 km
      //  vs 9 → Makasar → JAK36.)
      var dA = direct[c.la], dB = direct[c.lb];
      if (dA && dA.est <= c.est + 3 && dA.w1 <= c.w1 + 0.3) return;
      if (dB && dB.est <= c.est + 3 && dB.w0 <= c.w0 + 0.3) return;
      var path = [];
      for (var i = c.a[0]; i <= c.a[1]; i++) path.push(i);
      for (var j = c.b[0]; j <= c.b[1]; j++) path.push(j);
      cands.push({ est: c.est, path: path, key: pk });
    });
    if (!cands.length) return [];
    cands.sort(function (x, y) { return x.est - y.est; });
    var lim = cands[0].est + 70;
    return cands.filter(function (c) { return c.est <= lim; }).slice(0, 45).map(function (c) {
      return self._toItinerary(c.path, from, to, { access: "walk", depMin: dep });
    });
  };

  Planner.prototype.searchLines = function (q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return this.lines;
    var exact = [], part = [];
    this.lines.forEach(function (l) {
      var code = l.code.toLowerCase().replace(/[.\-\s]/g, "");
      var hay = (l.code + " " + l.name + " " + MODES[l.mode].label + " " +
        (l.dirs[0] ? l.dirs[0].s.map(function (s) { return s.n; }).join(" ") : "")).toLowerCase();
      var qn = q.replace(/^(tj|koridor|rute|jak lingko)\s*/, "").replace(/[.\-\s]/g, "");
      if (code === qn) exact.push(l);
      else if (hay.indexOf(q) >= 0 || (qn.length >= 3 && code.indexOf(qn) === 0)) part.push(l);
    });
    return exact.concat(part);
  };

  /* Stop/stasiun dengan nama cocok (untuk pencarian tempat offline) */
  Planner.prototype.searchStops = function (q, limit) {
    q = (q || "").trim().toLowerCase();
    if (q.length < 2) return [];
    var seen = {}, out = [];
    for (var i = 0; i < this.nodes.length; i++) {
      var nd = this.nodes[i], l = this.lines[nd.li];
      if (nd.n.toLowerCase().indexOf(q) < 0) continue;
      var key = nd.n + "|" + l.mode;
      if (seen[key]) continue; seen[key] = 1;
      var rank = (RAIL[l.mode] ? 0 : l.brt ? 1 : 2) + (nd.n.toLowerCase().indexOf(q) === 0 ? 0 : 0.5);
      out.push({ name: nd.n, p: nd.p, mode: l.mode, rank: rank, sub: (RAIL[l.mode] ? "Stasiun " : "Halte ") + MODES[l.mode].label });
    }
    out.sort(function (a, b) { return a.rank - b.rank; });
    return out.slice(0, limit || 8);
  };

  /* Rute lain yang singgah di halte/stasiun ini (untuk info transit). */
  Planner.prototype.connections = function (line, p) {
    var seen = {}, out = [];
    var near = this.nearby(p, 0.4);
    for (var i = 0; i < near.length; i++) {
      var l = this.lines[this.nodes[near[i][0]].li];
      if (l === line || seen[l.id]) continue;
      seen[l.id] = 1; out.push(l);
    }
    return out;
  };

  Planner.prototype.closedAt = function (m) {
    var seen = {}, out = [];
    this.lines.forEach(function (l) {
      if (l.noStops || openAt(l, m)) return;
      var k = l.mode === "TJ" ? (l.brt ? "Transjakarta BRT (selain koridor 1–14)" : "Transjakarta non-BRT") :
        l.mode === "MIKRO" ? "Mikrotrans (kecuali JAK36/47/52/75)" : MODES[l.mode].label;
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    });
    return out;
  };

  var api = { Planner: Planner, MODES: MODES, RAIL: RAIL, hav: hav, openAt: openAt, isNight: isNight, ojolMotor: ojolMotor, ojolCar: ojolCar, ojolMinutes: ojolMinutes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LumiEngine = api;
})(typeof window !== "undefined" ? window : this);
