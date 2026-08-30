---
description: Scaffold sebuah Content Type baru (backend + frontend) sesuai kontrak ContentTypeRegistry di Memoire
argument-hint: <nama-content-type> (contoh: kanban, mindmap)
---

Buat Content Type baru bernama **$ARGUMENTS** untuk proyek Memoire, mengikuti kontrak yang dijelaskan di `docs/memoire_technical_plan.md` Bagian 11A dan `CLAUDE.md`.

Langkah yang harus dilakukan, secara berurutan:

1. Baca `CLAUDE.md` dan bagian 11A di `docs/memoire_technical_plan.md` untuk memahami kontrak `ContentTypeModule` (backend) dan `ContentTypeDefinition` (frontend) sebelum menulis kode apa pun.
2. Buat modul backend di `apps/api/src/content-types/$ARGUMENTS/`:
   - `$ARGUMENTS.module.ts`
   - `$ARGUMENTS.controller.ts`
   - `$ARGUMENTS.service.ts`
   - `$ARGUMENTS.schema.ts` (Zod schema untuk validasi konten)
   - Implementasikan seluruh method kontrak: `createDefaultContent`, `getContent`, `updateContent`, `deleteContent`, `exportContent`, `validateContent`.
3. Buat komponen frontend di `apps/web/src/features/content-types/$ARGUMENTS/`:
   - Komponen renderer utama (di-render di area konten saat page dibuka)
   - Definisikan `ContentTypeDefinition` (key, label, icon, renderer, createInSlashMenu, createInSidebar, createInCommandPalette)
4. Daftarkan Content Type baru ke `ContentTypeRegistry` di backend dan frontend. Jangan hardcode nama tipe ini ke sidebar/slash-command/command-palette secara manual — pastikan semuanya tetap membaca dari registry.
5. Jika tipe konten butuh struktur data baru (bukan sekadar JSONB fleksibel di tabel yang sudah ada), tanyakan dulu sebelum membuat migration baru — jelaskan trade-off menambah tabel vs memakai `page_canvases`-style JSONB.
6. Tulis unit test (Vitest) untuk service dan schema validasi.
7. Setelah selesai, tunjukkan ringkasan file yang dibuat/diubah dan jelaskan bagaimana tipe baru ini otomatis muncul di sidebar "New Page", slash command, dan command palette.

Jangan menyentuh modul `document` atau `database` yang sudah ada kecuali diperlukan untuk registrasi.
