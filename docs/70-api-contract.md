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
GET /search?q=...
```

## Attachments

```http
POST   /attachments/upload
GET    /attachments/:id
DELETE /attachments/:id
```

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
GET    /pages/:id/versions           -- BARU §33A
GET    /pages/:id/versions/:vid
POST   /pages/:id/versions           -- BARU, simpan versi manual
POST   /pages/:id/versions/:vid/restore  -- BARU

Blocks
GET    /pages/:pageId/blocks
PUT    /pages/:pageId/blocks         -- jadi upsert-by-id (§11E.3)
GET    /blocks/:id                   -- BARU, resolusi lewat descendant_ids (§11E.4)

Databases
GET    /databases/by-page/:pageId
GET    /databases/:id                -- BARU, untuk inline & linked view (§20C)
POST   /databases                    -- BARU, membuat database inline
PATCH  /databases/:id                -- BARU
DELETE /databases/:id                -- BARU
POST   /databases/:id/query          -- BARU §22A, satu-satunya jalur baca baris

Properties
POST   /databases/:id/properties
PATCH  /database-properties/:id
DELETE /database-properties/:id      -- menyapu view, formula, relation (§20A.5)

Rows
POST   /databases/:id/rows
PATCH  /database-rows/:id            -- values selalu LENGKAP (§10B.5)
DELETE /database-rows/:id
POST   /database-rows/:id/archive    -- BARU §20D.5
POST   /database-rows/:id/restore    -- BARU

Relations
POST   /database-rows/:id/relations/:propertyId    -- BARU §23A
DELETE /database-rows/:id/relations/:propertyId/:toRowId  -- BARU

Views
POST   /databases/:id/views
PATCH  /database-views/:id           -- config divalidasi viewConfigSchema (§21A)
DELETE /database-views/:id
POST   /database-views/:id/duplicate -- BARU

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

Portability
GET    /export/json
GET    /export/markdown              -- BARU §30B
GET    /export/html                  -- BARU
GET    /export/zip                   -- BARU
GET    /databases/:id/export.csv     -- BARU, menghormati view (§30B.2)
POST   /import/preview               -- BARU §30A.2
POST   /import/commit                -- BARU

Templates
GET    /templates                    -- BARU, tabel sudah ada tapi belum dipakai
POST   /templates
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
