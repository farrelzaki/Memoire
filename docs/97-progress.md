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
selection (dua item terberat yang sempat ditunda) dikerjakan + diverifikasi sungguhan di
sesi ini, Docker akhirnya hidup. "Paste markdown jadi blok" tetap sengaja ditunda ke
Sprint 24 (lihat alasannya di checklist detail — bukan kurang waktu, tapi memang
didokumentasikan untuk dikerjakan bareng import Markdown).
Sprint 1–12 + iterasi "app shell ala Notion" sudah selesai (commit `13a6bd5`, `2a6608c`).
Sprint 13 sudah di-commit (`f6b61d1` "sprint 13"). Sprint 14 sudah di-commit juga
(`6a4de1f` "feat: implement UI shell features, topbar navigation, and base components
library") — **kedua commit itu dibuat langsung oleh user di luar sesi ini**, bukan oleh
Claude (Claude tidak pernah memanggil `git commit` di sesi manapun sejauh ini).

Sprint 15 (kerja sesi ini + sesi sebelumnya) **belum di-commit** — masih di working tree.
Jalankan `git status` untuk lihat file yang berubah. Kalau user minta commit, pakai pesan
`feat: sprint 15 — selection toolbar, block copy actions, shortcuts cheatsheet, drag
reorder, Playwright e2e`, lalu **pindah status ringkas ini ke Sprint 16** (§16,
`docs/90-roadmap.md`) dan mulai checklist baru di bawah — jangan hapus checklist sprint
yang sudah selesai, biarkan sebagai log historis.

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
   visual Sprint 15 sampai sekarang lewat screenshot Playwright manual, bukan Chrome
   tool), coba primitive Sprint 14 langsung sebelum menganggapnya benar-benar selesai
   secara visual.
6. **Sprint 15 sudah selesai semua** (checklist di atas semua `[x]` kecuali paste-markdown
   yang memang sengaja dijadwalkan ke Sprint 24, bukan tertunda karena kehabisan waktu).
   Sesi berikutnya yang mulai kerja: pindahkan Status Ringkas di atas ke **Sprint 16 —
   Formatting & Katalog Blok A** (`docs/90-roadmap.md` §16 — link internal/eksternal,
   underline/highlight/warna, callout, toggle list, columns, table block, code block
   Shiki, KaTeX equation) dan mulai checklist baru berdasarkan daftar itu, dengan pola
   yang sama seperti Sprint 15: satu item, satu spec Playwright kalau menyentuh UI
   interaktif, jalankan sungguhan (bukan `--list`), baru centang.
7. **Kalau user minta commit** Sprint 15: pesan `feat: sprint 15 — selection toolbar,
   block copy actions, shortcuts cheatsheet, drag reorder, multi-block selection,
   Playwright e2e`. File yang relevan: `apps/web/components/keyboard-shortcuts.tsx`,
   `apps/web/features/editor/document-editor.tsx`, `apps/web/e2e/**`,
   `apps/web/playwright.config.ts`, `apps/web/package.json`, `apps/web/vitest.config.ts`,
   `package.json`, `pnpm-lock.yaml`, `.gitignore` (nambah `test-results/` dkk — artefak
   Playwright yang sebelumnya tidak di-ignore), dan file ini.
8. Pola infra + verifikasi yang terbukti jalan sesi ini, pakai lagi untuk sprint
   berikutnya: `pnpm infra:up && pnpm db:migrate && pnpm dev` di satu proses; **jangan**
   jalankan `pnpm build`/`next build` di proses lain selagi `dev` hidup (kalau terlanjur,
   `rm -rf apps/web/.next` lalu restart `pnpm dev` memperbaikinya — lihat catatan
   verifikasi Sprint 15 di atas). Tulis fitur → tulis spec Playwright baru di
   `apps/web/e2e/` → `npx playwright test` (bukan `--list`) → kalau perlu screenshot
   visual, tulis spec sementara yang panggil `page.screenshot()`, baca hasilnya lewat
   tool `Read`, lalu **hapus spec sementara itu** sebelum selesai (jangan biarkan file
   screenshot atau spec `_debug*`/`_shot*` nyasar ke commit — beberapa sempat lolos ke
   `git status` sesi ini sebelum dihapus, cek `git status --short` sebelum menganggap
   selesai).

Jangan re-audit kode dari nol kalau file ini sudah ada dan terlihat up to date —
percayai isinya kecuali ada tanda jelas sudah basi (mis. commit baru yang tidak
tercermin di sini, atau user bilang sesuatu sudah berubah).
