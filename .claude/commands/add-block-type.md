---
description: Menambahkan block type baru ke Tiptap editor (mis. callout, mermaid, bookmark)
argument-hint: <nama-block> (contoh: mermaid, bookmark, callout)
---

Tambahkan block type baru bernama **$ARGUMENTS** ke editor Tiptap di Memoire.

Ikuti langkah ini:

1. Cek `docs/memoire_technical_plan.md` Bagian 11 (Block System) — pastikan block ini belum ada di daftar block type MVP atau lanjutan, dan tentukan apakah ini block wajib atau opsional.
2. Buat custom Tiptap Node/Extension untuk block ini di `packages/editor/` (bukan langsung di `apps/web`, supaya reusable).
3. Tentukan struktur `content`/`properties` JSON untuk block ini, konsisten dengan pola block lain (lihat contoh JSON paragraph di Bagian 11 technical plan).
4. Tambahkan entry block ini ke daftar Slash Command (Bagian 17) — termasuk kata kunci pencarian yang masuk akal (mis. mengetik `/mer` harus memunculkan "Mermaid Diagram").
5. Tambahkan ke Block Menu (Bagian 18) hanya opsi yang relevan untuk tipe block ini — jangan copy-paste semua opsi generik kalau tidak relevan (mis. block gambar tidak butuh "Turn into heading").
6. Jika block ini butuh rendering khusus (seperti Mermaid yang render SVG dari teks), pastikan rendering terjadi di client-side dan tidak menambah beban ke backend.
7. Tulis unit test untuk validasi schema block ini, dan tambahkan satu skenario di Playwright test yang sudah ada (create page → type content → reload → content persist) untuk memastikan block baru ini ikut ter-cover.

Jangan membuat tabel database baru untuk block ini — block content tetap disimpan di kolom `blocks.content` (JSONB) sesuai prinsip di `CLAUDE.md`.
