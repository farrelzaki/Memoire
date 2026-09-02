> Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md) §0 · Seksi file ini: §73

# 97. Progress Tracker

File ini adalah **satu-satunya sumber kebenaran soal "sudah sampai mana"**. Update
setiap kali sebuah item Sprint selesai atau status berubah, supaya sesi berikutnya
bisa langsung lanjut tanpa harus meng-audit ulang kode.

Jangan hapus riwayat sprint yang sudah selesai — cukup tandai `[x]` dan biarkan,
supaya jadi log historis. Sprint yang sedang berjalan ditulis paling detail.

---

## Status Ringkas

**Sprint 13 — Fondasi: Identitas & Kontrak: semua item checklist di bawah sudah `[x]`.**
Sprint 1–12 + iterasi "app shell ala Notion" sudah selesai (commit `13a6bd5`, `2a6608c`).

Belum di-commit — kerja Sprint 13 masih di working tree (belum ada commit "sprint 13").
Jalankan `git status` untuk lihat file yang berubah. Kalau user minta commit, pakai
pesan `feat: sprint 13 — identitas blok, UUID klien, dan tiga registry`, lalu **pindah
status ringkas ini ke Sprint 14** (§14, `docs/90-roadmap.md`) dan mulai checklist baru
di bawah — jangan hapus checklist Sprint 13, biarkan sebagai log historis.

---

## Sprint 13 — Checklist Detail

- [x] **`packages/validation` (`@memoire/validation`)** dibuat dan dipakai sebagai
      dependency workspace di `apps/api` dan `apps/web` (bukan `transpilePackages`,
      karena paket ini di-build ke `dist/` lewat `tsc` — lihat `packages/validation/package.json`).
      Isinya: `primitives.ts` (uuid, isoDateTime, hexColor, positionValue, iconString),
      `page.ts`, `block.ts`, `database.ts`.
- [x] **Ekstensi Tiptap BlockId** + deteksi id duplikat —
      `apps/web/features/editor/block-id.ts` (+ `block-id.spec.ts`).
- [x] **`PUT /pages/:id/blocks` upsert-by-id** (bukan delete-all + insert) —
      `apps/api/src/blocks/block-tree.lib.ts` (+ spec), dipakai dari `blocks.service.ts`.
      `apps/api/src/blocks/blocks.schema.ts` sekarang re-export dari `@memoire/validation`.
- [x] **`blocks.descendant_ids` + GIN index + migrasi backfill blockId** —
      `apps/api/drizzle/0003_fair_synch.sql` (kolom + index),
      `apps/api/drizzle/0004_backfill_block_ids.sql` (backfill). Migrasi **belum di-apply**
      ke database lokal — jalankan `pnpm db:migrate` sebelum lanjut kerja di area blocks.
- [x] **`GET /blocks/:id`** — lookup blok standalone lewat `descendant_ids`, dipakai
      calon fitur search/backlink — `apps/api/src/blocks/block.controller.ts`.
- [x] **UUID dari klien untuk POST — sisi backend (API menerima & memakai `id` dari body)**:
      - `pages.schema.ts`, `databases.schema.ts` (api) sekarang re-export dari
        `@memoire/validation` (`createPageSchema`, `createPropertySchema`,
        `createRowSchema`, `createViewSchema` — semua punya `id: uuid.optional()`).
      - `pages.service.ts#create`, `databases.service.ts#createProperty/createRow/createView`
        memakai `data.id` kalau ada, fallback ke `defaultRandom()` kalau tidak.
      - Test: `apps/api/test/pages.e2e-spec.ts` dan `apps/api/test/databases.e2e-spec.ts`
        punya kasus "accepts a client-supplied id (§10B.5 invariant 14)" untuk
        page/property/row/view.
- [x] **UUID dari klien — sisi frontend.** `apps/web/lib/api.ts` punya helper
      `newClientId()` (thin wrapper atas `crypto.randomUUID()`, sama pola dengan
      `block-id.ts`). `createPage`, `createProperty`, `createRow`, `createView`
      sekarang selalu mengirim `id` di body POST — pakai id dari caller kalau
      ada, kalau tidak generate baru sebelum request dikirim. Karena id dibuat
      **sebelum** masuk outbox, retry offline (`offline-sync.ts`) otomatis aman
      dari duplikasi — tidak perlu perubahan apa pun di outbox itu sendiri.
      Test: `apps/web/lib/api.spec.ts`.
- [x] **Tes invarian outbox: PATCH selalu representasi lengkap.** Logika merge
      diekstrak dari `database-editor.tsx#commitCell` ke
      `apps/web/features/database/database.lib.ts#mergeRowValues` (pure function,
      lebih gampang dites daripada inline di komponen) dan dipakai balik di
      `commitCell`. Test di `database.lib.spec.ts` menjamin hasil merge selalu
      berisi seluruh property lama + yang baru, bukan patch parsial.
- [x] **`BlockTypeRegistry` + `PropertyTypeRegistry` + `ViewTypeRegistry` (kontrak, belum diisi penuh).**
      Ketiganya sekarang ada sebagai kelas registry compile-time (`register`/`get`/`list`),
      sesuai §11D, dan sudah diisi dengan tipe yang **sudah eksis** di editor/database
      hari ini — bukan seluruh katalog 25/12/3 tipe (itu tetap Sprint 16/18/21):
      - `apps/web/features/editor/block-type-registry.ts` — 12 tipe blok yang sudah
        dipakai `document-editor.tsx` (lihat `BLOCK_ID_TYPES` di `block-id.ts`), tiap
        entri punya `toHtml`/`toMarkdown`/`toPlainText` yang benar-benar berfungsi
        (bukan stub) — termasuk delegasi rekursif untuk list/quote bersarang.
        Test: `block-type-registry.spec.ts`.
      - `apps/web/features/database/property-type-registry.ts` — 7 tipe properti yang
        sudah ada di `PropertyType` (`title/text/number/select/checkbox/date/url`),
        plus helper `rowToPlainText()` untuk cuplikan pencarian nanti (§25A).
        Test: `property-type-registry.spec.ts`.
      - `apps/web/features/database/view-type-registry.ts` — 4 tipe view
        (`table/board/calendar/gallery`), `component` menunjuk ke komponen yang
        sudah ada di `database-views.tsx`. Test: `view-type-registry.spec.ts`.
      - **Belum dikerjakan dengan sengaja**: mengganti switch statement di
        `database-views.tsx#Cell` dan render switch di `database-editor.tsx` supaya
        benar-benar membaca dari registry alih-alih tetap hardcoded. Wiring UI itu
        berisiko tanpa bisa diverifikasi visual di sesi ini (tidak ada browser tool
        yang dimuat), dan secara alami memang pekerjaan Sprint 18/21 (roadmap
        menyebut `PropertyTypeRegistry.calculations` dipakai baru di situ). Kalau
        mulai sprint itu, mulai dari titik ini — kontraknya sudah siap dipakai.
      - `apps/web/package.json` butuh `zod` ditambah langsung sebagai dependency
        (sebelumnya cuma kebawa transitif lewat `@memoire/validation`) supaya
        `property-type-registry.ts`/`view-type-registry.ts` bisa jalan di Vitest.

### Verifikasi terakhir (state di atas)

```
pnpm typecheck   → PASS (packages/validation, apps/api, apps/web)
pnpm test        → PASS (apps/api: 14 files / 62 tests, apps/web: 15 files / 84 tests,
                    packages/validation: 1 file / 5 tests)
```

Catatan: `pnpm test` lewat `pnpm -r` kadang menampilkan `Unhandled Rejection: Channel
closed (ERR_IPC_CHANNEL_CLOSED)` dari worker vitest saat tiga workspace jalan paralel.
Itu race teardown tinypool yang flaky, bukan test yang gagal — jalankan
`pnpm --filter @memoire/api test` sendirian untuk konfirmasi kalau itu muncul lagi.

---

## Cara Lanjut

1. Baca bagian "Sprint 13 — Checklist Detail" di atas, kerjakan dari item pertama
   yang masih `[ ]`.
2. Setelah satu item selesai: update checklist ini (`[x]`), jalankan `pnpm typecheck`
   dan `pnpm test`, lalu commit dengan pesan sesuai konvensi (`feat:`, `test:`, dst).
3. Kalau sudah semua item Sprint 13 `[x]`: commit final Sprint 13, lalu pindah
   status ringkas di atas ke **Sprint 14 — Primitif UI** dan mulai checklist baru
   untuk sprint itu berdasarkan `docs/90-roadmap.md` §14.
4. Kalau ada keputusan arsitektur baru yang diambil selama mengerjakan sprint,
   tambahkan entri ADR di `docs/96-decisions.md` — jangan cuma dicatat di sini.

Jangan re-audit kode dari nol kalau file ini sudah ada dan terlihat up to date —
percayai isinya kecuali ada tanda jelas sudah basi (mis. commit baru yang tidak
tercermin di sini, atau user bilang sesuatu sudah berubah).
