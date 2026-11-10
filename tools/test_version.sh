#!/usr/bin/env bash
# Test skema versi: gagal (exit != 0) kalau versionCode tidak sesuai aturan.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

check() {
  local input=$1 expect_ver=$2 expect_code=$3 out ver code
  out=$(bash tools/version.sh "$input")
  ver=${out% *}
  code=${out#* }
  if [ "$ver" != "$expect_ver" ] || [ "$code" != "$expect_code" ]; then
    echo "GAGAL: '$input' -> '$ver $code' (harus '$expect_ver $expect_code')" >&2
    fail=1
  else
    echo "ok: $input -> $ver ($code)"
  fi
}

check 2.0   2.0   20000
check 2.1   2.1   20100
check 2.1.1 2.1.1 20101
check 2.10  2.10  21000
check v2.2  2.2   20200

# CURRENT harus valid dan konsisten dengan app/build.gradle (yang membaca file yang sama).
out=$(bash tools/version.sh)
ver=${out% *}
code=${out#* }
if [ -z "$ver" ]; then
  echo "GAGAL: release-notes/CURRENT tidak menghasilkan versi" >&2
  fail=1
else
  echo "ok: CURRENT -> $ver ($code)"
fi

# Versi tidak boleh menurun dari angka yang sudah pernah dirilis ke publik.
if [ "$code" -lt 20000 ]; then
  echo "GAGAL: versionCode $code < 20000 (rintisan 2.0)" >&2
  fail=1
fi

# Versi tidak valid harus ditolak.
if bash tools/version.sh "dua" >/dev/null 2>&1; then
  echo "GAGAL: versi 'dua' seharusnya ditolak" >&2
  fail=1
fi

exit "$fail"
