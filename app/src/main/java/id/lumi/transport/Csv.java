package id.lumi.transport;

import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

/**
 * Pembaca CSV per karakter (v2.17, B-09). Berbeda dengan pembacaan per baris sebelumnya, kolom berkutip
 * yang berisi baris baru (diizinkan RFC 4180 dan dipakai beberapa feed GTFS) tidak lagi memecah baris.
 */
final class Csv {
    private final Reader in;
    private final char[] buf = new char[1 << 15];
    private int pos, len;
    private int peek = -2;

    Csv(Reader in) { this.in = in; }

    private int read() throws IOException {
        if (peek != -2) { int c = peek; peek = -2; return c; }
        if (pos >= len) {
            len = in.read(buf, 0, buf.length);
            pos = 0;
            if (len <= 0) { len = 0; return -1; }
        }
        return buf[pos++];
    }

    /** Satu rekaman, atau null di akhir berkas. Baris kosong dilewati. */
    List<String> next() throws IOException {
        while (true) {
            List<String> out = new ArrayList<String>();
            StringBuilder sb = new StringBuilder();
            boolean q = false, any = false;
            int c;
            while (true) {
                c = read();
                if (c < 0) break;
                any = true;
                char ch = (char) c;
                if (q) {
                    if (ch == '"') {
                        int d = read();
                        if (d == '"') sb.append('"');
                        else { q = false; peek = d; }
                    } else sb.append(ch);
                } else if (ch == '"') q = true;
                else if (ch == ',') { out.add(sb.toString()); sb.setLength(0); }
                else if (ch == '\n') break;
                else if (ch == '\r') { int d = read(); if (d != '\n') peek = d; break; }
                else sb.append(ch);
            }
            if (!any) return null;
            out.add(sb.toString());
            if (out.size() == 1 && out.get(0).trim().isEmpty()) { if (c < 0) return null; continue; }
            return out;
        }
    }

    /** Satu baris teks (tanpa baris baru di dalam kutip) — untuk kompatibilitas. */
    static List<String> parseLine(String line) {
        try {
            List<String> r = new Csv(new java.io.StringReader(line)).next();
            return r == null ? new ArrayList<String>() : r;
        } catch (IOException e) { return new ArrayList<String>(); }
    }
}
