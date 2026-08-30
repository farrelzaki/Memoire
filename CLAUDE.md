# CLAUDE.md

Panduan ini dibaca oleh Claude Code setiap kali bekerja di repo ini. Tujuannya: memastikan setiap perubahan konsisten dengan arsitektur dan prinsip Memoire, bukan pola generik.

## Tentang Proyek

**Memoire** adalah personal knowledge management app bergaya Notion — dipakai oleh **satu pengguna saja**. Tidak ada dan tidak akan ada fitur multi-user, kolaborasi realtime, atau permission antar-akun. Lihat `docs/memoire_technical_plan.md` untuk spesifikasi lengkap; file ini hanya ringkasan kerja untuk agent.

Referensi arsitektur penuh selalu ada di `docs/memoire_technical_plan.md`. Kalau ada perubahan keputusan arsitektur besar, update juga file itu — jangan biarkan CLAUDE.md dan technical plan berbeda cerita.

## Tech Stack

```text
Frontend   : Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Tiptap, Zustand, TanStack Query
Whiteboard : Excalidraw
Diagram    : React Flow (page penuh), Mermaid (block inline di document)
Backend    : NestJS, TypeScript, REST, Zod
Database   : PostgreSQL + Drizzle ORM
Storage    : S3-compatible (MinIO untuk lokal)
Monorepo   : pnpm workspace
Testing    : Vitest (unit), Supertest (integration), Playwright (e2e)
Desktop    : Tauri (tahap lanjut)
```

Jangan tambahkan Redis, WebSocket, CRDT, GraphQL, microservices, atau Kubernetes kecuali ada kebutuhan nyata yang terukur — ini prinsip desain yang disengaja, bukan kelalaian.

## Struktur Repo

```text
memoire/
├── apps/
│   ├── web/src/features/content-types/   # 1 folder per Content Type (frontend)
│   └── api/src/content-types/            # 1 modul per Content Type (backend)
├── packages/{ui,editor,types,validation,config}/
├── infra/{docker,nginx}/
└── docs/memoire_technical_plan.md
```

## Prinsip Arsitektur (wajib diikuti)

1. **Modular monolith.** Satu backend NestJS, satu frontend Next.js. Jangan pecah jadi service terpisah.
2. **Page adalah polymorphic.** Kolom `pages.type` menentukan jenis konten (`document | database | whiteboard | diagram`). Jangan asumsikan setiap page punya `blocks` — cek `type` dulu.
3. **Content Type Registry adalah cara menambah fitur baru**, bukan modifikasi langsung ke sidebar/command-palette/router. Kalau diminta menambah tipe halaman baru:
   - Buat modul backend di `apps/api/src/content-types/<nama>/` yang mengimplementasikan kontrak `ContentTypeModule` (`createDefaultContent`, `getContent`, `updateContent`, `deleteContent`, `exportContent`, `validateContent`).
   - Buat komponen renderer di `apps/web/src/features/content-types/<nama>/` yang mengimplementasikan `ContentTypeDefinition`.
   - Daftarkan ke `ContentTypeRegistry` di kedua sisi.
   - **Jangan** hardcode nama tipe baru ke sidebar, slash command, atau command palette — mereka semua membaca dari registry.
4. **JSONB untuk konten fleksibel** (`blocks.content`, `blocks.properties`, `database_rows.values`, `page_canvases.elements`), **kolom/tabel normal untuk apa pun yang di-filter, di-sort, atau di-relasikan**. Jangan masukkan semuanya ke JSONB demi kepraktisan.
5. **Tidak ada realtime collaboration.** Autosave = debounce (500–1500ms untuk editor, ~800ms untuk canvas) + PATCH biasa. Jangan pernah menambahkan WebSocket/CRDT untuk "sync" — cukup HTTP.
6. **Soft delete, bukan hard delete** untuk pages (`is_archived` → Trash → restore/permanent delete).
7. **Operasi yang mengubah struktur (move page, delete database, dll) wajib pakai database transaction.**
8. **File binary tidak pernah masuk PostgreSQL.** Selalu ke object storage, direferensikan lewat `attachments.storage_key`.

## Konvensi Kode

- **TypeScript strict**, tidak ada `any` kecuali benar-benar tidak terhindarkan (beri komentar alasan).
- **Validasi dengan Zod** di boundary API (request/response) dan idealnya schema dibagi antara frontend-backend via `packages/validation`.
- **Service layer menangani business logic**, controller cuma routing + validasi, repository cuma akses data. Jangan taruh query kompleks di controller.
- **Feature-based folder**, bukan menumpuk semua di `components/` generik.
- Commit message: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` — ikuti format yang sudah ada di git log.

## Testing

- Setiap perubahan di `content-types/`, `blocks/`, atau `databases/` (filter/sort/formula) wajib disertai unit test (Vitest).
- Endpoint baru di NestJS wajib punya integration test (Supertest).
- Flow kritis (create page → type content → reload → content persist; create database → filter/sort → reload) dijaga lewat Playwright — jangan hapus/skip test ini tanpa alasan kuat.

## Yang TIDAK boleh ditambahkan tanpa diskusi eksplisit

```text
Autentikasi multi-user / role & permission
Realtime collaboration (WebSocket, CRDT, Hocuspocus, Liveblocks)
Microservices / Kubernetes
GraphQL
Plugin runtime pihak ketiga (registry tetap internal, compile-time)
Redis (sebelum ada kebutuhan cache/queue yang jelas)
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
pnpm typecheck           # tsc --noEmit (web + api)
pnpm lint
pnpm test                # Vitest (unit + integration Supertest)
pnpm build
```

> `pnpm test:e2e` (Playwright) belum di-setup — ditunda sampai ada flow UI nyata (Sprint 3+).
> Sesuaikan daftar ini bila script `package.json` berubah.
