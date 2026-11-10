#!/usr/bin/env bash
# Uji asap di emulator: pasang APK, buka, ke latar belakang, buka lagi.
# Gagal bila aplikasi force close / ANR. Dipakai CI (job "smoke").
set -uo pipefail
APK=${1:?pakai: tools/smoke.sh <apk>}
PKG=id.lumi.transport
adb wait-for-device
adb logcat -c
adb install -r -g "$APK" || exit 1

alive() { adb shell pidof "$PKG" >/dev/null 2>&1; }
crashed() { adb logcat -d -b crash 2>/dev/null | grep -q "$PKG" || adb logcat -d | grep -E "FATAL EXCEPTION|ANR in $PKG" -A3 | grep -q "$PKG"; }
fail() { echo "::error::$1"; adb logcat -d | grep -E "AndroidRuntime|$PKG|chromium" | tail -80; exit 1; }

adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 20
alive || fail "Aplikasi tidak berjalan 20 detik setelah dibuka"
crashed && fail "Aplikasi force close saat dibuka"

adb shell input keyevent KEYCODE_HOME; sleep 3
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null; sleep 8
alive || fail "Aplikasi berhenti setelah kembali dari latar belakang"
crashed && fail "Aplikasi force close setelah kembali dari latar belakang"

# Ketukan acak ringan di layar untuk memancing galat di WebView/bridge
adb shell monkey -p "$PKG" --throttle 300 --pct-syskeys 0 --pct-appswitch 0 -s 7 120 >/dev/null 2>&1 || true
sleep 3
crashed && fail "Aplikasi force close saat diketuk acak"
echo "Uji asap lulus"
