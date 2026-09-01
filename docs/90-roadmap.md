> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §51, §52, §53, §54, §55, §64, §65, §66

---

# 51. MVP Scope
MVP harus jauh lebih kecil dari Notion.

## MVP wajib

```text
Authentication lokal opsional
Workspace
Sidebar
Page hierarchy
Page CRUD
Block editor
Paragraph
Heading
List
Todo
Quote
Code
Divider
Image
Slash command
Block menu
Autosave
Dark mode
Search page
Trash
Export JSON
```

## MVP database

```text
Database
Table view
Title
Text
Number
Select
Checkbox
Date
Filter
Sort
```

Dengan fitur tersebut, aplikasi sudah terasa seperti personal Notion versi dasar.

---

# 52. Phase 2
Setelah MVP stabil:

```text
Drag & drop
Nested blocks
Board view
List view
Calendar view
Gallery view
Templates
Command palette
Full text search
Markdown import/export
CSV import/export
File attachments
Cover image
Bookmarks
Content Type Registry (fondasi plugin, lihat 11A)
Whiteboard page type (Excalidraw)
Mermaid block (inline diagram di document)
```

---

# 53. Phase 3
Fitur advanced:

```text
Relation
Rollup
Formula
Page backlinks
Database views yang lebih fleksibel
Advanced filters
Advanced sorting
Page history
Version restore
Automatic backup
Offline mode
PWA
Diagram page type (React Flow)
Canvas export (PNG/SVG) untuk whiteboard & diagram
```

---

# 54. Phase 4
Desktop-focused improvements:

```text
Tauri desktop
Global shortcut
System tray
Local cache
Offline-first
Native file picker
Auto update
```

---

# 55. Roadmap Development
## Sprint 1 — Foundation

```text
Project setup
Monorepo
Next.js
NestJS
PostgreSQL
Drizzle
Docker
CI
```

## Sprint 2 — Workspace

```text
Workspace
Sidebar
Page hierarchy
Page CRUD
Trash
Favorites
```

## Sprint 3 — Editor

```text
Tiptap
Basic blocks
Slash command
Block menu
Autosave
```

## Sprint 4 — Media

```text
Image upload
Attachment
Object storage
Preview
```

## Sprint 5 — Database

```text
Database
Properties
Rows
Table view
Filter
Sort
```

## Sprint 6 — UX

```text
Command palette
Keyboard shortcuts
Drag & drop
Dark mode
Responsive UI
```

## Sprint 7 — Search + Backup

```text
Search
Export
Import
Backup
```

## Sprint 8 — Advanced database

```text
Board
Calendar
Gallery
Relation
Formula
```

## Sprint 9 — Content Type System & Whiteboard

```text
ContentTypeRegistry (backend + frontend)
Refactor pages agar polymorphic (kolom type)
Whiteboard page type
Excalidraw integration
page_canvases table
```

## Sprint 10 — Diagram

```text
Diagram page type
React Flow integration
Mermaid block (inline)
Canvas export PNG/SVG
```

## Sprint 11 — Offline

```text
IndexedDB
Local cache
PWA
Offline editing
```

## Sprint 12 — Desktop

```text
Tauri
Native packaging
Auto update
```


## Status per sekarang

Sprint 1–12 selesai, ditambah satu iterasi "app shell ala Notion" (topbar + breadcrumb, cover,
page icon, menu halaman, Trash dialog, sidebar tree dengan hover action dan resize).

Sprint 13 dan seterusnya mengejar paritas fitur Notion (§71). Urutannya ditentukan dependensi:
identitas blok, skema bersama, persistensi view config, dan primitif UI dikerjakan lebih dulu
karena sekitar 80% fitur sisanya bergantung pada setidaknya salah satunya.

## Sprint 13 — Fondasi: Identitas & Kontrak

```text
packages/validation (@memoire/validation) + penyambungan transpilePackages & tsconfig paths
Ekstensi Tiptap BlockId + plugin deteksi id duplikat
PUT /pages/:id/blocks jadi upsert-by-id, bukan delete-all + insert
blocks.descendant_ids + GIN index + migrasi backfill blockId
UUID dari klien untuk semua POST (page, block, row, view, property)
Tes invarian outbox: PATCH selalu representasi lengkap
BlockTypeRegistry + PropertyTypeRegistry + ViewTypeRegistry (kontrak, belum diisi penuh)
```

## Sprint 14 — Primitif UI

```text
shadcn/ui init + Radix (Dialog, Popover, DropdownMenu, ContextMenu, Tooltip,
  Select, Checkbox, Tabs, ScrollArea, Toast, Command)
lucide-react untuk ikon UI (emoji tetap dipakai sebagai page icon)
dnd-kit dipasang + helper posisi pecahan (dipakai mulai Sprint 21; TIDAK di dalam editor)
date-fns + DatePicker berbasis Radix
Migrasi components/ui/menu.tsx ke DropdownMenu
Toast + snackbar "Urungkan", ConfirmDialog, CommandDialog
Design token Tailwind: spacing, radius, warna, tipografi
```

## Sprint 15 — Interaksi Editor

```text
Hover block handle + drag reorder via drag native ProseMirror + drop cursor
Multi-block selection (shift-klik, lasso) + aksi massal
Selection toolbar
Context menu blok (turn into, duplicate, copy link to block, move to)
Input rule markdown lengkap + paste markdown jadi blok
Copy blok sebagai markdown
Keyboard shortcut lengkap + dialog cheatsheet
Playwright disetup betulan (menggantikan catatan "belum di-setup")
```

## Sprint 16 — Formatting & Katalog Blok A

```text
Link extension: link internal + anchor eksternal, tanpa fetch preview
Underline, highlight, warna teks, warna latar, superscript, subscript
Callout, toggle list, toggle heading 1-3
Columns 2-5 + geser lebar
Table block (Tiptap table) + resize kolom + menu baris/kolom
Code block: Shiki (bahasa terpilih, lazy import), pemilih bahasa, salin, wrap
KaTeX: equation block + inline equation, font disalin ke public/
```

## Sprint 17 — Katalog Blok B & Fitur Halaman

```text
Sub-page block, link-to-page block, breadcrumb block, table of contents
Synced block (berbasis blockId stabil)
File / video / audio / PDF block (upload atau URL)
Blok bookmark (pratinjau URL dari sisi server) + blok embed ber-sandbox
Image: resize, align, caption, full-bleed
pages.settings: full width, small text, font family, lock page, hitung kata
  (memindahkan full width & small text dari localStorage ke server)
Backlinks: tabel page_links + panel backlink
Cover reposition
```

## Sprint 18 — Database Core

```text
viewConfigSchema di @memoire/validation + persistensi database_views.config
POST /databases/:id/query: filter, sort, group, agregasi di SQL + keyset pagination
Filter group AND/OR bersarang + operator per tipe properti
Multi-sort, visibilitas & urutan properti, lebar kolom, row height, wrap cells
Properti baru: multi-select, status, email, phone, files, created_time,
  last_edited_time, unique_id, format number
Kalkulasi & agregasi (20 fungsi) + footer tabel + kalkulasi per grup
Index: GIN jsonb_path_ops pada values, (database_id, position)
```

## Sprint 19 — Struktur Database

```text
databases.owner_page_id + is_inline + partial unique index (migrasi)
Blok database inline + blok linked view
pages.database_id + row page (panel properti + konten)
Side peek / center peek / full page untuk baris
Sinkronisasi properti title <-> pages.title
Mirroring Trash antara baris dan row page
Database template (template baris), duplicate view, drag urutan tab view, lock view
```

## Sprint 20 — Relation, Formula, Rollup

```text
Tabel database_relation_links + properti relation (satu arah / dua arah)
@memoire/formula: tokenizer, parser, evaluator, pustaka fungsi
database_rows.computed + pipeline hitung ulang (baris, properti, baris terkait, chunked)
Deteksi siklus dependensi + penolakan 400 beserta jalur siklusnya
Formula volatile (now/today) dievaluasi saat baca
Properti rollup + fungsi agregat, batas 1 hop
Filter & sort atas nilai computed
```

## Sprint 21 — View Interaktif

```text
dnd-kit: kartu kanban antar/dalam grup, urutkan baris, urutkan kolom + geser lebar,
  urutkan tab view, urutkan kartu gallery
Calendar: seret event ke tanggal lain, ubah rentang, tampilan bulan/minggu,
  klik hari untuk membuat baris
Timeline / Gantt view
List view
Board sub-grouping + state lipat tersimpan
```

## Sprint 22 — Sidebar & Navigasi

```text
dnd-kit di sidebar: urutkan ulang + pindah induk (satu transaksi, posisi pecahan)
Seret halaman dari sidebar ke editor -> blok link-to-page
Bagian Recents, multi-select halaman
Breadcrumb dengan dropdown, riwayat back/forward
Page peek modal
```

## Sprint 23 — Search & Command

```text
Kolom tsvector generated (pages, blocks, database_rows) + GIN + pg_trgm
websearch_to_tsquery + cabang prefix + ts_rank_cd + bobot sumber + peluruhan recency
Cuplikan ts_headline + anchor ke blockId
Halaman search: filter tipe & tanggal, urut relevansi / terbaru
Command palette v2 (Radix Command): recents, aksi, quick create, lompat ke blok
```

## Sprint 24 — Import / Export / Backup

```text
Serializer per blok (html / markdown / plaintext) wajib di BlockTypeRegistry
Export Markdown (halaman + workspace), CSV (per view, menghormati filter), HTML
Route /print/[pageId] + print stylesheet -> PDF lewat browser
Export ZIP + lampiran + memoire.json
Import: Markdown, CSV -> database, Notion export ZIP, restore memoire.json
Backup terjadwal lokal + UI restore
```

## Sprint 25 — Version History & Trash

```text
Tabel page_versions + kebijakan snapshot (hash + jeda 10 menit)
Retensi bertingkat (cron harian) + offload snapshot besar ke object storage
Daftar versi, pratinjau, diff berbasis blockId, restore (selalu membuat versi baru)
Trash: pencarian, retensi yang bisa dikonfigurasi, restore beserta subtree
```

## Sprint 26 — Reminder & Notifikasi

```text
Tabel reminders + notifications + settings
Job @nestjs/schedule 30 detik + FOR UPDATE SKIP LOCKED + recurrence (date-fns)
Reminder pada properti Date + mention @tanggal inline
Inbox notifikasi (popover, badge, tandai dibaca, navigasi)
Notifikasi browser lewat service worker + Web Push (VAPID) untuk pengiriman latar
Tampilan "Upcoming" lintas database
```

## Sprint 27 — Settings & Polish

```text
Dialog Settings: tampilan, aksen, font, lebar halaman default, format tanggal/waktu,
  awal minggu, bahasa, notifikasi, penggunaan storage, retensi trash,
  daftar shortcut, danger zone
Tema terang/gelap/sistem + warna aksen
Empty state, error boundary, skeleton, pass responsive/mobile, pass aksesibilitas
Observability: log terstruktur, log query lambat
```

## Sprint 28 — Template & Quick Capture

```text
Tabel templates akhirnya dipakai: page template, database row template, galeri lokal
"Duplicate as template", blok template button
Daily notes / jurnal otomatis
Quick capture (shortcut global) + halaman inbox
Halaman berulang lewat scheduler
```

## Sprint 29 — Desktop & Offline Hardening

```text
Tauri: notifikasi OS asli lewat poller lokal, global shortcut quick capture
Indikator nilai computed basi + inspector outbox + UI konflik offline
sw.js CACHE_VERSION + pembersihan + strategi network-first untuk /query
Perluasan suite Playwright: drag, database, offline, import/export
Notifikasi OS asli lewat poller lokal Tauri (alternatif Web Push di desktop)
Tes: penjaga SSRF pada pengambil pratinjau, dan perilaku blok eksternal saat offline
```
---

# 64. Recommended Final Stack
```text
Frontend
-------------------------
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Tiptap
Zustand
TanStack Query
Excalidraw        (whiteboard content type)
React Flow        (diagram content type)
Mermaid           (inline diagram block di dalam document)

Backend
-------------------------
NestJS
TypeScript
REST API
Zod

Database
-------------------------
PostgreSQL
Drizzle ORM

Storage
-------------------------
S3-compatible storage
MinIO for local development

Testing
-------------------------
Vitest
Supertest
Playwright

DevOps
-------------------------
Git
GitHub
Docker
Docker Compose
GitHub Actions

Desktop
-------------------------
Tauri

Optional later
-------------------------
Redis
Meilisearch
Sentry
PWA
IndexedDB / Dexie
```

---

# 65. Recommended Build Order
Urutan yang paling aman:

```text
1. Project setup
2. Database schema (termasuk kolom pages.type sejak awal)
3. Page hierarchy
4. Sidebar
5. Tiptap editor
6. Basic blocks
7. Autosave
8. Slash commands
9. Block menu
10. File upload
11. Database engine
12. Table view
13. Filter/sort
14. Search
15. Templates
16. Import/export
17. Backup
18. Advanced database
19. Content Type Registry (backend + frontend)
20. Whiteboard page type
21. Diagram page type + Mermaid block
22. Offline support
23. Desktop app
```

Jangan mulai dari database view sebelum editor dan page hierarchy stabil.

**Penting:** kolom `pages.type` sebaiknya sudah ada sejak Sprint 1/2, walaupun whiteboard dan diagram baru dikerjakan jauh belakangan. Menambahkan kolom polymorphic di awal jauh lebih murah daripada migrasi besar setelah ratusan page tersimpan dengan asumsi lama.

---

# 66. Definition of Done untuk MVP
MVP dapat dianggap selesai ketika pengguna dapat:

```text
1. Membuka aplikasi
2. Membuat halaman
3. Membuat sub-halaman
4. Menulis dokumen
5. Menggunakan block
6. Menggunakan slash command
7. Mengubah dan memindahkan block
8. Mengunggah gambar
9. Menutup halaman
10. Membuka kembali halaman
11. Melihat data yang tersimpan
12. Mencari halaman
13. Menghapus halaman
14. Memulihkan halaman
15. Membuat database
16. Menambahkan row
17. Mengubah property
18. Melakukan filter
19. Melakukan sorting
20. Mengekspor data
```
