<div align="center">

<img src="docs/logo.png" width="112" alt="Lumi Transport logo">

# ✦ Lumi Transport ✦

### An all-modes journey planner for Greater Jakarta, on Android

*Transjakarta · Mikrotrans · KRL · MRT · LRT · Airport Rail · Whoosh · ride-hailing, in one route*

[![Release](https://img.shields.io/github/v/release/VAMvicky/LumiTransport?label=release&color=1565D8&style=for-the-badge)](https://github.com/VAMvicky/LumiTransport/releases/latest)
[![Android](https://img.shields.io/badge/Android-8.0%2B-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#-requirements)
[![Java](https://img.shields.io/badge/Java-WebView-38BDF8?style=for-the-badge&logo=openjdk&logoColor=white)](#%EF%B8%8F-tech-stack)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue?style=for-the-badge)](LICENSE)
[![Size](https://img.shields.io/badge/APK-~0.9%20MB-00897B?style=for-the-badge)](#-why-lumi-transport)

**🌐 Bahasa / Language:** &nbsp; [🇮🇩 Bahasa Indonesia](README.md) &nbsp;|&nbsp; **🇬🇧 English**

[⬇️ Download](#%EF%B8%8F-download--install) · [📸 Screenshots](#-screenshots) · [✨ Features](#-features) · [💸 Fares](#-fares-used) · [📖 User Guide](#-user-guide) · [❓ FAQ](#-faq--troubleshooting) · [📝 Changelog](CHANGELOG.md)

</div>

---

## 🌟 Why Lumi Transport?

> Enter an **origin** and a **destination**, and Lumi works out **every sensible public-transport combination** (bus, minibus, train, even ride-hailing) with **travel time, fare, and where to get off**. Once you're on your way, Lumi **guides you with GPS** and tells you when to get off.

| | |
|---|---|
| 🗺️ **Every route combination** | Routes 9 and 9A appear as separate options, and so do JAK36 → LRT, 9C → Makasar → JAK108 and more. Not just one answer. |
| 🎯 **Filters you control** | Sort by Fastest, Cheapest or Fewest transfers, then pick modes: only trips that **include TJ**, or TJ + LRT, and so on. |
| 🚌 **Live bus positions** | **Buses near you** shows current Transjakarta, Mikrotrans, Royaltrans and Transjabodetabek buses on the map. Trip details estimate the **next bus at your boarding stop**, and route details list every bus on that route. |
| 🧭 **GPS guidance** | See where you are, **how many stops are left**, and feel a vibration for **"Get ready"** and **"Get off now"**, even with the screen off. |
| 🔔 **Know when routes change** | Official Transjakarta data is **checked regularly**. New routes, removed routes or changed stops trigger a **notification**. |
| 🖼️ **Share as an image** | Every route can be shared as a **clean image** to WhatsApp, Instagram or anywhere. |
| 💸 **Correct fares** | Transferring inside a station is free; leaving the station means tapping in again. Covers SH2, Hub Connector, MRT per-station fares and Airport Rail. |
| 🌙 **Knows opening hours** | At midnight Lumi only uses 24-hour services (AMARI corridors 1–14, JAK36/47/52/75) and ride-hailing. |
| 📍 **Addresses from Google** | Address suggestions straight from Google Places while you type, using Google Maps' **internal API key** (package and certificate are spoofed). Coordinates are filled in automatically. |
| 🪶 **Tiny and offline** | About **0.9 MB** (map engine and fonts included). Official Transjakarta route data is downloaded automatically after install instead of being bundled. Route planning runs **on your phone**, with no server; the Jabodetabek map can be downloaded to work **without internet**. |

---

## 📸 Screenshots

<div align="center">

| 👋 Welcome | ✅ One more step | 🏠 Home |
|:-:|:-:|:-:|
| <img src="docs/screenshots/sambutan.jpg" width="240" alt="Welcome screen"> | <img src="docs/screenshots/izin.jpg" width="240" alt="Permissions screen"> | <img src="docs/screenshots/beranda.jpg" width="240" alt="Home"> |
| **Get to know Lumi on one screen**, no scrolling. | **Only the permissions that matter**: location, notifications, background running, plus an "Auto-start" shortcut for Xiaomi, Oppo, Vivo, Realme and Infinix. | **Route changes up front**: new, removed or changed routes, one tap away. |

| 🗺️ All options | 🎯 Mode & sort filters | 🧭 GPS guidance |
|:-:|:-:|:-:|
| <img src="docs/screenshots/hasil.jpg" width="240" alt="Results"> | <img src="docs/screenshots/filter.jpg" width="240" alt="Filters"> | <img src="docs/screenshots/pendampingan.jpg" width="240" alt="Guidance"> |
| **Compare at a glance**: colour strip per line, time, fare, transfers and a **Share route** button on every card. | **Only trips with TJ, cheapest first.** Or TJ + LRT, Mikrotrans, KRL, MRT, ride-hailing. | **Never miss your stop**: "Get ready!" one stop before, with vibration. |

| 🧭 Clear directions & variants |
|:-:|
| <img src="docs/screenshots/arah-rute.jpg" width="240" alt="Directions"> |
| **9N: Pinang Ranti – Simpang Cawang**, two clear directions, and every variant described (via toll, via Senen, …). |

| 🖼️ Share as image | 💸 Up-to-date fares |
|:-:|:-:|
| <img src="docs/screenshots/gambar-rute.jpg" width="240" alt="Route image"> | <img src="docs/screenshots/tarif.jpg" width="240" alt="Fares"> |
| **Send a route to friends or family** as an image: boarding times, direction, where to get off, fare per leg. | **Fares as of October 2026**, including SH2 Rp15,000 and Hub Connector Rp20,000. |

</div>

---

## ✨ Features

**🆕 New in v2.18.3**
- 🕒 Bus arrival estimates are checked against the bus's distance to the stop: no more "±5 min" for buses still far away or already past

**🆕 New in v2.18.2**
- 🛠️ Guidance no longer force-closes: the bus fleet-feed connection no longer writes to the network from the main thread

**🆕 New in v2.18.1**
- 🛠️ Guidance no longer force-closes when it starts (the Android 16 Live Update notification style was removed because some ROMs reject it)
- 🧭 One-way stops: buses going the other way are now filtered using the bus's own list of remaining stops

**🆕 New in v2.18**
- ⬇️ **In-app updates**: Settings → About → "Check & install update" downloads the latest APK and opens the installer, no GitHub visit needed
- 🧭 **Only buses going your way**: at one-way stops (e.g. "Pancoran Arah Timur") and in a route's per-direction view, buses going the other way are no longer shown — in the list or on the map
- ✨ The permissions screen fits on one screen without scrolling; tidier button spacing on the stop sheet
- 🛠️ Fixes: guidance with voice on no longer closes the app; the speech engine is found on Android 11+
- 🧹 Widgets and the "Report a problem" feature were removed

**🆕 New in v2.17**
- 🗺️ **Jabodetabek offline map**: download once (Settings → Offline map) and the map keeps working without internet — used automatically when you lose signal, or pick it as the map style
- 🗣️ **Voice guidance from the guidance service**: steps, stops left and "get off now" are read out even with the screen off; navigation audio briefly lowers your music
- 📊 **Live progress notification**: a trip progress bar in the notification
- ⚙️ **Route preferences**: longest walk, most transfers, modes to avoid, hide ride-hailing, default order
- 💰 **Monthly spending summary** in History, split by mode
- 💾 **Export & import** everything to one file (favourites, history, places, reminders, preferences) — switch phones without losing anything
- 📅 **Fares with effective dates**: announced fare changes apply automatically from their start date (e.g. the 2027 TJ fare)
- 🛠️ Fixes: reminder notifications no longer wait for the network; guidance no longer crashes if location permission was revoked; notification IDs no longer overwrite each other; the guidance service stops cleanly after arrival; sturdier GTFS download; safer WebSocket client; the HTTP bridge only reaches the services Lumi uses; narrower CI permissions; Java unit tests

**🆕 New in v2.16**
- 🔔 **Bus-approaching alerts even with the screen off**: ±10/±5/±2 min and on arrival at your boarding stop, automatic when guidance starts (only buses going your way)
- ⏰ **"Time to leave" reminders** ("leave at 07:05 to arrive by 08:00"), one-off or weekly; 30 minutes ahead Lumi checks disruptions on your route, and at departure time it starts watching the first bus
- ⚠️ **Service disruption info** on home, results and details — plus **disruption notifications for favourite routes** without opening the app
- ⭐ **Save & repeat full trips** from favourites, history or a reminder notification
- 💳 **Card balance check (NFC, experimental)**: Mandiri e-money, BNI TapCash, BRI Brizzi, BCA Flazz gen 2, JakCard, KMT
- ♿ **Wheelchair-friendly routes** + lift/escalator info at stops, stations and on each leg (OpenStreetMap)
- 🌙 **Dark mode** (follow system / light / dark), 📍 your position moves live with a heading beam on the trip map, and stops can be tapped right on the map
- Maintainer guide (Indonesian): [docs/gangguan-pengingat-nfc.md](docs/gangguan-pengingat-nfc.md)

**🗺️ Journey planner**
- **Offline** routing engine (graph + Dijkstra) plus a systematic search of **every direct route and every two-route combination**, so options like 9/9C → Makasar → JAK36/JAK108 and LRT → TMII → JAK36 show up
- **Same-code variants** kept apart, e.g. corridor 9 towards Pluit **via the toll road**, skipping Kemanggisan to Jembatan Dua
- Loop routes (e.g. JAK36 Cilangkap → Cililitan → Cilangkap) handled correctly: board and alight on the right side of the road, and **don't ride the loop** just to walk a bit less
- Duplicate options and pointless "ride one stop, then walk" options are removed
- **Depart at / arrive by**, using each mode's operating hours
- **Ride-hailing + train** combinations and direct motorbike/car ride-hailing, with road distance from OSRM

**🚌 Bus positions**
- **Live, inside Lumi**, from Transjakarta's fleet feed: **Buses near you** (closest buses with distance, next stop and arrival estimate), **next bus at your boarding stop** on trip details, and **every bus on a route** on route details
- **"Bus is getting closer" notifications**: with trip details open, Lumi alerts you at **±10, ±5, ±2 minutes** and when the bus has **arrived** at your boarding stop (once per bus)
- Per-stop ETAs are precise: boarding and alighting stop IDs are resolved once from the TJ REST API, then the ETA is read from that bus's own data
- Positions refresh every few seconds over a native connection (WebSocket + MQTT); only the routes you are looking at are downloaded, so data use stays low. If the server refuses per-route subscriptions, Lumi falls back to the catch-all topic **temporarily** (30 minutes, up to 6 hours if refusals continue) and then retries per route
- If the feed cannot be reached (e.g. outside operating hours), Lumi explains why and offers an **Open TJ app** button

**🧭 GPS guidance**
- The map shows only what's left of the trip: passed lines and stops disappear; the first walk starts from where you are now
- Walking is shown as blue dots along real streets (foot routing from [routing.openstreetmap.de](https://routing.openstreetmap.de) and road routing from [OSRM](https://project-osrm.org), whichever fits best)
- **Picture-in-picture**: a small live map plus instructions stay visible while you use other apps; closing the window closes the app
- **Compass beam**: your location dot shows which way your phone is facing
- A prompt to turn on GPS when phone location is off

**🎯 Result filters**
- Sort: **Recommended · Fastest · Cheapest · Fewest transfers**
- Modes: **Transjakarta · Mikrotrans · LRT · MRT · KRL · Royaltrans · Airport Rail · Whoosh · Ride-hailing**. Shown trips **include every selected mode** and may combine others

**🧭 Guidance mode**
- Tap **Start guidance** on a trip
- GPS runs in a **foreground service**, so it keeps working with the screen off or the app in the background
- Live notification: *"JAK36 · 2 stops left · get off at UP Angkutan Sekolah"*
- Vibrating alerts: **Get ready** (one stop left) and **Get off now** (with the next connection)
- Your position on the trip map, and the current step marked **"You are here"**

**🔔 Always-current routes**
- On first launch Lumi downloads the **official Transjakarta GTFS** and processes it on the phone
- **Regularly** (in the background, very little data) Lumi checks:
  1. the route-change feed in this repo (`data/route_changes.json`), updated several times a day by GitHub Actions (scheduled hourly, but GitHub often delays scheduled runs by hours), and
  2. the version signature of the official GTFS file (ETag / Last-Modified / size)
- When something changes, route data is re-downloaded, differences are computed (new or removed routes, stops added/removed, variant patterns changed) and a **notification** appears
- History is shown on Home and in **Settings → Route changes**

**🖼️ Share routes as images**
- **Share route** button on every result card and on the trip screen
- PNG with origin → destination, total time and fare, a mode strip, and step-by-step boarding times, directions, stops and fares

**📍 Addresses via Google**
- Type in From/To and suggestions come from **Google Places** using Google Maps' internal API key (package + certificate spoofed — see [docs/google-api-keys.md](docs/google-api-keys.md))
- Tap the first row to search inside the **Google Maps** app → **Share → Lumi Transport**; the **place** coordinates are then read from the link (not the map view), using three methods in parallel, and cached for instant reuse
- **Saved places**, **My location**, and pick-on-map

**🎨 Look & feel**
- **Light-blue** theme with a blue-gradient logo; welcome and permission screens that **fit on one screen**
- **Two languages**: Indonesian or English (Settings → Language). The whole app switches, including route results, shared images, notifications and voice guidance
- Full route info: search routes (`9`, `13C`, `JAK.10`, `Bogor`, `MRT`), stop order, directions, variants, operating hours, and connections at each stop
- **OpenFreeMap** vector maps (MapLibre GL) — free, no API key; Liberty, Bright, Positron or standard OpenStreetMap styles, plus a **Google Maps** raster option that uses the internal key

---

## 💸 Fares used

Updated **29 October 2026**. Fares are estimates; always check the operator's announcements.

| Mode | Fare |
|---|---|
| Transjakarta BRT, non-BRT, Transjabodetabek (T31, P11, SH1, …) | **Rp3,500** (Rp2,000 from 05:00–07:00) |
| Transfer without leaving the station | Free |
| Leave at a roadside stop, then board again | Pay again (tap in again) |
| SH2 Blok M – Soekarno-Hatta Airport (since 1 Sep 2026) | Rp15,000 |
| Hub Connector HC2 PIK 2 – Dukuh Atas | Rp20,000 |
| Royaltrans | Rp20,000 |
| Mikrotrans (JakLingko) | Free |
| KRL Commuter Line | Rp3,000 (first 25 km) + Rp1,000 per 10 km |
| MRT Jakarta | Rp3,000 + Rp1,000 per station, max Rp14,000 |
| LRT Jakarta (incl. Velodrome – Manggarai) | Rp5,000 flat |
| LRT Jabodebek, peak (Mon–Fri 06:00–08:59 & 16:00–19:59) | Rp5,000 + Rp700/km, max Rp20,000 |
| LRT Jabodebek, off-peak, weekends & holidays | max Rp10,000 |
| Airport Rail from Manggarai / BNI City / Duri | Rp70,000 (Rawa Buaya / Batu Ceper Rp35,000) |
| Whoosh | from Rp250,000 (dynamic pricing) |
| Motorbike ride-hailing (Greater Jakarta zone) | Rp2,550–2,800/km, minimum Rp10,200–11,200 + app fee |

> ℹ️ The Jakarta government has announced a **Transjakarta fare adjustment from 1 January 2027**; the amount hasn't been published yet. A new LRT Jakarta fare is also expected soon.

Sources are listed in the [Indonesian README](README.md#-tarif-yang-dipakai).

---

## ⬇️ Download & Install

1. Open the **[Releases](https://github.com/VAMvicky/LumiTransport/releases/latest)** page.
2. Under **Assets**, download `LumiTransport-v2.0.apk`.
3. Open the downloaded file. If Android asks, allow **"Install unknown apps"** for your browser or file manager.
4. Tap **Install**. Done! 🎉

> 💡 **Updating:** just install the new APK over the old one. Saved places and settings are kept.

### 📋 Requirements
- Android **8.0 (API 26)** or newer
- About **10 MB** of free space (official route data is stored on the phone)
- Internet for maps, reading Google Maps links and checking route changes (route planning itself is offline)
- The **Google Maps** app for address search (recommended)

---

## 📖 User Guide

### 0️⃣ First launch
Two short screens, each **fitting on one screen without scrolling**:
1. **Welcome**: a feature overview, tap **Get started**.
2. **One more step**: allow **location**, **notifications** and **background running**. **Start planning** only unlocks once all three are allowed; a permission that was permanently denied opens the app-info page instead. Xiaomi, Oppo, Vivo, Realme and Infinix phones get an optional **Autostart settings** button.

Lumi then downloads the official Transjakarta route data in the background (needs internet once).

### 1️⃣ Set origin & destination
Tap **Dari** (From) or **Ke** (To) → **Cari di Google Maps** → pick the place → **Share** → **Lumi Transport**. The field fills in automatically and the place is saved. You can also use **My location** or a saved place.

### 2️⃣ Pick a time & search
Tap the time chip for **Depart at** or **Arrive by**, then **Cari rute** (Find route).

### 3️⃣ Filter results
Tap **Fastest / Cheapest / Fewest transfers**, then choose modes in the **Moda** row. Example: pick **Transjakarta** to see every trip that uses TJ (including TJ + LRT).

### 4️⃣ Start guidance 🧭
Open a route → **Mulai pendampingan** (Start guidance). The blue card at the bottom and the notification show your next step and stops left. Tap **Berhenti** (Stop) to finish.

### 5️⃣ Share a route 🖼️
Tap **Bagikan rute** (Share route) on a result card or trip screen, then choose WhatsApp or another app. A **route image** is sent.

### 6️⃣ See route changes 🔔
When something changes you get a notification. Tap it, or open **Settings → Perubahan rute** (Route changes). **Lihat rute** (See route) opens that route's latest stops.

---

## ❓ FAQ & Troubleshooting

<details>
<summary><b>Guidance or route-change notifications don't appear</b></summary>

Make sure notifications are allowed and **background running** is enabled (phone Settings → Apps → Lumi Transport → Battery → Unrestricted). On Xiaomi, Oppo, Vivo, Realme and Infinix also enable **Auto-start**.
</details>

<details>
<summary><b>How quickly does Lumi learn about route changes?</b></summary>

Usually within a few hours of Transjakarta updating its official GTFS. The app checks the GTFS file's version signature about every hour when online (Android may defer this in battery-saving mode), and GitHub Actions in this repo checks the GTFS several times a day. Changes announced only on social media (e.g. temporary diversions) are picked up once they reach the official data.
</details>

<details>
<summary><b>The location from Google Maps is off</b></summary>

Share the **place** (tap the place name → Share), not the map view. If coordinates still can't be read, Lumi opens a map so you can drag the pin.
</details>

<details>
<summary><b>The fare in Lumi differs from what I paid</b></summary>

Fares are estimates based on published rules (see [Fares used](#-fares-used)). Promotions, holiday fares and ride-hailing surge pricing can differ.
</details>

---

## 🔒 Privacy

- ✅ **No** ads, analytics or trackers
- ✅ Your location and saved places stay **on your phone**
- ✅ Routes are computed on the phone; there is no Lumi server
- ℹ️ Internet is used for: OpenFreeMap/OpenStreetMap maps, Google maps & address suggestions (via Google Maps' internal key), reading Google Maps links, OSRM road distance (ride-hailing estimates), the official Transjakarta GTFS, and the route-change feed on GitHub

---

## 🛠️ Tech Stack

| Part | Technology |
|---|---|
| App | **Java** (plain Android SDK, no extra libraries) + **WebView** |
| UI | Plain HTML, CSS and JavaScript, Plus Jakarta Sans font |
| Stop & station positions | Official Transjakarta GTFS, aligned weekly with **OpenStreetMap** (`tools/osm_stops.py`, Overpass API) |
| Maps | **Leaflet** + **MapLibre GL** (maplibre-gl-leaflet) with **OpenFreeMap** vector tiles (OpenStreetMap); standard OSM tiles as fallback; optional **Google Static Maps** raster tiles |
| Address search | **Google Places** (Autocomplete → Details) with Google Maps' internal key and spoofed `X-Android-Package`/`X-Android-Cert` headers; Photon/OpenStreetMap as fallback |
| Routing | Multimodal graph + Dijkstra + combination search (`engine.js`), offline |
| Route data | Official Transjakarta GTFS (processed on the phone by `GtfsImporter.java`) |
| Background | Foreground service (GPS guidance), JobScheduler (one regular route-check job), AlarmManager (departure reminders) |
| CI/CD | GitHub Actions: build the APK on every push and watch for route changes regularly |

### 🏗️ Build from source
The APK is built with **Gradle** (R8 + resource shrinking), exactly like the released one:

```bash
git clone https://github.com/VAMvicky/LumiTransport.git
cd LumiTransport
./gradlew assembleRelease lintRelease     # output: app/build/outputs/apk/release/
node tools/test_engine.js                 # routing engine tests
pip install playwright && python3 tools/ui_check.py en native   # all screens + English translation check
```
Or open this folder in Android Studio. Requires JDK 17, Android SDK 35 and `python3` (to build the route data).

> 🔐 Release builds are signed with a key stored in **GitHub Actions Secrets** (`LUMI_KEYSTORE_BASE64`, `LUMI_KEYSTORE_PASSWORD`, optional `LUMI_KEY_ALIAS`). The key is never stored in the repo. Without secrets, the workflow still builds the APK as an artifact (debug key) and **refuses** to publish a release.

### 🔑 Google key (reverse-engineered)
Lumi uses the **internal API key of the Google Maps app**, pulled from Google Maps 26.44.06 by unpacking `resources.arsc`, `AndroidManifest.xml` and `classes*.dex`. The key is restricted to Google's app, so every request carries two spoofed headers:

```
X-Android-Package: com.google.android.apps.maps
X-Android-Cert:    38918A453D07199354F8B19AF05EC6562CED5788
```

Without them the server answers `REQUEST_DENIED`; with them address suggestions (Places Autocomplete/Details) and map tiles (Static Maps) work from this app.

- Key & certificate: [`GoogleKeys.java`](app/src/main/java/id/lumi/transport/GoogleKeys.java), used by `js/gmaps.js`
- Headers are added in `shouldInterceptRequest` (`MainActivity.java`) for `<img>` map tiles, and through `LumiNative.httpH` for JSON requests
- Evidence, the open/closed endpoint list and how to re-harvest: [docs/google-api-keys.md](docs/google-api-keys.md)
- On/off switch in Settings → Address search; if Google revokes the key, suggestions fall back to Photon/OpenStreetMap

---

## 🙏 Thank You

Lumi Transport exists thanks to the open data, open-source projects and services below. **Many thanks** to their creators and contributors! 💖

### 🚌 Transport data
| Source | What Lumi uses |
|---|---|
| [**Transjakarta**](https://transjakarta.co.id/rute) | Official GTFS ([gtfs.transjakarta.co.id](https://gtfs.transjakarta.co.id)) and official route list |
| [**altilunium/BRT-tj**](https://github.com/altilunium/BRT-tj) | Copy of the official Transjakarta BRT GTFS (Jan 2024) for built-in data |
| [**akherlan/transjakartagtfs**](https://github.com/akherlan/transjakartagtfs) | 2021 Transjakarta GTFS for built-in non-BRT, Mikrotrans and Royaltrans routes |
| [**Rebornian48/map-visualizer**](https://github.com/Rebornian48/map-visualizer) | Railway station coordinates (Ministry of Transportation data) |
| [**MobilityData**](https://mobilitydatabase.org/feeds/gtfs/mdb-1909) | Transjakarta GTFS feed catalogue |
| KAI Commuter, MRT Jakarta, LRT Jakarta, LRT Jabodebek, KAI Bandara, KCIC | Station order, operating hours and fares from official sites and announcements |
| Wikipedia & news media (Kompas, detik, CNA, Bisnis, CNN Indonesia, Suara, IDN Times, etc.) | Route changes (e.g. corridor 9 via toll), latest fares and operating hours |

### 🗺️ Maps & location
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · [OpenFreeMap](https://openfreemap.org) & [OpenMapTiles](https://openmaptiles.org) · [MapLibre GL JS](https://maplibre.org) · [Planetiler](https://github.com/onthegomap/planetiler) & [PMTiles](https://github.com/protomaps/PMTiles) (offline map) · [OSRM](https://project-osrm.org/) (road distance for ride-hailing estimates) · [Google Maps](https://maps.google.com) (raster maps & address suggestions via the internal key found by RE — [docs/google-api-keys.md](docs/google-api-keys.md))

### 📚 Libraries & assets
[Leaflet](https://github.com/Leaflet/Leaflet) by Volodymyr Agafonkin et al. · [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) by Tokotype (SIL OFL) · [Eclipse JDT ecj](https://github.com/eclipse-jdt/eclipse.jdt.core) · Android build tools (aapt2, d8, apksigner)

> These projects, data sources and services are not affiliated with Lumi Transport. All credit for their work belongs to their respective creators.

---

## ⚖️ Disclaimer

Lumi Transport is an independent project for **personal and educational use**.
It is **not affiliated with, endorsed by or sponsored by** PT Transportasi Jakarta, PT KAI / KAI Commuter, PT MRT Jakarta, PT LRT Jakarta, KCIC, Gojek, Grab or Google. All trademarks belong to their respective owners.
Travel times and fares are **estimates**. Always check operator announcements for disruptions or service changes.

## 📄 License

Copyright © 2026 **VAMvicky**.

Lumi Transport is free and open-source software, released under the **[GNU General Public License v3.0](LICENSE)**.
You may use, study, modify and redistribute it, provided derivative works are released under the same licence (GPL-3.0) with their source code open.
Leaflet (BSD-2-Clause) and Plus Jakarta Sans (SIL OFL 1.1) keep their own licences.
Lumi Transport comes **without any warranty**. See [LICENSE](LICENSE) for the full text.

<div align="center">

---

Made with ❤️ in Jakarta · If Lumi helps your commute, please leave a ⭐

</div>
