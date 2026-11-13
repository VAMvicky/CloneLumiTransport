#!/usr/bin/env node
/*
 * Uji lapisan Google tanpa jaringan (dipakai CI).
 *
 * Yang dikunci di sini adalah perilaku yang gampang rusak tanpa kelihatan:
 *  - kegagalan satu kemampuan tidak mematikan yang lain,
 *  - OVER_QUERY_LIMIT hanya menidurkan (cooldown), bukan mematikan permanen,
 *  - REQUEST_DENIED tetap permanen untuk kemampuan itu,
 *  - Place Details memakai sessiontoken dan cache lokal.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "app", "src", "main", "assets", "www", "js", "gmaps.js");

function storage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); }
  };
}

function load() {
  const code = fs.readFileSync(SRC, "utf8");
  const quiet = { warn() {}, log() {}, error() {} };
  const sandbox = {
    window: { devicePixelRatio: 2 },
    localStorage: storage(),
    console: quiet,
    Date, Math, JSON, Promise, encodeURIComponent
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "gmaps.js" });
  if (!sandbox.LumiGoogle) throw new Error("LumiGoogle tidak terdefinisi setelah dimuat");
  return sandbox.LumiGoogle;
}

let fails = 0;
function check(cond, msg) {
  if (cond) { console.log("  ok   " + msg); }
  else { fails++; console.error("  FAIL " + msg); }
}

const DETAIL_OK = {
  status: "OK",
  result: { name: "Monas", formatted_address: "Jakarta", geometry: { location: { lat: -6.17, lng: 106.82 } } }
};

(async function main() {
  console.log("uji lapisan Google");

  /* 1. isolasi kegagalan + cooldown + cache + sessiontoken */
  {
    const G = load();
    const calls = [];
    G.bind((url) => {
      calls.push(url);
      if (url.indexOf("nearbysearch") >= 0) return Promise.resolve({ status: "REQUEST_DENIED", error_message: "denied" });
      if (url.indexOf("autocomplete") >= 0) return Promise.resolve({ status: "OVER_QUERY_LIMIT" });
      return Promise.resolve(DETAIL_OK);
    });

    try { await G.nearby([-6.2, 106.8], "transit_station", 500); } catch (e) { /* diharapkan */ }
    check(G.isDown("nearby"), "nearby ditolak -> hanya nearby yang mati");
    check(!G.isDown("details"), "details tetap hidup saat nearby mati");

    try { await G.autocomplete("monas"); } catch (e) { /* diharapkan */ }
    check(G.isDown("autocomplete"), "OVER_QUERY_LIMIT -> autocomplete tidur");
    check(/dtk/.test(G.reason("autocomplete") || ""), "alasan autocomplete menyebut sisa cooldown");
    check(!G.isDown(), "seluruh lapisan belum mati (masih ada yang hidup)");

    const d1 = await G.details("place-1");
    check(d1 && d1.name === "Monas", "details tetap jalan walau autocomplete + nearby mati");
    const before = calls.length;
    await G.details("place-1");
    check(calls.length === before, "details kedua dilayani cache, tanpa panggilan baru");
    check(calls.some((u) => /sessiontoken=lumi-/.test(u)), "sessiontoken ikut di URL detail");
    check(!!G.isDown("autocomplete"), "cache tidak menghidupkan kembali autocomplete");

    G.reset();
    check(!G.isDown("autocomplete") && !G.isDown("nearby"), "reset() memulihkan semua kemampuan");
  }

  /* 2. penolakan kunci tetap permanen per kemampuan */
  {
    const G = load();
    G.bind(() => Promise.resolve({ status: "REQUEST_DENIED", error_message: "key rejected" }));
    try { await G.details("x"); } catch (e) { /* diharapkan */ }
    check(G.isDown("details"), "REQUEST_DENIED mematikan details");
    G.reset("autocomplete");
    check(G.isDown("details"), "reset kemampuan lain tidak menghidupkan details");
    G.reset("details");
    check(!G.isDown("details"), "reset('details') memulihkan details");
  }

  /* 3. respons sukses tidak menandai apa pun mati */
  {
    const G = load();
    G.bind(() => Promise.resolve({ status: "OK", predictions: [{ place_id: "p", structured_formatting: { main_text: "Blok M" } }] }));
    const preds = await G.autocomplete("blok m");
    check(preds.length === 1 && preds[0].name === "Blok M", "autocomplete memetakan predictions");
    check(!G.isDown(), "sukses tidak menyalakan status mati");
  }

  if (fails) { console.error("\n" + fails + " pemeriksaan gagal"); process.exit(1); }
  console.log("\nSemua pemeriksaan lapisan Google lulus");
})();
