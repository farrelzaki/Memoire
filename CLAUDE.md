# CLAUDE.md

Panduan ini dibaca oleh Claude Code setiap kali bekerja di repo ini. Tujuannya: memastikan setiap perubahan konsisten dengan arsitektur dan prinsip Memoire, bukan pola generik.

## Tentang Proyek

**Memoire** adalah personal knowledge management app bergaya Notion — dipakai oleh **satu pengguna saja**. Tidak ada dan tidak akan ada fitur multi-user, kolaborasi realtime, atau permission antar-akun.

Targetnya adalah **paritas fitur penuh dengan Notion**, dengan satu pengecualian permanen:

- **Tidak ada fitur yang melibatkan pengguna lain** — tidak ada share, publish, permission, komentar, mention orang, presence, suggested edit, penugasan, teamspace, atau properti Person/Created by. Ini bentuk produknya, bukan tahapan.

Selain itu, **integrasi yang butuh akun pihak ketiga** (Drive, Slack, Figma, GitHub, Notion sync, web clipper, AI) belum dikerjakan — ditunda karena belum dibutuhkan, bukan dilarang. Aplikasi sendiri bebas menghubungi internet untuk hal biasa: pratinjau tautan, embed, media dari URL, aset CDN, push notification. Aturan teknisnya di §29A.

Status per fitur ada di `docs/95-notion-parity.md`; alasan di balik keputusan yang terasa aneh ada di `docs/96-decisions.md`.

## Dokumentasi

Spesifikasi penuh dipecah per topik di `docs/`. **Indeksnya `docs/memoire_technical_plan.md`** — §0 memuat peta seksi → file.

```text
docs/memoire_technical_plan.md   indeks + arsitektur inti (§0-§9, §56, §57, §67-§69)
docs/10-data-model.md            skema, invarian data, transaksi, index
docs/11-content-types.md         registry tipe halaman, whiteboard, diagram
docs/12-editor-blocks.md         editor, katalog blok, identitas blok, drag
docs/20-database.md              properti, view, filter, formula, relation, rollup
docs/30-navigation-search.md     sidebar, search, command palette, backlink
docs/40-files-media.md           storage, upload, kebijakan media self-hosted
docs/50-portability.md           import, export, backup, trash, versi
docs/60-platform.md              offline, tema, settings, desktop, reminder
docs/70-api-contract.md          validasi, packages bersama, katalog endpoint
docs/80-engineering.md           testing, struktur, performa, CI, error handling
docs/90-roadmap.md               fase + Sprint 1-29
docs/95-notion-parity.md         matriks paritas Notion
docs/96-decisions.md             ADR: kenapa alternatif lain ditolak
```

Nomor seksi (§22, §11A) adalah identitas permanen, bukan posisi — jangan pernah menomori ulang. Kalau ada perubahan keputusan arsitektur, **update file topik yang tepat**, jangan menumpuknya ke indeks, dan tambahkan entri ADR di `96-decisions.md`.

## Tech Stack

```text
Frontend   : Next.js, React, TypeScript, Tailwind CSS, Tiptap, Zustand, TanStack Query
UI         : shadcn/ui + Radix, lucide-react            (mulai Sprint 14)
Interaksi  : dnd-kit (di luar editor), drag native ProseMirror (di dalam editor)
Konten     : KaTeX (math), Shiki (syntax highlight), date-fns
Whiteboard : Excalidraw
Diagram    : React Flow (page penuh), Mermaid (block inline di document)
Backend    : NestJS, TypeScript, REST, Zod, @nestjs/schedule
Database   : PostgreSQL + Drizzle ORM
Storage    : S3-compatible (MinIO untuk lokal)
Monorepo   : pnpm workspace
Testing    : Vitest (unit), Supertest (integration), Playwright (e2e, mulai Sprint 15)
Desktop    : Tauri
```

Jangan tambahkan Redis, WebSocket, CRDT, GraphQL, microservices, atau Kubernetes kecuali ada kebutuhan nyata yang terukur — ini prinsip desain yang disengaja, bukan kelalaian.

## Struktur Repo

```text
memoire/
├── apps/
│   ├── web/                     # TIDAK ada src/
│   │   ├── app/                 # route App Router
│   │   ├── features/            # 1 folder per fitur, termasuk content-types/
│   │   ├── components/ui/       # primitif shadcn/Radix
│   │   ├── lib/  stores/  hooks/
│   │   └── public/              # aset self-hosted: font, KaTeX, sw.js
│   ├── api/src/                 # PUNYA src/
│   │   ├── content-types/       # 1 modul per Content Type
│   │   ├── pages/  blocks/  databases/  attachments/  search/  export/
│   │   └── db/  common/
│   └── desktop/src-tauri/
├── packages/
│   ├── validation/              # @memoire/validation — skema Zod bersama
│   └── formula/                 # @memoire/formula — parser + evaluator
├── infra/{docker,nginx}/
└── docs/                        # lihat bagian Dokumentasi
```

`packages/{ui,editor,types,config}` **tidak dibuat** — masing-masing hanya punya satu konsumen, jadi mengekstraknya cuma menambah lapisan (ADR-13). Jangan buat paket spekulatif.

## Prinsip Arsitektur (wajib diikuti)

1. **Modular monolith.** Satu backend NestJS, satu frontend Next.js. Jangan pecah jadi service terpisah.
2. **Page adalah polymorphic.** Kolom `pages.type` menentukan jenis konten (`document | database | whiteboard | diagram`). Jangan asumsikan setiap page punya `blocks` — cek `type` dulu. Baris database adalah halaman `document` dengan `pages.database_id` terisi, **bukan** tipe baru (ADR-08).
3. **Registry adalah cara menambah fitur baru**, bukan modifikasi langsung ke sidebar/command-palette/router. Ada empat, dan semuanya internal & compile-time:
   - `ContentTypeRegistry` — tipe halaman. Backend di `apps/api/src/content-types/<nama>/` (`createDefaultContent`, `getContent`, `updateContent`, `deleteContent`, `exportContent`, `validateContent`); frontend di `apps/web/features/content-types/<nama>/`.
   - `BlockTypeRegistry` — tipe blok. `toHtml`, `toMarkdown`, `toPlainText` **wajib** ada di tipenya.
   - `PropertyTypeRegistry` — tipe properti database.
   - `ViewTypeRegistry` — tipe view database.
   - **Jangan** hardcode nama tipe ke sidebar, slash command, command palette, eksportir, atau ekstraktor teks pencarian — semuanya membaca dari registry.
4. **JSONB untuk konten fleksibel** (`blocks.content`, `database_rows.values`, `page_canvases.elements`), **kolom/tabel normal untuk apa pun yang di-filter, di-sort, atau di-relasikan**. Relation punya tabelnya sendiri (`database_relation_links`) justru karena aturan ini, bukan sebagai pengecualiannya.
5. **Tidak ada realtime collaboration.** Autosave = debounce (500–1500ms untuk editor, ~800ms untuk canvas) + PATCH biasa. Jangan pernah menambahkan WebSocket/CRDT untuk "sync" — cukup HTTP.
6. **Soft delete, bukan hard delete** untuk pages (`is_archived` → Trash → restore/permanent delete).
7. **Operasi yang mengubah struktur (move page, delete database, dll) wajib pakai database transaction.**
8. **File binary tidak pernah masuk PostgreSQL.** Selalu ke object storage, direferensikan lewat `attachments.storage_key`.

## Invarian Wajib

Aturan yang harus benar setiap saat. Sebagian tidak bisa dipaksakan basis data — justru itu sebabnya ditulis di sini. Detail di `docs/10-data-model.md` §10B.

1. **Identitas blok.** Setiap node blok punya atribut `blockId`. `PUT /pages/:id/blocks` adalah upsert-by-id + delete-missing, **bukan** delete-all + insert. Id tidak pernah diregenerasi untuk konten yang tidak berubah. `blocks.parent_block_id` **permanen NULL** — blok bersarang tinggal di dalam `content` JSON dan dialamati lewat `descendant_ids`.
2. **UUID dari klien.** Setiap `POST` menerima `id` opsional dari klien, dan klien selalu mengirimkannya. Tidak ada pemetaan ulang id sementara di mana pun.
3. **PATCH yang bisa digabung harus lengkap.** Resource yang PATCH-nya mungkin di-coalesce oleh outbox offline (terutama `database_rows.values`) dikirim sebagai representasi **utuh**, bukan patch parsial dari objek bersarang.
4. **State view tersimpan, tidak pernah `useState`.** Filter, sort, grup, visibilitas & urutan & lebar kolom, row height, konfigurasi kartu, dan kalkulasi semuanya di `database_views.config`, divalidasi `viewConfigSchema`, dan selalu melewati `migrateViewConfig` saat baca maupun tulis.
5. **Permintaan keluar diambil dari server, bukan browser.** Pratinjau tautan dan pengambilan metadata dijalankan oleh NestJS lalu di-cache — kalau browser yang menembak langsung, setiap situs yang pernah ditempel tahu IP dan waktu baca pengguna. Wajib ada timeout, batas ukuran, dan **penjaga SSRF** (tolak loopback, IP privat, skema non-http). Hasilnya di-cache dan konten harus tetap utuh saat pengambilan gagal atau offline. Detail di §29A.
6. **Kepemilikan drag.** Reorder blok memakai drag native ProseMirror. dnd-kit tidak pernah dipasang di dalam DOM konten ProseMirror. `DndContext` per fitur, **tidak pernah** di `layout.tsx` — Excalidraw dan React Flow menangkap pointer event secara agresif.
7. **Nilai turunan otoritatif di server.** Hasil formula dan rollup ada di `database_rows.computed`, ditulis hanya oleh API, tidak pernah oleh klien. Formula volatil (`now`/`today`) dievaluasi saat baca dan tidak bisa di-filter/sort di SQL.
8. **Server adalah kontrak kueri.** Pembacaan baris database lewat `POST /databases/:id/query`. Filter/sort di klien hanya overlay optimistik, dan dimatikan di atas satu halaman baris.
9. **Soft delete menang atas cascade.** Tidak ada FK cascade yang boleh menghapus baris `pages`. Penghapusan yang menyentuh halaman ditangani di transaksi service layer. Cascade antar tabel konten non-page dibolehkan.
10. **Search vector adalah generated column.** Tanpa trigger, tanpa job reindex, tanpa antrean. Menambah field yang bisa dicari berarti mengubah ekspresi generated-nya di migrasi.
11. **Skema bersama hanya di `@memoire/validation`.** Bentuk request/response yang dipakai kedua aplikasi tinggal di sana dan tidak di tempat lain.

## Konvensi Kode

- **TypeScript strict**, tidak ada `any` kecuali benar-benar tidak terhindarkan (beri komentar alasan).
- **Validasi dengan Zod** di boundary API, dengan schema dibagi frontend-backend lewat `packages/validation`.
- **Service layer menangani business logic**, controller cuma routing + validasi, repository cuma akses data. Jangan taruh query kompleks di controller.
- **Feature-based folder**, bukan menumpuk semua di `components/` generik.
- Commit message: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` — ikuti format yang sudah ada di git log.

## Testing

- Setiap perubahan di `content-types/`, `blocks/`, atau `databases/` wajib disertai unit test (Vitest).
- Wajib punya unit test tersendiri: `@memoire/formula` (parser, evaluator, deteksi siklus), query/filter builder, `migrateViewConfig`, round-trip setiap serializer blok (`toHtml`/`toMarkdown`/`toPlainText`), coalescer offline, dan kebijakan retensi versi.
- Endpoint baru di NestJS wajib punya integration test (Supertest).
- Flow kritis dijaga lewat Playwright — jangan hapus/skip tanpa alasan kuat.
- **Tes penjaga SSRF**: pengambil pratinjau tautan wajib punya tes yang menolak loopback, IP privat, dan skema non-http. Tanpa itu, menempel `http://localhost:3001/api/export/json` ke sebuah halaman membuat server mengambil isinya sendiri dan menaruhnya di pratinjau.

## Yang TIDAK boleh ditambahkan tanpa diskusi eksplisit

```text
Autentikasi multi-user / role & permission
Realtime collaboration (WebSocket, CRDT, Hocuspocus, Liveblocks)
Microservices / Kubernetes / GraphQL / Kafka
Redis (sebelum ada kebutuhan cache/queue yang jelas)
Plugin runtime pihak ketiga (registry tetap internal, compile-time)

Integrasi yang butuh akun pihak ketiga (ditunda, bukan dilarang — diskusikan dulu):
  Google Drive, Slack, Figma, GitHub, Jira
  Notion sync / database tersinkron dari sumber luar
  Web clipper, import lewat API Evernote/Google Docs
  Fitur AI

Implementasi yang sudah ditolak beserta alasannya di docs/96-decisions.md:
  Puppeteer / headless browser untuk ekspor PDF        (ADR-12)
  Normalisasi nested block ke blocks.parent_block_id   (ADR-01)
  dnd-kit di dalam DOM konten ProseMirror              (ADR-11)
  DndContext global di layout.tsx                      (ADR-11)
  pages.type baru untuk baris database                 (ADR-08)
  FK cascade yang menghapus baris pages                (ADR-10)
  State view di React useState                         (ADR-18)
  Klien menulis database_rows.computed                 (ADR-03)
  Fetch ke host luar langsung dari browser             (§29A.1 — bocor privasi)
  Fetch tanpa timeout, batas ukuran, dan penjaga SSRF  (§29A.1)
```

Kalau sebuah task sepertinya membutuhkan salah satu di atas, berhenti dan tanyakan ke user dulu — kemungkinan besar ada pendekatan lebih sederhana yang sejalan dengan prinsip proyek ini.

## Perintah yang Sering Dipakai

```bash
pnpm install
pnpm dev                 # jalankan web + api bersamaan
pnpm --filter @memoire/web dev
pnpm --filter @memoire/api dev
pnpm infra:up            # Docker Compose: Postgres + MinIO
pnpm infra:down
pnpm db:generate         # Drizzle: generate migration SQL
pnpm db:migrate          # Drizzle: apply migration
pnpm db:studio           # Drizzle Studio
pnpm typecheck           # tsc --noEmit
pnpm lint
pnpm test                # Vitest (unit + integration Supertest)
pnpm test:e2e            # Playwright
pnpm build
pnpm desktop:dev         # Tauri (butuh toolchain Rust)
pnpm desktop:build
```

> **Drizzle Kit tidak menghasilkan tiga hal ini otomatis** — tulis manual di file SQL migrasi:
> generated column (`search_vector`), partial unique index (`databases_full_page_uniq`), dan
> backfill data (`blockId` ke `content` lama). `pnpm db:generate` akan menghasilkan migrasi yang
> terlihat lengkap tapi diam-diam melewatkannya.
> Sesuaikan daftar perintah ini bila script `package.json` berubah.
