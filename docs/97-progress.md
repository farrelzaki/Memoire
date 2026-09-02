> Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md) §0 · Seksi file ini: §73

# 97. Progress Tracker

File ini adalah **satu-satunya sumber kebenaran soal "sudah sampai mana"**. Update
setiap kali sebuah item Sprint selesai atau status berubah, supaya sesi berikutnya
bisa langsung lanjut tanpa harus meng-audit ulang kode.

Jangan hapus riwayat sprint yang sudah selesai — cukup tandai `[x]` dan biarkan,
supaya jadi log historis. Sprint yang sedang berjalan ditulis paling detail.

---

## Status Ringkas

**Sprint 13 — Fondasi: Identitas & Kontrak: selesai, semua item `[x]`.**
**Sprint 14 — Primitif UI: semua item checklist di bawah sudah `[x]`** (dengan beberapa
sub-bagian yang sengaja ditunda — lihat detail di bawah).
Sprint 1–12 + iterasi "app shell ala Notion" sudah selesai (commit `13a6bd5`, `2a6608c`).

Belum di-commit — kerja Sprint 13 + 14 masih di working tree (belum ada commit untuk
keduanya). Jalankan `git status` untuk lihat file yang berubah. Kalau user minta commit,
pisahkan jadi dua commit (`feat: sprint 13 — identitas blok, UUID klien, dan tiga
registry` lalu `feat: sprint 14 — primitif UI (Radix, design token, toast/undo)`), lalu
**pindah status ringkas ini ke Sprint 15** (§15, `docs/90-roadmap.md`) dan mulai checklist
baru di bawah — jangan hapus checklist sprint yang sudah selesai, biarkan sebagai log historis.

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

### Verifikasi terakhir (state Sprint 13)

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

## Sprint 14 — Checklist Detail

Tidak ada browser tool yang dimuat di sesi ini, jadi tidak ada UI yang diverifikasi
visual — verifikasi dilakukan lewat `pnpm typecheck`, `pnpm test`, dan `pnpm build`
(build produksi Next.js benar-benar meng-compile dan mem-prerender tiap route, jadi ini
jaring pengaman paling kuat yang tersedia tanpa browser). **Kalau sesi berikutnya punya
akses browser, jalankan app-nya dan coba tiap primitive sebelum menganggap semuanya
benar-benar oke secara visual** — apa yang tercatat di sini adalah "compiles and builds
correctly", bukan "terlihat benar di layar".

- [x] **shadcn/ui-style Radix primitives** — `apps/web/components/ui/`: `dialog.tsx`,
      `popover.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `tooltip.tsx`, `select.tsx`,
      `checkbox.tsx`, `tabs.tsx`, `scroll-area.tsx`, `toast.tsx` + `toaster.tsx`,
      `command.tsx`. Semua pakai `cn()` (`apps/web/lib/cn.ts`, `clsx` + `tailwind-merge`)
      dan token warna dari §34 (lihat item design token di bawah). `TooltipProvider`
      dipasang di `app/providers.tsx`.
- [x] **lucide-react** terpasang dan dipakai di primitive-primitive di atas (X, Check,
      ChevronRight/Down/Up, Circle, CalendarIcon, Search). Emoji tetap dipakai untuk page
      icon dan ikon di menu yang sudah ada — sesuai instruksi roadmap, ini bukan
      penggantian semua ikon di app.
- [x] **dnd-kit terpasang** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
      + helper posisi pecahan di `apps/web/lib/position.ts` (`fractionalPosition`,
      `needsRenormalization`, `renormalizePositions`) sesuai algoritma §19A.4 (rata-rata
      tetangga, renormalisasi kalau jarak sudah terlalu kecil). Test: `position.spec.ts`.
      **Belum dikerjakan dengan sengaja**: memasang `DndContext` di sidebar/database —
      itu memang pekerjaan Sprint 21/22 per roadmap, bukan Sprint 14.
- [x] **date-fns + DatePicker berbasis Radix** — `apps/web/components/ui/date-picker.tsx`.
      `Calendar` adalah grid bulan buatan sendiri dari `date-fns` (bukan `react-day-picker`
      — sengaja tidak menambah dependency lagi untuk ini), `DatePicker` membungkusnya
      dengan `Popover`. Belum dipasang ke `Cell` properti `date` di database (itu bagian
      dari refactor `PropertyTypeRegistry` yang ditunda ke Sprint 18/21, lihat catatan
      Sprint 13).
- [x] **Migrasi `components/ui/menu.tsx` → `DropdownMenu`.** File lama **dihapus**
      (`useClickOutside`, `MenuItem`, dst — tidak dipakai lagi, dan CLAUDE.md bilang hapus
      total kalau memang tidak dipakai). Tiga pemakainya dipindah:
      - `features/sidebar/sidebar-row.tsx` — menu `⋯` per halaman.
      - `features/sidebar/sidebar.tsx` — menu "+" (New page, dari `ContentTypeRegistry`).
      - `features/shell/page-menu.tsx` + `features/shell/topbar.tsx` — menu `⋯` topbar.
        Sub-menu "Move to…" yang tadinya state machine manual (`moveOpen`/`onBack`)
        sekarang `DropdownMenuSub` bawaan Radix (flyout hover), lebih sederhana dan lebih
        sesuai konvensi Radix daripada state buatan sendiri.
- [x] **Toast + snackbar "Urungkan"** — `stores/toast.ts` (Zustand, non-persisted;
      `toast()` dan `toastWithUndo()` bisa dipanggil dari mana saja tanpa hook) +
      `components/ui/toaster.tsx` dipasang di `app/layout.tsx`. **Sudah dipakai nyata**,
      bukan cuma infrastruktur: archive page di `sidebar-row.tsx` dan `page-menu.tsx`
      sekarang menampilkan toast "Urungkan" yang memanggil `api.restorePage` kalau
      diklik. Test: `stores/toast.spec.ts`.
- [x] **`ConfirmDialog`** — `components/ui/confirm-dialog.tsx`, generik (title/description/
      confirm/cancel/danger). **Belum ada pemakainya** — permanent-delete di
      `trash-dialog.tsx` sudah punya pola konfirmasi inline sendiri yang berfungsi baik
      (dua tombol muncul di tempat, bukan modal); tidak dipaksa migrasi karena tidak ada
      yang rusak dan mengganti UX yang sudah baik tanpa bisa diverifikasi visual itu
      berisiko murni. Pemakai pertamanya kemungkinan besar fitur baru yang butuh
      konfirmasi blocking sungguhan (mis. "Delete database" — §CLAUDE.md daftar operasi
      hard-to-reverse).
- [x] **`CommandDialog`** — `components/ui/command.tsx` (`cmdk` + `Dialog`). **Belum
      menggantikan** `features/command-palette/command-palette.tsx` yang sudah ada dan
      berfungsi (custom implementation dengan keyboard shortcut ⌘K sendiri) — migrasi itu
      juga ditunda dengan alasan yang sama seperti `ConfirmDialog`: berisiko tanpa
      verifikasi visual, dan bukan item yang secara eksplisit diminta roadmap untuk
      sprint ini (roadmap cuma minta primitive-nya *ada*).
- [x] **Design token Tailwind** — CSS variable di `app/globals.css` (`:root` + `.dark`,
      §34: background/foreground/primary/secondary/muted/accent/destructive/border/
      input/ring/radius dalam HSL) + `tailwind.config.ts` memetakannya ke
      `hsl(var(--...))` plus plugin `tailwindcss-animate`. **Sengaja tidak menyentuh**
      skala spacing/typography Tailwind (tetap default) dan **tidak** retrofit warna
      hardcoded zinc-* di layar yang sudah ada (`document-editor.tsx`, `sidebar.tsx`,
      dst) — itu migrasi besar lintas-file yang tidak bisa diverifikasi visual di sesi
      ini; primitive baru di `components/ui/` sudah membaca dari token, layar lama
      migrasi bertahap saat disentuh untuk alasan lain.

### Verifikasi terakhir (state Sprint 14)

```
pnpm typecheck        → PASS (packages/validation, apps/api, apps/web)
pnpm --filter @memoire/web test    → PASS (17 files / 97 tests)
pnpm --filter @memoire/web build   → PASS (next build — compiles + prerenders semua route)
pnpm --filter @memoire/api test    → PASS (14 files / 62 tests)
pnpm --filter @memoire/validation test → PASS (1 file / 5 tests)
```

`apps/web/package.json` bertambah banyak dependency baru sekaligus (lihat diff) —
semua paket Radix yang dipakai di atas, `class-variance-authority`, `clsx`,
`tailwind-merge`, `tailwindcss-animate`, `cmdk`, `lucide-react`, `date-fns`,
`@dnd-kit/*`. `pnpm install` sudah dijalankan, lockfile sudah up to date.

---

## Cara Lanjut

1. Baca checklist sprint aktif di atas (yang paling bawah), kerjakan dari item pertama
   yang masih `[ ]`.
2. Setelah satu item selesai: update checklist ini (`[x]`), jalankan `pnpm typecheck`
   dan `pnpm test` (dan `pnpm build` untuk apps/web kalau perubahannya UI), lalu commit
   dengan pesan sesuai konvensi (`feat:`, `test:`, dst).
3. Kalau sudah semua item sprint aktif `[x]`: commit final sprint itu, lalu pindah
   status ringkas di atas ke sprint berikutnya dan mulai checklist baru berdasarkan
   seksi yang sesuai di `docs/90-roadmap.md`.
4. Kalau ada keputusan arsitektur baru yang diambil selama mengerjakan sprint,
   tambahkan entri ADR di `docs/96-decisions.md` — jangan cuma dicatat di sini.
5. **Kalau sesi berikutnya punya akses browser** (Chrome tool dimuat): sebelum menganggap
   Sprint 14 benar-benar selesai, jalankan `pnpm dev` dan coba tiap primitive baru
   (dropdown menu di sidebar/topbar, toast undo, date picker) secara visual — sprint ini
   diverifikasi lewat typecheck/test/build saja, belum lewat mata.

Jangan re-audit kode dari nol kalau file ini sudah ada dan terlihat up to date —
percayai isinya kecuali ada tanda jelas sudah basi (mis. commit baru yang tidak
tercermin di sini, atau user bilang sesuatu sudah berubah).
