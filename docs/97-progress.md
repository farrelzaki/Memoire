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
**Sprint 14 — Primitif UI: selesai, semua item `[x]`** (dengan beberapa sub-bagian yang
sengaja ditunda — lihat detail Sprint 14).
**Sprint 15 — Interaksi Editor: SEMUA item `[x]`, selesai.** Drag reorder dan multi-block
selection (dua item terberat yang sempat ditunda) dikerjakan + diverifikasi sungguhan.
"Paste markdown jadi blok" tetap sengaja ditunda ke Sprint 24 (lihat alasannya di
checklist detail — bukan kurang waktu, tapi memang didokumentasikan untuk dikerjakan
bareng import Markdown).
**Sprint 16 — Formatting & Katalog Blok A: SEMUA item `[x]`, selesai.** Marks
(underline/highlight/textColor/sub/superscript), link internal+eksternal, callout,
toggle + toggle heading 1-3, table, code block Shiki, columns 2-5, KaTeX inline+block —
semuanya dikerjakan + diverifikasi sungguhan sesi ini. Lihat checklist detail untuk tiga
bug nyata yang ditemukan dan diperbaiki sepanjang jalan (bukan cuma implementasi baru).

Sprint 1–12 + iterasi "app shell ala Notion" sudah selesai (commit `13a6bd5`, `2a6608c`).
Sprint 13 di-commit (`f6b61d1`). Sprint 14 di-commit (`6a4de1f`). **Sprint 15 dan Sprint 16
sudah di-commit juga** — `bc27f80` "sprint 16" (berisi mayoritas kerja Sprint 15: drag
reorder, Playwright setup awal) dan `3b25291` "sprint 15 finished" (multi-block
selection) — **kedua commit ini dibuat langsung oleh user di luar sesi**, bukan oleh
Claude (Claude tidak pernah memanggil `git commit` di sesi manapun sejauh ini). Judul
commit-nya kebalik dari isinya (yang berjudul "sprint 16" itu isinya Sprint 15, dan
sebaliknya) — jangan bingung, itu murni penamaan user, cek `git show --stat <hash>` kalau
perlu memastikan isi commit tertentu, jangan percaya judulnya begitu saja.

**Pekerjaan Sprint 16 sesi ini (semua fitur di atas) belum di-commit** — masih di working
tree saat sesi ini berakhir. Jalankan `git status` untuk lihat file yang berubah. Kalau
user minta commit, pakai pesan `feat: sprint 16 — marks, link, callout, toggle, table,
code block Shiki, columns, KaTeX equation`, lalu **pindah status ringkas ini ke Sprint
17** (§17, `docs/90-roadmap.md`) dan mulai checklist baru di bawah — jangan hapus
checklist sprint yang sudah selesai, biarkan sebagai log historis.

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

## Sprint 15 — Checklist Detail

Sesi lanjutan (kali ini): Docker Desktop **berhasil dinyalakan** di awal sesi
(`"/c/Program Files/Docker/Docker/Docker Desktop.exe"` lalu poll `docker info` sampai
siap, ~2 menit), jadi `pnpm infra:up && pnpm db:migrate && pnpm dev` semuanya jalan
sungguhan sepanjang sesi ini — API di `localhost:3001`, web di `localhost:3000`, Postgres
+ MinIO lewat Docker Compose. Ini sesi pertama sprint ini yang benar-benar mengeksekusi
`pnpm test:e2e`, bukan cuma `--list`.

**Catatan penting untuk sesi berikutnya**: jangan jalankan `pnpm --filter @memoire/web
build` (atau `pnpm build`) sementara `pnpm dev` masih hidup di background — keduanya
sama-sama menulis ke `apps/web/.next/` dan akan saling korup, menghasilkan error dev
server `Cannot read properties of undefined (reading 'call')` / "Could not find module in
React Client Manifest" yang butuh `rm -rf apps/web/.next` + restart `pnpm dev` untuk
pulih (persis yang terjadi di sesi ini). Jalankan `build` di proses terpisah setelah
mematikan `dev`, atau jangan jalankan keduanya sama sekali dalam satu sesi verifikasi.

- [x] **Playwright disetup betulan — dan sekarang benar-benar dieksekusi.**
      `apps/web/playwright.config.ts` + `apps/web/e2e/page-lifecycle.spec.ts` (create page
      → type → reload → content remains) + `apps/web/e2e/database.spec.ts` (create
      database → add row → filter → sort → reload) — dua flow persis yang diminta §40.
      `test:e2e` ada di `apps/web/package.json` dan di root `package.json`.
      `vitest.config.ts` di-exclude `e2e/**` supaya Vitest tidak ikut memungut file
      `*.spec.ts` yang sebenarnya punya Playwright, bukan Vitest. Sesi ini menjalankan
      `npx playwright test` sungguhan (bukan `--list`) berkali-kali dan menemukan dua bug
      nyata di test-nya sendiri (bukan di aplikasi):
      - `database.spec.ts` memakai `page.locator('input').last()` untuk menargetkan input
        **value** filter — tapi tabel (yang dirender setelah filter bar di DOM) juga
        berisi `<input>` per sel, jadi `.last()` justru menimpa sel **Text** baris
        pertama, bukan mengisi filter. Diperbaiki jadi
        `page.getByPlaceholder('Value')` (`database-editor.tsx:172` sudah punya
        `placeholder="Value"`, tidak perlu ubah kode aplikasi).
      - Assertion akhir `expect(page.locator('table')).toContainText('First row')` **tidak
        akan pernah bisa lulus** — `toContainText`/`textContent` tidak melihat isi
        `<input value="...">`, karena value input bukan text node anak dari elemen. Ganti
        ke `expect(...locator('input')).toHaveValue('First row')`. (Sempat mengira ini bug
        kehilangan data row lewat reload — sudah dikonfirmasi lewat `curl` langsung ke API
        bahwa server selalu menyimpan nilainya dengan benar; murni salah pilih matcher di
        test.)
      Chromium yang di-download sesi sebelumnya juga sempat tidak stabil dengan **2+
      worker paralel** di mesin ini (kadang `net::ERR_ABORTED` pada `page.goto`, kadang
      race lain) — kalau `npx playwright test` gagal aneh tanpa perubahan kode, coba ulang
      sebelum curiga ada regresi; kadang cukup flaky karena kontensi resource lokal (lihat
      juga catatan `.next` di atas kalau baru restart dev server — compile pertama bisa
      40+ detik dan melebihi timeout default test).
- [x] **Selection toolbar** — `document-editor.tsx#SelectionToolbar`, dipasang lewat
      `BubbleMenu` resmi dari `@tiptap/react` (positioning ditangani library, bukan kode
      custom) — tombol Bold/Italic/Strike/Code, aktif-state dari `editor.isActive(...)`.
- [x] **Context menu blok — sebagian.** Blok menu yang sudah ada sebelumnya (buka lewat
      tombol handle `⋮⋮` statis, sudah ada sebelum sesi ini — bukan hasil sesi ini)
      sekarang bertambah dua item: **Copy link to block** (`${origin}/${pageId}#${blockId}`)
      dan **Copy as Markdown**, keduanya lewat `BlockTypeRegistry.toMarkdown` dari Sprint
      13. "Turn into", "Duplicate", "Move to" versi blok (bukan versi page) sudah ada dari
      sebelumnya juga. **Belum**: "Move to" versi blok (pindah blok ke halaman lain) —
      tidak ada di kode lama maupun ditambahkan sesi ini.
- [x] **Input rule markdown lengkap — sudah tercakup, tidak perlu kode baru.** Dicek
      langsung ke source `node_modules`: `TaskItem` (`@tiptap/extension-task-item`) sudah
      punya `wrappingInputRule` bawaan untuk `[]`/`[x]`; heading/list/blockquote/codeBlock/
      hr datang dari `StarterKit` yang juga sudah menyertakan input rule-nya
      masing-masing. Yang **belum ada** cuma `==highlight==` dan `$equation$` — itu
      nunggu ekstensi Highlight/KaTeX yang belum terpasang (Sprint 16, "Formatting").
- [x] **Keyboard shortcut cheatsheet dialog** — `components/keyboard-shortcuts.tsx`
      ditulis ulang: `?` (di luar input/textarea/contenteditable, supaya tidak
      membajak karakter `?` biasa) membuka `Dialog` berisi daftar shortcut. Shortcut
      editor yang didaftarkan di situ (Mod-B, Mod-I, Mod-Shift-S, Mod-E) diverifikasi ke
      source `@tiptap/extension-{bold,italic,strike,code}` langsung, bukan ditebak dari
      ingatan — strike itu `Mod-Shift-S`, **bukan** `Mod-Shift-X` seperti dugaan awal.
- [x] **Hover block handle + drag reorder via native ProseMirror + drop cursor.**
      Dikerjakan dan diverifikasi sungguhan sesi ini (Docker akhirnya hidup). Implementasi
      di `document-editor.tsx`:
      - Handle `⋮⋮` (elemen di luar DOM ProseMirror, sudah ada dari sebelumnya) sekarang
        `draggable`, dengan `onDragStart` menyimpan posisi blok sumber ke
        `dragSourcePosRef` (ref biasa, bukan `useState` — closure `editorProps` dibuat
        sekali saat `useEditor` mount, jadi kalau pakai state akan membaca nilai basi;
        ref selalu terbaru).
      - `editorProps.handleDOMEvents.dragover` (baru) memanggil helper `blockPosAtCoords`
        (posisi top-level block terdekat dari titik kursor, lewat `view.posAtCoords` +
        `$pos.before(1)`) untuk menggambar garis indikator drop (`dropIndicatorTop` state,
        div biru fixed-position, style sama dengan handle — `top` dari `coordsAtPos`,
        `left`/`width` dari bounding rect `editor.view.dom`).
      - `editorProps.handleDrop` (sudah ada untuk file gambar sebelumnya) sekarang cek
        `dragSourcePosRef` dulu: kalau ada drag blok aktif, panggil `moveBlock` (helper
        baru) alih-alih fallback ke logic upload gambar.
      - `moveBlock(view, sourcePos, targetPos)`: **native ProseMirror move** — satu
        `Transaction`, `tr.delete(sourcePos, sourcePos + node.nodeSize)` lalu
        `tr.insert(tr.mapping.map(targetPos), node)`. Posisi target di-remap lewat
        `tr.mapping` karena delete di atas menggeser semua posisi setelahnya — **tanpa**
        remap ini, insert akan mendarat di tempat yang salah kalau target ada setelah
        source di dokumen. Menolak no-op kalau target jatuh di dalam rentang source
        sendiri (drop ke diri sendiri).
      - **dnd-kit sengaja tidak dipakai** — drag murni HTML5 native dari elemen di luar
        DOM contentEditable, persis pola yang diwajibkan §CLAUDE.md/ADR-11.
      - Test: `apps/web/e2e/block-drag-reorder.spec.ts` — ketik 3 paragraf, drag blok
        pertama ke bawah blok ketiga, konfirmasi urutan DOM berubah, **reload**, konfirmasi
        urutan bertahan (round-trip lewat `replaceBlocks` autosave 800ms yang sudah ada).
        **Catatan teknis penting**: `locator.dragTo()` bawaan Playwright **tidak
        memicu event `dragstart` sama sekali** di Chromium headless untuk elemen ini
        (dikonfirmasi manual — nol event drag apa pun, baik lewat `dragTo()` maupun
        `page.mouse.down/move/up` manual). Ini keterbatasan Playwright/Chromium yang
        dikenal untuk native HTML5 drag-and-drop, bukan bug di kode aplikasi. Test
        menggunakan `page.evaluate()` untuk dispatch `DragEvent` (`dragstart`/
        `dragover`/`drop`/`dragend`) manual dengan `DataTransfer` asli — ini memicu
        code path React/ProseMirror yang **sama persis** dengan drag sungguhan
        (`onDragStart` React lewat `dispatchEvent`, `editorProps.handleDOMEvents`/
        `handleDrop` lewat listener asli ProseMirror di DOM), jadi tetap pengujian
        end-to-end yang valid — cuma cara memicunya yang disintesis, bukan behavior
        yang diuji. Kalau menulis test drag-and-drop native lain di masa depan, pakai
        pola yang sama, jangan coba `dragTo()` dulu (sudah terbukti tidak bekerja di
        mesin ini).
      - Diverifikasi visual juga lewat screenshot Playwright manual (dihapus setelah
        dicek) — garis indikator biru muncul tepat di bawah blok target saat drag aktif.
- [x] **Multi-block selection + aksi massal.** Dikerjakan sesi ini (Docker hidup,
      lanjutan langsung setelah drag reorder). Desain yang dipilih **bukan** shift-klik
      atau lasso di atas teks — itu akan bentrok dengan seleksi teks native ProseMirror
      yang sudah ada. Sebagai gantinya: **gutter drag-select**, strip 32px di sebelah kiri
      konten editor, sepenuhnya di luar DOM ProseMirror (persis pola handle drag-reorder
      — §CLAUDE.md/ADR-11, bukan dnd-kit, bukan decoration plugin ProseMirror). Implementasi
      di `document-editor.tsx`:
      - `blocksInRange(doc, from, to)` (helper baru) — semua top-level block yang posisi
        awalnya jatuh dalam rentang `[min(from,to), max(from,to)]`, lewat `doc.forEach`.
      - State `multiSelect: { from: number; to: number } | null`. Div gutter
        (`data-testid="selection-gutter"`, fixed, di kiri `editor.view.dom`) menangani
        `onMouseDown` murni native (bukan dnd-kit): set anchor lewat `blockPosAtCoords`
        (helper yang sama dipakai drop indicator drag-reorder), lalu pasang listener
        `mousemove`/`mouseup` di `window` untuk mengupdate `multiSelect.to` selama drag,
        lepas listener saat `mouseup` (tapi seleksi **tetap ada** setelah mouse up sampai
        di-clear).
      - `multiSelect` di-clear di tiga tempat: `onSelectionUpdate` (klik ke teks asli
        artinya user keluar dari mode multi-select), keydown `Escape` (listener baru,
        pola sama seperti listener existing di `SlashMenu`), dan setelah aksi
        delete/copy dijalankan.
      - Highlight: satu overlay `fixed` (bukan per-blok) dari atas blok pertama sampai
        bawah blok terakhir dalam rentang — posisinya dari `editor.view.nodeDOM(pos)`
        `.getBoundingClientRect()` per blok pertama/terakhir, bukan `coordsAtPos` (yang
        cuma memberi posisi satu baris teks, salah untuk blok multi-baris seperti
        paragraf panjang atau code block).
      - Toolbar aksi massal (fixed, style sama dengan `SelectionToolbar`/`BlockHandle`)
        menampilkan jumlah blok terpilih + tombol **Delete** dan **Copy as Markdown**.
        Diposisikan di atas blok pertama, tapi **flip ke bawah blok terakhir** kalau tidak
        ada ruang di atas (mis. blok pertama yang terpilih ada tepat di bawah judul
        halaman) — dicek lewat perbandingan sederhana, bukan collision detection penuh.
      - `deleteMultiSelect`: satu transaksi `tr.delete(firstBlock.pos, lastBlock.pos +
        lastBlock.node.nodeSize)` — hapus seluruh rentang sekaligus, bukan loop
        delete per-blok (yang akan salah karena posisi bergeser setiap delete).
      - `copyMultiSelectMarkdown` (juga menuntaskan item "Copy blok sebagai markdown
        untuk multi-block selection" di bawah — satu implementasi, dua item checklist):
        map tiap blok terpilih lewat `BlockTypeRegistry.get(node.type.name)?.toMarkdown`,
        gabung dengan `\n\n`, tulis ke clipboard, toast.
      - Test: `apps/web/e2e/block-multiselect.spec.ts` — drag-select 2 dari 3 blok lewat
        gutter (mouse.down/move/up biasa, **bukan** native HTML5 `dragstart` — drag mouse
        biasa ini justru bekerja normal di Playwright, beda dari kasus `draggable=true` di
        `block-drag-reorder.spec.ts`), verifikasi toolbar "2 blocks" muncul, copy-as-markdown
        lalu baca clipboard sungguhan (`test.use({ permissions: [...] })` + evaluasi
        `navigator.clipboard.readText()` — clipboard Windows menormalkan line ending ke
        CRLF, assertion men-strip itu dulu), lalu delete + reload untuk konfirmasi
        persistence. Diverifikasi visual juga lewat screenshot manual (dihapus setelah
        dicek) — overlay biru menutupi ketiga blok, toolbar muncul tepat di atasnya dengan
        label jumlah blok yang benar.
- [x] **Copy blok sebagai markdown untuk multi-block selection.** Selesai sebagai bagian
      dari item di atas (`copyMultiSelectMarkdown`) — bukan implementasi terpisah.
- [ ] **"Paste markdown jadi blok".** **Sengaja ditunda ke Sprint 24 (Import/Export).**
      §12A.5 di `docs/12-editor-blocks.md` eksplisit bilang paste markdown "memakai
      parser yang sama dengan import Markdown (§30A)" — parser itu belum ada sama sekali
      (belum ada dependency Markdown apa pun di `apps/web`). Membangunnya sekarang berarti
      dua kali kerja: sekali versi minimal untuk paste, sekali lagi versi lengkap untuk
      import/export nanti. Lebih murah menunggu dan membangun satu parser yang dipakai
      keduanya sekaligus, persis seperti yang didokumentasikan.

### Verifikasi terakhir (state Sprint 15, sesi lanjutan — Docker hidup)

```
pnpm typecheck                    → PASS (packages/validation, apps/api, apps/web)
pnpm --filter @memoire/web test   → PASS (17 files / 97 tests)
pnpm --filter @memoire/api test   → PASS (14 files / 62 tests)
pnpm --filter @memoire/web build  → PASS. Dijalankan dua kali sesi ini: pertama sambil
                                     `pnpm dev` masih hidup (memicu korupsi `.next` yang
                                     dicatat di atas — build itu sendiri tetap PASS, cuma
                                     dev server-nya yang rusak sampai `rm -rf
                                     apps/web/.next` + restart); kedua kalinya SETELAH
                                     mematikan `pnpm dev` dulu (`taskkill /T /F` pada PID
                                     proses `next dev`/`nest start`), yang merupakan
                                     urutan yang benar — lakukan begini di sesi
                                     berikutnya, bukan urutan pertama.
npx playwright test (apps/web)    → PASS sungguhan, 4/4 spec, dijalankan berkali-kali di
                                     sesi ini (termasuk setelah build+restart dev server
                                     di atas) untuk cek stabilitas — bukan cuma --list:
                                     page-lifecycle.spec.ts, database.spec.ts (2 bug test
                                     diperbaiki, lihat item Playwright di atas),
                                     block-drag-reorder.spec.ts, block-multiselect.spec.ts
                                     (dua terakhir baru sesi ini).
```

`apps/web/package.json` nambah `@playwright/test` (devDependency) + script `test:e2e`.
Root `package.json` nambah script `test:e2e` yang mendelegasikan ke situ. Chromium sudah
ter-download ke `%LOCALAPPDATA%\ms-playwright` — sesi berikutnya tidak perlu install ulang
kecuali environment-nya beda mesin.

Beberapa page/database sisa dari eksperimen `curl` manual sesi ini (mis. "E2E Debug DB",
beberapa "Untitled") masih ada di database lokal — sampah data dev biasa, bukan bug,
aman dihapus lewat UI kalau mengganggu.

---

## Sprint 16 — Checklist Detail

Semua item roadmap §16 (`docs/90-roadmap.md`) selesai dan diverifikasi sungguhan lewat
Docker + `pnpm dev` + Playwright — bukan cuma typecheck/test. Tiga bug **nyata** ditemukan
dan diperbaiki sepanjang sesi ini (bukan di aplikasi yang sudah ada — di kode yang baru
ditulis sesi ini sendiri, terungkap justru karena setiap fitur langsung dites hidup,
bukan dipercaya dari baca kode saja). Dicatat detail di bawah karena polanya kemungkinan
terulang di sprint-sprint blok baru berikutnya.

- [x] **Marks: underline, highlight, textColor, subscript, superscript.**
      `@tiptap/extension-{underline,highlight,text-style,color,subscript,superscript}`
      terpasang di `document-editor.tsx`. `Highlight.configure({ multicolor: true })`
      dan `Color` sama-sama menyimpan nilai `hsl(var(--mark-fg-red))`/
      `hsl(var(--mark-bg-yellow))` sebagai attrs mark — **bukan hex bebas** — token
      barunya didefinisikan di `app/globals.css` (`--mark-fg-*`/`--mark-bg-*`, 8 warna ×
      light/dark) dan didaftarkan di `features/editor/mark-colors.ts`
      (`MARK_COLORS`). Karena nilainya literal `hsl(var(--...))`, warna otomatis
      menyesuaikan saat ganti tema tanpa kode tambahan apa pun — persis alasan §12A.1
      melarang hex bebas.
      Toolbar seleksi (`SelectionToolbar`) bertambah tombol Underline, Subscript,
      Superscript, dan dua dropdown swatch (`ColorSwatchMenu`) untuk text color/highlight.
      `==highlight==` sebagai input rule **sudah otomatis ada** — bawaan
      `@tiptap/extension-highlight`, tidak perlu kode custom (dicek langsung ke source,
      pola yang sama seperti verifikasi shortcut Sprint 15).
      Serializer: `inlineToHtml`/`inlineToMarkdown` di `block-type-registry.ts` menangani
      kelimanya. Markdown cuma punya syntax untuk highlight (`==x==`) — underline/
      subscript/superscript/textColor tidak punya padanan Markdown polos (§12A.5 memang
      tidak mendaftarkan syntax untuk itu), teksnya tetap round-trip, cuma formatnya
      hilang di ekspor Markdown.
      Test: `apps/web/e2e/editor-marks-and-links.spec.ts` (mark pertama) + unit test baru
      di `block-type-registry.spec.ts`.
- [x] **Link internal + eksternal.** `@tiptap/extension-link` dengan
      `openOnClick: false` — klik ditangani sendiri lewat `editorProps.handleClick`:
      href berawalan `/` (internal) di-`router.push()` (navigasi client-side, bukan hard
      reload), selain itu `window.open(href, '_blank', 'noopener,noreferrer')`.
      `LinkMenu` (popover baru di `SelectionToolbar`) menerima input teks: kalau berbentuk
      URL (`^https?:\/\/`) jadi tautan eksternal; kalau tidak, jadi pencarian judul
      halaman langsung dari cache query `['pages']` yang sudah ada (tidak fetch baru),
      hasilnya bisa diklik untuk jadi tautan internal (`setLink({ href: '/{pageId}',
      target: null })` — `target: null` eksplisit meng-override default `_blank` dari
      opsi extension supaya link internal buka di tab yang sama).
      Bookmark preview (§12A.2, tiga pilihan "biarkan teks / jadi tautan / jadi bookmark")
      **sengaja tidak dikerjakan** — bookmark block sendiri belum ada (item Sprint 17),
      jadi pilihan ketiganya belum punya tujuan. Link plain sudah cukup untuk sprint ini.
      Test: `editor-marks-and-links.spec.ts` (test kedua) — external buka tab baru,
      internal navigasi via router tanpa hard reload.
- [x] **Callout, toggle, toggle heading 1-3.** Tiga node Tiptap baru, semuanya custom
      NodeView (`ReactNodeViewRenderer`), pola yang sama dengan `MermaidBlock` dari sesi
      sebelumnya:
      - `features/editor/callout-node.tsx` — `content: 'block+'`, attrs `icon` (default
        💡). Ikon bisa diklik untuk ganti — pakai ulang `EmojiPicker` yang sudah ada
        (`features/shell/emoji-picker.tsx`, dipakai juga untuk ikon halaman), bukan
        membangun picker baru.
      - `features/editor/toggle-node.tsx` — satu node `toggle` menutupi baik "Toggle"
        polos maupun "Toggle heading 1-3" lewat attrs `headingLevel: null | 1 | 2 | 3`
        (pola yang sama seperti node `heading` bawaan yang satu node + attrs `level`,
        bukan tiga node terpisah). Fold state (§12B.5) di localStorage berkunci
        `blockId`, **bukan** di `blocks.content` — lihat `foldKey`/`readOpen`/`writeOpen`.
        **Toggle baru default TERBUKA**, bukan tertutup — kalau default tertutup, CSS
        `display: none` pada child yang baru saja dibuat (belum sempat diisi) membuat
        browser mengalihkan ketikan pengguna ke node lain yang masih terlihat, jadi teks
        yang diketik hilang tanpa pesan error apa pun. Ditemukan lewat e2e, bukan lewat
        baca kode.
      - Kedua node ini awalnya pakai `content: 'paragraph block*'` (mengunci child
        pertama sebagai paragraph secara skema) — **ternyata itu mematikan Enter-untuk-
        split ProseMirror di dalam node** (Enter tidak melakukan apa pun, tanpa error).
        Diganti ke `content: 'block+'` polos (sama seperti Callout, yang memang terbukti
        split dengan benar) — "child pertama = summary" sekarang aturan tampilan/CSS,
        bukan skema.
      - CSS fold: `.toggle-content-closed > * > *:not(:first-child) { display: none; }`
        di `globals.css` — perhatikan `> * >` (dua level), bukan `>` satu level, karena
        `NodeViewContent` (Tiptap/React) menyisipkan div wrapper sendiri di antara
        `.toggle-content` dan child sungguhan. Kalau fold berhenti bekerja lagi di masa
        depan, cek dulu apakah strukturnya berubah sebelum curiga ke tempat lain.
      - Slash command: "Callout", "Toggle list", "Toggle heading 1/2/3" — lima entri baru
        di `items` (array manual di `document-editor.tsx`, bukan baca dari
        `BlockTypeRegistry` — pola lama dari Sprint 13/15 belum berubah).
      - `BlockTypeRegistry` entri `callout` dan `toggle` (toHtml/toMarkdown/toPlainText).
        Toggle markdown: baris pertama `#`×headingLevel + summary, baris berikutnya isi
        apa adanya (tidak ada syntax Markdown asli untuk collapsible content).
      - Test: `apps/web/e2e/callout-and-toggle.spec.ts` — ganti ikon (dan
        cek fokus balik ke editor setelahnya — lihat bug icon-picker-focus di bawah),
        fold/unfold, reload (isi tetap ada di server meski folded, fold state sendiri
        dari localStorage).
      - **Bug ditemukan+diperbaiki**: memilih ikon callout dari `EmojiPicker` (elemen di
        luar `contentEditable`) membuat fokus browser lepas dari editor — ketikan
        berikutnya hilang begitu saja, sama seperti pola bug toggle-fold di atas tapi
        akar masalah beda (fokus DOM, bukan CSS `display:none`). Diperbaiki dengan
        `editor.chain().focus(posDiDalamNode).run()` eksplisit setelah pilih/hapus ikon
        (`refocusContent()` di `callout-node.tsx`).
- [x] **Table.** `@tiptap/extension-table` (+ `-row`/`-header`/`-cell`),
      `Table.configure({ resizable: true })`. Slash command "Table" masukkan 3×3 dengan
      header row. `TableToolbar` (komponen baru di `document-editor.tsx`, style sama
      dengan `BlockHandle`/`SelectionToolbar`) muncul fixed di atas tabel yang sedang
      diedit — dicari lewat `getTableHandle` (jalan ke atas dari selection nyari node
      `table`, ambil rect DOM-nya langsung lewat `editor.view.nodeDOM`, bukan
      `coordsAtPos` yang cuma tahu satu titik teks). Isinya tombol native
      `addRowBefore/After`, `deleteRow`, `addColumnBefore/After`, `deleteColumn`,
      `toggleHeaderRow`, `deleteTable` — semuanya command bawaan extension-table, tidak
      ada logic edit-tabel custom.
      CSS resize handle + selected-cell overlay standar dari dokumentasi
      `@tiptap/extension-table` ditambahkan ke `globals.css`.
      `BlockTypeRegistry` entri `table`/`tableRow`/`tableHeader`/`tableCell` — markdown
      jadi tabel GFM asli (`| a | b |` + baris `---`), baris pertama dianggap header.
      Test: `apps/web/e2e/table-block.spec.ts`.
- [x] **Code block: Shiki, pemilih bahasa, salin, wrap.** Dua file baru, sengaja
      dipisah karena dua mekanisme berbeda:
      - `features/editor/code-block-node.tsx` — `CodeBlockShiki` (extend
        `@tiptap/extension-code-block`, **bukan** StarterKit punya — StarterKit
        di-`configure({ codeBlock: false })` supaya tidak dobel), NodeView dengan header
        (`<select>` bahasa dari daftar kurasi `CODE_BLOCK_LANGUAGES`, tombol Copy, tombol
        Wrap — wrap state lokal per instance, sengaja tidak disimpan ke mana pun, murni
        preferensi tampilan sementara).
      - `features/editor/code-block-highlight.ts` — `CodeBlockHighlight`, **plugin
        ProseMirror decoration terpisah**, bukan bagian dari NodeView di atas. Ini
        keputusan desain yang sengaja: NodeView di atas TIDAK mengganti `contentDOM` node
        (tetap `<code>` biasa yang dikelola ProseMirror penuh, teks polos), supaya
        ekstraksi teks (`node.textContent`, dipakai `toPlainText`/tombol Copy/autosave)
        tetap akurat tanpa perlu strip HTML styling. Warna syntax datang murni dari
        `Decoration.inline` yang dihitung async lewat `codeToTokensBase` (Shiki,
        lazy-load grammar per bahasa, di-cache Shiki sendiri setelah pemakaian pertama).
        Plugin ini juga pasang `MutationObserver` pada `document.documentElement` untuk
        recompute warna saat tema gelap/terang berganti (tema dibaca dari class `.dark`
        di `<html>`, bukan state React — lihat `app/providers.tsx`).
      - Font/CSS KaTeX **tidak relevan di sini** (itu item equation) — code block tidak
        butuh aset self-hosted, Shiki menghasilkan warna inline lewat JS murni.
      - Test: `apps/web/e2e/code-block.spec.ts` — pilih bahasa, tunggu span berwarna
        muncul (async), copy ke clipboard sungguhan, toggle wrap, reload (bahasa +
        warna + isi semuanya harus tetap ada).
- [x] **Columns 2-5, lebar bisa digeser.** `features/editor/columns-node.tsx` — dua node:
      `Columns` (`content: 'column{2,5}'`, skema ProseMirror sendiri yang menegakkan
      batas 2-5, bukan validasi manual) dan `Column` (`content: 'block+'`, attrs `width`
      persen, NodeView dengan handle resize di tepi kanan).
      Resize: drag mengubah `width` kolom yang di-drag DAN kolom tetangga kanannya
      sekaligus (jumlah keduanya tetap konstan — geser kanan tidak pernah membuat total
      lebar row melebihi 100% atau bolong), lewat `tr.setNodeAttribute` pada posisi kedua
      node (`getPos()` dari kolom yang di-drag = posisi awalnya sendiri; `getPos() +
      node.nodeSize` = posisi awal kolom berikutnya — tidak perlu jalan-jalan/hitung
      manual dari parent).
      **Bug ditemukan+diperbaiki (penting untuk NodeView lain di masa depan)**:
      `ReactNodeViewRenderer` membungkus DOM yang dirender NodeView-mu di dalam elemen
      pembungkus TAMBAHAN (`<div class="react-renderer node-{nama}">`) yang **kamu tidak
      kontrol stylingnya**. Kalau NodeView butuh berpartisipasi dalam flex/grid parent
      (seperti kolom di sini, butuh `flex: 0 0 {width}%`), styling itu HARUS ditaruh di
      elemen yang KAMU render sendiri (`NodeViewWrapper`), tapi pembungkus tambahan itu
      jadi actual flex ITEM-nya, bukan punyamu — akibatnya semua kolom render lebar 0
      sampai ditemukan lewat inspeksi `getComputedStyle` manual. Perbaikannya:
      `.ProseMirror .node-column { display: contents; }` di `globals.css` — bikin
      pembungkus tambahan itu "transparan" secara layout, supaya `NodeViewWrapper` jadi
      flex item sungguhan. **Kalau bikin NodeView baru yang perlu berpartisipasi dalam
      flex/grid parent (bukan cuma block biasa), cek pola ini duluan.**
      `BlockTypeRegistry` entri `columns`/`column` — tidak ada padanan Markdown untuk
      layout sisi-berdampingan, isi tiap kolom tetap ter-ekspor berurutan (bukan
      sisi-berdampingan lagi).
      Test: `apps/web/e2e/columns-block.spec.ts` — insert 3 kolom, ketik di dua di
      antaranya, drag resize, verifikasi lebar BENAR-BENAR berubah (bukan cuma DOM attrs)
      lewat `boundingBox()`, reload.
- [x] **KaTeX: equation block + inline equation, font self-hosted.**
      `features/editor/equation-node.tsx` — dua node: `Equation` (block, `atom: true`)
      dan `InlineEquation` (`group: 'inline', inline: true, atom: true` — **node atom,
      bukan mark**, sesuai §12A.1 eksplisit bilang begitu karena persamaan bukan gaya
      yang diterapkan ke teks yang sudah ada, melainkan menggantikan `$...$` yang
      diketik). Klik untuk edit (textarea/input LaTeX inline), `katex.renderToString`
      dengan `throwOnError: false` — LaTeX tidak valid tampil sebagai teks source polos,
      bukan crash.
      Font + CSS KaTeX **di-copy manual ke `apps/web/public/katex/`** (dari
      `node_modules/katex/dist/{katex.min.css,fonts/}`) — bukan CDN, bukan import lewat
      bundler Next (yang akan mem-bundle fontnya ke `.next/static`, bukan `public/`
      sesuai instruksi eksplisit roadmap "font disalin ke public/"). Dimuat lewat
      `<link rel="stylesheet" href="/katex/katex.min.css">` di `app/layout.tsx`.
      **Bug ditemukan+diperbaiki (serius — sempat membuat SEMUA test flaky)**: `<link>`
      itu awalnya ditaruh sebagai anak langsung `<html>` (sebelum `<body>`) — HTML tidak
      valid, bikin React/Next 15 App Router melempar hydration-mismatch dan menampilkan
      overlay dev (`<nextjs-portal>`) yang **menutupi seluruh halaman dan mem-block semua
      klik** sesudahnya, di SETIAP page load. Ini yang bikin serangkaian test flaky/gagal
      acak sepanjang bagian akhir sesi sampai akhirnya ditelusuri lewat pembacaan
      `console error` event, bukan dari log server (error-nya cuma muncul di console
      browser, bukan terminal `pnpm dev`). Perbaikannya: bungkus `<link>` itu di dalam
      `<head>` eksplisit. **Kalau e2e tiba-tiba flaky luas tanpa perubahan logika yang
      jelas terkait, cek console error browser dulu (bukan cuma log server) — overlay dev
      Next bisa jadi baru muncul dari perubahan tak terduga di `layout.tsx`/root markup.**
      Input rule `$x$` (§12A.5) — **bukan** `nodeInputRule` bawaan Tiptap (helper itu
      cuma mengganti *captured group*-nya saja, dirancang untuk rule seperti `@mention`
      yang satu karakter terakhirnya sebagai trigger — dipakai apa adanya, hasilnya dua
      tanda `$` tertinggal sebagai teks literal di kedua sisi node, ketauan lewat e2e).
      Diganti `InputRule` custom dengan `tr.replaceWith(range.from, range.to, node)` yang
      makan seluruh rentang match, termasuk kedua delimiter.
      `BlockTypeRegistry` entri `equation` + `inlineToHtml`/`inlineToMarkdown`/
      `inlineToPlainText` di `block-type-registry.ts` diperluas menangani node
      `inlineEquation` (sebelumnya cuma tahu `text`/`hardBreak`) — markdown `$latex$`,
      html `<span data-type="inline-equation">$latex$</span>` (sumber mentah, bukan HTML
      KaTeX yang sudah dirender — konsisten dengan pola mermaid yang juga ekspor source,
      bukan SVG-nya).
      Test: `apps/web/e2e/equation-block.spec.ts` — block via slash menu, inline via
      input rule (assert eksplisit tidak ada `$` tersisa di teks paragraf), keduanya
      reload dengan KaTeX ter-render ulang dan `annotation` (sumber LaTeX asli tersimpan
      di markup KaTeX) cocok.

### Verifikasi terakhir (state Sprint 16)

```
pnpm typecheck                    → PASS (packages/validation, apps/api, apps/web)
pnpm --filter @memoire/web test   → PASS (17 files / 110 tests)
pnpm --filter @memoire/web build  → PASS (dijalankan setelah mematikan pnpm dev — urutan
                                     yang benar, lihat catatan Sprint 15). Satu warning
                                     ESLint non-blocking: @next/next/no-css-tags pada
                                     <link> KaTeX di layout.tsx — itu memang cara yang
                                     benar untuk stylesheet self-hosted dari public/,
                                     bukan sesuatu yang perlu diperbaiki.
npx playwright test (apps/web)    → PASS sungguhan, 13/13 spec, dijalankan berkali-kali
                                     untuk cek stabilitas. 6 spec baru sesi ini:
                                     editor-marks-and-links.spec.ts, callout-and-
                                     toggle.spec.ts, table-block.spec.ts, code-
                                     block.spec.ts, columns-block.spec.ts, equation-
                                     block.spec.ts.
```

Sesi ini juga menemukan (dan memulihkan dari) satu insiden infra: API (`nest start
--watch`) sempat mati total di tengah sesi setelah percobaan `taskkill` yang gagal
sebagian meninggalkan proses dalam keadaan tidak konsisten (port 3001 berhenti listening,
tidak ada error di log, `curl` langsung connection-refused). Gejalanya di Playwright:
`getByTitle('New page').click()` timeout karena sidebar menampilkan "No pages yet."
(fetch ke API yang mati). **Kalau ini terjadi lagi**: `netstat -ano | grep :3001` untuk
konfirmasi port benar-benar tidak listening (bukan cuma lambat), lalu `taskkill /PID
<pid-cmd.exe-nest> /T /F` pada proses yang benar (cek dengan `Get-CimInstance
Win32_Process ... Select ProcessId, CommandLine`, bukan asumsi PID lama masih valid),
lalu `pnpm dev` ulang dari awal — jangan coba "perbaiki" proses yang sudah setengah mati.

Package baru: `@tiptap/extension-{underline,highlight,text-style,color,subscript,
superscript,link,table,table-row,table-header,table-cell,code-block}`, `shiki`, `katex`
— semuanya versi `^2.10.0` untuk paket `@tiptap/*` (menyesuaikan versi core yang sudah
terpasang), bukan versi 3.x terbaru yang tersedia di registry.

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
5. **Sprint 14 masih belum pernah dicoba lewat mata/browser sungguhan** (dropdown menu,
   toast undo, date picker) — baru lewat typecheck/test/build. Docker sekarang sudah bisa
   dinyalakan di mesin ini (`"/c/Program Files/Docker/Docker/Docker Desktop.exe"`, tunggu
   `docker info` sukses, ~2 menit), jadi kalau sesi berikutnya punya browser tool
   (`mcp__claude-in-chrome__*` — belum pernah tersedia sejauh ini; semua verifikasi
   visual Sprint 15/16 sampai sekarang lewat Playwright + inspeksi HTML manual, bukan
   Chrome tool), coba primitive Sprint 14 langsung sebelum menganggapnya benar-benar
   selesai secara visual.
6. **Sprint 15 dan Sprint 16 sudah selesai semua** (checklist masing-masing di atas
   semua `[x]`, kecuali paste-markdown Sprint 15 yang memang sengaja dijadwalkan ke
   Sprint 24). Sesi berikutnya yang mulai kerja: pindahkan Status Ringkas di atas ke
   **Sprint 17 — Katalog Blok B & Fitur Halaman** (`docs/90-roadmap.md` §17 — sub-page
   block, link-to-page block, breadcrumb, table of contents, synced block, file/video/
   audio/PDF block, bookmark block dengan pratinjau server-side, embed ber-sandbox, image
   resize/align/caption, `pages.settings`, backlinks, cover reposition) dan mulai
   checklist baru berdasarkan daftar itu.
   **Perhatian khusus untuk bookmark block** (§29A.1, sudah disinggung juga di
   CLAUDE.md): pratinjau URL WAJIB diambil dari sisi server (NestJS) dengan penjaga SSRF
   (tolak loopback/IP privat/skema non-http, timeout, batas ukuran) — kalau browser yang
   menembak langsung, setiap situs yang pernah ditempel tahu IP pengguna. Ada tes wajib
   untuk penjaga SSRF-nya juga, jangan dilewati.
7. Pola kerja yang terbukti jalan sepanjang Sprint 15-16, pakai lagi: satu item
   checklist → tulis kode → tulis spec Playwright baru di `apps/web/e2e/` →
   `npx playwright test` (bukan `--list`) sampai lulus stabil (jalankan 2-3× kalau ragu,
   mesin ini kadang flaky karena kontensi resource lokal, bukan berarti kode salah) →
   baru centang `[x]`. Kalau perlu screenshot visual, tulis spec sementara yang panggil
   `page.screenshot()`, baca hasilnya lewat tool `Read`, lalu **hapus spec sementara itu**
   sebelum selesai — cek `git status --short` sebelum menganggap satu item selesai supaya
   file `_debug*`/`_shot*` tidak nyasar ke commit.
8. Pola infra, pakai lagi: `pnpm infra:up && pnpm db:migrate && pnpm dev` di satu proses;
   **jangan** jalankan `pnpm build`/`next build` di proses lain selagi `dev` hidup (kalau
   terlanjur, `rm -rf apps/web/.next` lalu restart `pnpm dev` memperbaikinya). Kalau API
   tiba-tiba connection-refused tanpa error di log (`nest start --watch` mati diam-diam),
   lihat catatan insiden di akhir bagian Verifikasi Sprint 16 di atas — jangan asumsikan
   proses lama masih valid, cek ulang PID-nya dulu.
9. **Kalau e2e tiba-tiba flaky luas** (banyak spec gagal bersamaan dengan pesan yang tidak
   berhubungan satu sama lain) padahal perubahan kodenya kecil dan spesifik: cek
   `page.on('console', ...)`/`pageerror` dulu, bukan cuma log terminal `pnpm dev` — ada
   kasus nyata sesi ini di mana root cause-nya (hydration error dari `<link>` yang salah
   tempat di `layout.tsx`) cuma muncul di console browser, sama sekali tidak tercatat di
   log server manapun.
10. **Kalau bikin NodeView baru** (custom Tiptap node lewat `ReactNodeViewRenderer`) yang
    perlu berpartisipasi dalam flex/grid parent (bukan sekadar block biasa yang ditumpuk
    vertikal): ingat `ReactNodeViewRenderer` membungkus DOM-mu dalam elemen
    `.react-renderer.node-{nama}` yang kamu tidak kontrol stylingnya — styling
    flex/grid-mu sendiri di `NodeViewWrapper` tidak akan berefek kecuali pembungkus
    tambahan itu di-`display: contents` dulu (lihat solusi `columns-node.tsx` /
    `.node-column` di `globals.css` untuk contoh konkretnya).

Jangan re-audit kode dari nol kalau file ini sudah ada dan terlihat up to date —
percayai isinya kecuali ada tanda jelas sudah basi (mis. commit baru yang tidak
tercermin di sini, atau user bilang sesuatu sudah berubah).
