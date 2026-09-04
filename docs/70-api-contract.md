> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §39, §39A, §44, §44A

---

# 39. Validation
Gunakan:

**Zod**

Di frontend dan backend untuk shared validation bila memungkinkan.

Contoh:

```text
CreatePageSchema
UpdatePageSchema
CreateDatabaseSchema
CreateAttachmentSchema
```

---

# 39A. packages/validation dan packages/formula

CLAUDE.md menjanjikan `packages/{ui,editor,types,validation,config}`. Kenyataannya `packages/`
hanya berisi README. Akibatnya skema hidup terpisah di `apps/api/src/*/*.schema.ts` tanpa padanan
di frontend — dan tipe `Filter`/`Sort` di `apps/web/features/database/database.lib.ts` sudah
menyimpang dari skema Zod di backend.

## 39A.1 Dua paket, bukan lima

`ui`, `editor`, `types`, dan `config` masing-masing hanya punya satu konsumen (`apps/web`).
Mengekstraknya hanya menambah lapisan tanpa manfaat. **CLAUDE.md yang dikoreksi, bukan paketnya
yang dibuat.**

Yang benar-benar dibutuhkan dua:

```text
packages/validation/     @memoire/validation
packages/formula/        @memoire/formula
```

## 39A.2 Isi @memoire/validation

```text
src/
  primitives.ts    uuid, isoDateTime, hexColor, nonEmptyString, positionInt
  page.ts          pageType, createPage/updatePage/movePage, pageSettings (§35A)
  block.ts         blockType, tiptapNode (rekursif, dengan blockId), replaceBlocks (§11E)
  database.ts      propertyType + config discriminated union per tipe (§20A.3),
                   createProperty/updateProperty, createRow/updateRow
  view.ts          viewType, FilterRule/FilterGroup, calculationId,
                   viewConfigSchema, migrateViewConfig (§21A)
  query.ts         request/response POST /databases/:id/query (§22A)
  formula.ts       skema sumber formula + tipe node AST
  relation.ts      payload relation (§23A)
  notification.ts  reminder, notification, recurrence (§70)
  settings.ts      seluruh objek settings (§35A)
  portability.ts   skema import/export, amplop memoire.json (§30A, §30B)
  index.ts
```

Tanpa langkah build: `main` dan `types` menunjuk langsung ke `./src/index.ts`. Mengonsumsi
TypeScript mentah menghindari masalah urutan build saat `pnpm dev` berjalan paralel.

## 39A.3 Isi @memoire/formula

Tokenizer, parser, evaluator, dan pustaka fungsi (§24A). Bergantung pada `@memoire/validation`
untuk tipe AST dan pada `date-fns`.

Dipakai identik di frontend (pratinjau langsung saat mengetik) dan backend (nilai otoritatif). Satu
implementasi berarti angka yang dilihat saat menulis formula pasti sama dengan angka yang tersimpan.

## 39A.4 Penyambungan

Bagian yang biasanya patah:

```text
pnpm-workspace.yaml   sudah meng-glob packages/* -- tidak perlu diubah
next.config.mjs       transpilePackages: ['@memoire/validation', '@memoire/formula']
apps/api/tsconfig     paths ke packages/*/src
vitest                unplugin-swc sudah ada sebagai devDependency dan mengompilasi TS-nya
```

## 39A.5 Aturan

Bentuk request/response yang dipakai **kedua** aplikasi tinggal di `@memoire/validation` dan tidak
di tempat lain. Selama migrasi, berkas `apps/api/src/**/*.schema.ts` menjadi re-export tipis, lalu
dihapus di akhir Sprint 13.

---

# 44. API Design
## Pages

```http
GET    /pages
GET    /pages/:id
POST   /pages
PATCH  /pages/:id
DELETE /pages/:id
POST   /pages/:id/duplicate
POST   /pages/:id/move
POST   /pages/:id/archive
POST   /pages/:id/restore
```

## Blocks

```http
GET    /pages/:id/blocks
POST   /pages/:id/blocks
PATCH  /blocks/:id
DELETE /blocks/:id
POST   /blocks/:id/move
POST   /blocks/:id/duplicate
```

## Databases

```http
GET    /databases/:id
POST   /databases
PATCH  /databases/:id
DELETE /databases/:id
POST   /databases/:id/rows
PATCH  /database-rows/:id
DELETE /database-rows/:id
```

## Canvas (Whiteboard & Diagram)

```http
GET    /pages/:id/canvas
PATCH  /pages/:id/canvas
POST   /pages/:id/canvas/export     -- PNG/SVG
```

## Search

```http
GET /search?q=...&mode=quick|full&type=document|database|whiteboard|diagram&timeRange=7d|30d|year&locationPageId=<uuid>&sort=relevance|updated&limit=1..50
```

Validasi lewat `@memoire/validation`'s `searchQuerySchema` — sumber kebenaran tunggal untuk bentuk
request. `q` wajib (min 1 karakter, max 200); field lain punya default (`mode=full`,
`sort=relevance`, `limit=20`). `mode` eksplisit dari pemanggil, bukan diturunkan dari panjang
kueri — `quick` untuk command palette/quick switcher (prefix match sambil mengetik), `full` untuk
halaman `/search` (kueri final, `websearch_to_tsquery`, mendukung frasa & `-pengecualian`).

Respons: `SearchHit[]` (`searchHitSchema`, `packages/validation/src/search.ts`):

```ts
{ type: 'page' | 'block' | 'database' | 'row', pageId, blockId?, rowId?, databaseId?,
  title, breadcrumb: string[], snippet: string | null, rank: number }
```

Lihat §25A untuk desain lengkap (generated `search_vector` columns, ranking, cuplikan).

## Attachments

```http
POST   /attachments/upload
GET    /attachments/:id
DELETE /attachments/:id
```

## Import (§30A, Sprint 24 + 24B)

Empat format: Markdown (.md atau .zip berisi banyak .md), `memoire.json`, CSV (satu database),
Notion export .zip. Selalu dua langkah: preview lalu confirm, satu transaksi.

```http
POST   /import/preview
  multipart/form-data: file, kind ('markdown' | 'memoire-json' | 'csv' | 'notion-zip')
  -> 201 { stagingId, summary, warnings: string[] }
     summary (markdown/notion-zip): { pageCount, imageCount, importParentTitle }
       + databaseCount untuk notion-zip
     summary (csv): { databaseName, rowCount, importParentTitle,
                       columns: { name, type }[] }  -- type adalah tebakan

PATCH  /import/:stagingId
  body: { columnTypes: Record<number, PropertyType> }   -- CSV saja; kolom 0 (title) terkunci
  -> 200 { summary }   -- summary.columns memantulkan koreksi

POST   /import/:stagingId/confirm
  -> 201 { importParentPageId, pageCount, warnings: string[] }

DELETE /import/:stagingId
```

Validasi lewat `@memoire/validation`'s `memoireExportSchema` untuk kind `memoire-json`. Gambar
jarak jauh di Markdown/Notion-zip diunduh lewat penjaga SSRF yang sama dengan link preview
(§29A.1), tidak diimplementasikan ulang. Tipe kolom CSV yang diterima lewat `PATCH` dibatasi ke
`title | text | number | date | checkbox` — tipe lain butuh config yang tidak bisa disuplai sel
CSV, ditolak dengan 400.

## Backup (§31, Sprint 24)

Isi arsip: `memoire.json` (bentuk yang sama dengan `GET /export/json`) + `attachments/` — bukan
render lewat registry, jadi murni server-side termasuk dari `@Cron` (lihat ADR-25).

```http
POST /backup/run                    -- pemicu manual, sama seperti tik cron harian
GET  /backup                        -- daftar backup lokal (filename, createdAt, size)
GET  /backup/:filename/download
```

Restore memakai ulang `POST /import/preview` dengan `kind: 'memoire-json'` — tidak ada endpoint
restore terpisah. Retensi: 7 backup terbaru disimpan di `BACKUP_DIR`, sisanya dihapus otomatis.

---

# 44A. Katalog Endpoint

§44 mendaftar bentuk API awal. Ini katalog lengkapnya setelah paritas Notion. Yang bertanda BARU
belum ada; sisanya sudah berjalan.

```http
Pages
GET    /pages                        -- tidak menyertakan row page (§20D.3)
GET    /pages/:id
POST   /pages
PATCH  /pages/:id
POST   /pages/:id/archive
POST   /pages/:id/restore
POST   /pages/:id/duplicate
POST   /pages/:id/move
DELETE /pages/:id
DELETE /pages/:id/permanent
GET    /pages/:id/backlinks          -- BARU §15A
GET    /pages/:id/versions           -- §33A, Sprint 25 -- daftar versi (tanpa content)
POST   /pages/:id/versions           -- simpan versi manual (kind='manual')

Versions (§33A, Sprint 25)
GET    /versions/:id                 -- content penuh, resolusi storage_key transparan
GET    /versions/diff?from=:id&to=:id
POST   /versions/:id/restore         -- §33A.6, tidak pernah merusak

Blocks
GET    /pages/:pageId/blocks
PUT    /pages/:pageId/blocks         -- jadi upsert-by-id (§11E.3)
GET    /blocks/:id                   -- BARU, resolusi lewat descendant_ids (§11E.4)

Databases
GET    /databases                    -- id/name/ownerPageId/isInline, untuk picker linked view (§20C.3)
GET    /databases/by-page/:pageId
GET    /databases/:id                -- untuk inline & linked view (§20C)
POST   /databases                    -- membuat database (page-backed atau inline, §20C)
PATCH  /databases/:id                -- BELUM, rename/re-konfigurasi database
DELETE /databases/:id                -- BELUM
POST   /databases/:id/query          -- §22A, satu-satunya jalur baca baris

Properties
POST   /databases/:id/properties
PATCH  /database-properties/:id
DELETE /database-properties/:id      -- menyapu view, formula, relation (§20A.5)

Rows
POST   /databases/:id/rows
PATCH  /database-rows/:id            -- values selalu LENGKAP (§10B.5)
DELETE /database-rows/:id
POST   /database-rows/:id/archive    -- §20D.5, mirrors onto the row's page if it has one
POST   /database-rows/:id/restore
GET    /database-rows/by-page/:pageId -- row lookup for the row-page properties panel (§20D)

Relations
POST   /database-rows/:id/relations/:propertyId    -- BARU §23A
DELETE /database-rows/:id/relations/:propertyId/:toRowId  -- BARU

Views
POST   /databases/:id/views
PATCH  /database-views/:id           -- config divalidasi viewConfigSchema (§21A)
DELETE /database-views/:id
POST   /database-views/:id/duplicate
POST   /database-views/:id/move      -- geser posisi dgn tab sebelah; drag-and-drop di Sprint 21

Canvas
GET    /pages/:pageId/canvas
PATCH  /pages/:pageId/canvas

Attachments
POST   /attachments/upload
GET    /attachments/:id
GET    /attachments/:id/content
DELETE /attachments/:id

Link preview
POST   /link-preview                 -- BARU §29A.1, bookmark/embed, cache-first + penjaga SSRF

Search
GET    /search                       -- FTS + ranking + snippet (§25A)

Notifications
GET    /notifications                -- BARU §70
PATCH  /notifications/:id            -- BARU, tandai dibaca
POST   /notifications/read-all       -- BARU
GET    /reminders                    -- BARU
POST   /reminders                    -- BARU
DELETE /reminders/:id                -- BARU

Settings
GET    /settings                     -- BARU §35A
PATCH  /settings                     -- BARU
GET    /workspace                    -- Sprint 25, workspaces.settings mentah (versionRetentionDays, §33A.3)
PATCH  /workspace                    -- body { settings: {...} }, merge ke workspaces.settings

Portability
GET    /export/json
GET    /export/markdown              -- BARU §30B
GET    /export/html                  -- BARU
GET    /export/zip                   -- BARU
GET    /databases/:id/export.csv     -- BARU, menghormati view (§30B.2)
POST   /import/preview               -- BARU §30A.2
POST   /import/commit                -- BARU

Templates
GET    /databases/:id/templates      -- template baris, satu database (§20D)
POST   /databases/:id/templates
DELETE /templates/:id

Health
GET    /health
```

## 44A.1 Aturan lintas endpoint

```text
Setiap POST menerima id opsional dari klien; klien selalu mengirimkannya (§10B.5)
Setiap error memakai amplop yang sama (§60)
Pembacaan baris database HANYA lewat POST /databases/:id/query
Endpoint tulis tetap REST biasa
```
