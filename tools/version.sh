#!/usr/bin/env bash
# Satu-satunya tempat menghitung versi Lumi Transport.
#
# Pemakaian:
#   tools/version.sh              -> baca release-notes/CURRENT
#   tools/version.sh 2.1.1        -> hitung untuk versi yang diberikan
#
# Keluaran: "<versi> <versionCode>"
#   2.0   -> 20000
#   2.1   -> 20100
#   2.1.1 -> 20101
set -euo pipefail

raw=${1:-}
if [ -z "$raw" ]; then
  root=$(cd "$(dirname "$0")/.." && pwd)
  raw=$(tr -d ' \r\n' < "$root/release-notes/CURRENT")
fi

ver=${raw#v}

if ! [[ "$ver" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
  echo "versi tidak valid: '$raw' (harus 2.0 / 2.1 / 2.1.1)" >&2
  exit 1
fi

maj=${ver%%.*}
rest=${ver#*.}
if [ "$rest" = "$ver" ]; then
  min=0; pat=0
else
  min=${rest%%.*}
  if [ "$rest" = "$min" ]; then pat=0; else pat=${rest#*.}; fi
fi

code=$(( maj * 10000 + min * 100 + pat ))
echo "$ver $code"
