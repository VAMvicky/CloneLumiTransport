#!/usr/bin/env python3
"""zipalign sederhana: entri STORED disejajarkan 4 byte (.so 4096). Pakai: zipalign.py in.apk out.apk"""
import sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
with open(dst, "wb") as f:
    zout = zipfile.ZipFile(f, "w")
    for info in zin.infolist():
        data = zin.read(info.filename)
        ni = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        ni.compress_type = info.compress_type
        ni.external_attr = info.external_attr
        ni.extra = b""
        if ni.compress_type == zipfile.ZIP_STORED:
            align = 4096 if info.filename.endswith(".so") else 4
            # header lokal = 30 byte + nama + extra
            off = f.tell() + 30 + len(ni.filename.encode("utf-8"))
            pad = (-off) % align
            if pad:
                # extra field padding: id 0xD935 (konvensi zipalign) butuh >=4 byte
                if pad < 4:
                    pad += align
                ni.extra = (0xD935).to_bytes(2, "little") + (pad - 4).to_bytes(2, "little") + b"\0" * (pad - 4)
        zout.writestr(ni, data, compress_type=ni.compress_type)
    zout.close()
print("aligned ->", dst)
