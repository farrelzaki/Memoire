> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §72

---

# 72. Architecture Decision Log

Satu entri per keputusan yang tidak jelas dengan sendirinya. Tujuannya bukan mendokumentasikan apa
yang dibangun — itu tugas seksi lain — melainkan mencatat **kenapa alternatif yang terlihat lebih
wajar ditolak**, supaya tidak dibongkar ulang enam bulan lagi.

---

## ADR-01 — Id blok tinggal di dokumen, blok bersarang tidak dinormalkan

**Konteks.** Penyimpanan blok saat ini menghapus semua baris lalu menyisipkannya kembali, sehingga
id lahir baru setiap autosave. Synced block, backlink, anchor pencarian, diff versi, dan reminder
per-blok semuanya butuh id yang stabil.

**Keputusan.** Id disimpan sebagai atribut node di dalam dokumen Tiptap dan di-upsert ke basis data
berdasarkan id. Blok bersarang (kolom, toggle, sel tabel) tetap berada di dalam JSON node
level-atas; `blocks.parent_block_id` dinyatakan permanen NULL, dan pengalamatan blok bersarang
memakai `descendant_ids uuid[]` + GIN index.

**Alternatif yang ditolak.** Menormalkan setiap blok bersarang menjadi baris ber-`parent_block_id`.
Itu menciptakan sumber kebenaran kedua yang bertengkar dengan model dokumen ProseMirror dan
mengubah autosave menjadi diff pohon — jauh lebih rumit, untuk keuntungan yang hanya terasa pada
granularitas "baris yang mana".

**Konsekuensi.** Halaman berkolom menjadi satu baris `blocks` besar; granularitas kasar, tapi
kemampuan mengalamati tetap utuh. Butuh migrasi backfill sekali, kalau tidak setiap halaman lama
kehilangan identitas bloknya pada penyimpanan pertama setelah upgrade.

Lihat §11E.

---

## ADR-02 — Server adalah kontrak kueri database

**Konteks.** Filter dan sort dijalankan di browser atas seluruh baris. Dengan formula, rollup,
agregasi, dan pagination, itu berhenti bekerja: `sum` atas satu halaman baris bukan `sum` yang benar.

**Keputusan.** `POST /databases/:id/query` mengevaluasi filter, sort, group, dan agregasi di SQL.
Kode filter/sort klien yang sudah ada dipertahankan **hanya** sebagai overlay optimistik selama
request berjalan, dan dimatikan di atas satu halaman baris.

**Alternatif yang ditolak.** Tetap menghitung di klien dan mengambil semua baris. Sederhana sampai
database pertama melewati beberapa ribu baris, lalu tidak bisa diperbaiki tanpa menulis ulang
seluruh lapisan view.

**Konsekuensi.** Satu endpoint baru dan aturan bahwa hasil server selalu menang. Menampilkan
spinner lebih baik daripada menampilkan jawaban klien yang tidak lengkap tapi terlihat yakin.

Lihat §22A.

---

## ADR-03 — Formula dan rollup dimaterialisasi ke kolom `computed`

**Konteks.** Nilai turunan bergantung pada properti lain dan pada baris terkait. Kalau hanya
dihitung di browser, ia tidak bisa di-filter, di-sort, atau diagregasi oleh SQL.

**Keputusan.** Dihitung di server dan disimpan ke `database_rows.computed`. `values` tetap murni
input pengguna.

**Konsekuensi.** Mesin kueri (ADR-02) memperlakukan formula dan rollup **dengan SQL yang sama
persis** seperti properti biasa. Inilah seluruh alasan materialisasi dilakukan. Harganya: pipeline
hitung-ulang beserta graf dependensi dan deteksi siklus.

Lihat §24A, §24B.

---

## ADR-04 — Formula volatil dievaluasi saat baca, bukan disimpan

**Konteks.** Formula yang memakai `now()` atau `today()` berubah tanpa ada yang mengeditnya.
Materialisasi (ADR-03) menyiratkan job harian yang menghitung ulang setiap baris di setiap database
setiap tengah malam.

**Keputusan.** Formula volatil ditandai saat parse, tidak pernah masuk `computed`, dan dievaluasi
di dalam response API.

**Konsekuensi, ditulis terbuka.** Formula volatil **tidak bisa di-filter atau di-sort di SQL**,
karena nilainya tidak ada di basis data. Editor properti memperingatkan; filter atasnya dievaluasi
setelah pengambilan data dengan batas baris yang tegas. Kebutuhan paling umum ("jatuh tempo dalam
3 hari") tetap terlayani oleh filter tanggal relatif yang berjalan di SQL.

Lihat §24A.3.

---

## ADR-05 — Rollup dibatasi satu hop

**Konteks.** Rollup-atas-rollup dan formula yang merujuk rollup lintas dua database membutuhkan
invalidasi berantai yang benar.

**Keputusan.** Kedalaman dibatasi 1 hop. Editor properti **menolak mengonfigurasinya**.

**Alasan.** Rantai lebih dalam butuh antrean pekerjaan untuk invalidasi yang andal, dan antrean
berarti Redis — yang ada di daftar terlarang (§56). Menolak konfigurasinya lebih jujur daripada
menerimanya lalu menampilkan angka yang kadang salah.

---

## ADR-06 — Relasi adalah tabel, bukan array di JSONB

**Konteks.** Menyimpan array id di `database_rows.values` terlihat konsisten dengan properti lain.

**Keputusan.** Tabel `database_relation_links` dengan index `(to_row_id, property_id)`.

**Alasan.** Ini penerapan langsung Prinsip 4 (§57), bukan pengecualiannya: relation di-filter,
di-sort, dan di-relasikan. Lookup terbalik ("baris mana yang menunjuk ke sini") dijalankan setiap
kali sebuah baris berubah untuk menemukan rollup yang basi; di atas JSONB itu berarti pemindaian
penuh setiap edit.

Lihat §23A.

---

## ADR-07 — Search vector sebagai generated column

**Konteks.** Pencarian butuh tsvector yang selalu segar. Pola biasanya trigger, atau job reindex.

**Keputusan.** `jsonb_to_tsvector` dengan regconfig literal bersifat IMMUTABLE, sehingga bisa
dipakai sebagai generated stored column. Nol kode pemeliharaan; kesegaran dijamin Postgres.

**Catatan tambahan.** Config `'simple'`, bukan `'english'` — isi bercampur Indonesia dan Inggris,
dan Postgres tidak punya stemmer Indonesia. Mengindeks hanya nilai string (`'["string"]'`)
sekaligus memperbaiki bug lama: mencari "paragraph" tidak lagi mengembalikan hampir semua halaman.

Lihat §25A.

---

## ADR-08 — Row database adalah halaman `document`, bukan tipe konten baru

**Konteks.** Setiap baris harus menjadi halaman dengan konten dan panel properti. Refleks pertama
adalah menambah `pages.type = 'row'`.

**Keputusan.** Row page tetap `type = 'document'`, dibedakan oleh `pages.database_id`.

**Alasan.** ContentTypeRegistry mengatur *strategi render*. Row page dirender sebagai dokumen biasa
ditambah panel properti — bukan mesin render yang berbeda. Menjadikannya tipe konten berarti
menduplikasi seluruh jalur dokumen.

**Konsekuensi.** Row page harus dikecualikan dari pohon sidebar, dan `copyPageTree` harus
melewatinya — kalau tidak, menduplikasi halaman database menyalin setiap baris dua kali.

Lihat §20D.

---

## ADR-09 — Partial unique index untuk database inline

**Konteks.** `databases.page_id UNIQUE NOT NULL` mengunci "satu database per halaman", yang
menghalangi database inline dan linked view.

**Keputusan.** `owner_page_id` + `is_inline`, dengan unique index parsial `where is_inline = false`.

**Alasan.** Invariant asli ("halaman bertipe database punya tepat satu database") tetap dijaga
basis data, sementara satu dokumen boleh memuat berapa pun database inline. Menghapus constraint
begitu saja akan kehilangan penjagaan itu.

Lihat §20C.

---

## ADR-10 — Soft delete menang atas FK cascade

**Konteks.** Beberapa relasi baru (`pages.database_id`, `databases.owner_page_id`) secara alami
mengundang `on delete cascade`.

**Keputusan.** Tidak ada FK cascade yang boleh menghapus baris `pages`. Penghapusan yang menyentuh
halaman ditangani di transaksi service layer. Cascade antar tabel konten non-page dibolehkan.

**Alasan.** Cascade akan melewati Trash sepenuhnya dan menghapus halaman secara permanen — persis
yang dilarang §32.

Lihat §10B.3.

---

## ADR-11 — Drag blok memakai ProseMirror, dnd-kit hanya di luar editor

**Konteks.** dnd-kit dipilih untuk drag di seluruh aplikasi. Godaannya memakainya juga untuk
mengurutkan blok.

**Keputusan.** Di dalam DOM konten editor: drag native ProseMirror. Di luar: dnd-kit. `DndContext`
dipasang per fitur, tidak pernah di `layout.tsx`.

**Alasan.** ProseMirror memiliki DOM di dalam editor dan punya penanganan drag sendiri. Menumpuk
dnd-kit di atasnya menghasilkan dua state drag, seleksi teks yang rusak, dan transaksi yang hilang
— sehingga Ctrl+Z berhenti membatalkan pemindahan blok. `DndContext` global juga akan mencegat drag
di dalam Excalidraw dan React Flow, yang menangkap peristiwa pointer secara agresif.

**Catatan biaya.** `@tiptap/extension-drag-handle` adalah paket Tiptap Pro berbayar; jangan
dianggarkan. Handle kustom sekitar 150 baris.

Lihat §19A.

---

## ADR-12 — PDF lewat `window.print()`, bukan headless browser

**Konteks.** Ekspor PDF biasanya berarti Puppeteer atau Playwright-chromium.

**Keputusan.** Route `/print/[pageId]` dengan print stylesheet, dicetak oleh browser pengguna.

**Alasan.** Puppeteer sekitar 300MB, butuh browser di dalam image Docker, dan mengunduh Chromium
saat instalasi. Browser sudah menjadi mesin layout HTML terbaik yang tersedia; kita hanya tidak
perlu mem-bundel satu lagi hanya untuk satu fitur ekspor.

**Konsekuensi.** PDF batch tanpa browser tidak tersedia. Bila suatu saat dibutuhkan, `pdfkit`
dengan tata letak yang disederhanakan, dan dikatakan apa adanya bahwa hasilnya berbeda.

Lihat §30B.3.

---

## ADR-13 — Dua paket bersama, bukan lima

**Konteks.** CLAUDE.md menjanjikan `packages/{ui,editor,types,validation,config}`; tidak satu pun
pernah dibuat.

**Keputusan.** Buat `@memoire/validation` dan `@memoire/formula` saja. Koreksi CLAUDE.md untuk
yang lain.

**Alasan.** `ui`, `editor`, `types`, dan `config` masing-masing hanya punya satu konsumen.
Mengekstraknya menambah lapisan tanpa manfaat. Dua yang dibuat punya alasan nyata: keduanya
dikonsumsi frontend **dan** backend, dan di situlah penyimpangan definisi sudah benar-benar terjadi.

Lihat §39A.

---

## ADR-14 — Batasannya adalah pengguna lain, bukan jaringan

**Konteks.** Pemilik proyek menyatakan "tidak perlu ada hubungan dengan aplikasi lain seperti
Drive". Revisi sebelumnya menafsirkannya terlalu jauh menjadi aturan **nol permintaan jaringan
keluar**, yang mencoret blok bookmark, embed, media dari URL, aset CDN, dan notifikasi push —
padahal tidak satu pun dari itu melibatkan pengguna lain atau akun pihak ketiga.

**Keputusan.** Yang dibatasi adalah **fitur yang melibatkan pengguna lain**, dan hanya itu.
Aplikasi bebas menghubungi internet.

```text
TIDAK AKAN ADA   apa pun yang melibatkan orang lain: share, permission, komentar,
                 mention @orang, presence, penugasan, teamspace, Created by
DITUNDA          integrasi yang butuh akun pihak ketiga (Drive, Slack, Figma,
                 GitHub, Notion sync, web clipper, AI) -- belum dibutuhkan
BOLEH            pratinjau tautan, embed, media dari URL, aset CDN, push service,
                 pemeriksaan pembaruan desktop
```

**Konsekuensi.** Blok bookmark, embed, dan media dari URL masuk kembali ke rencana (§12B). Aturan
teknis untuk permintaan keluar ada di §29A: diambil dari sisi server (bukan browser, supaya alamat
IP pengguna tidak bocor ke setiap situs yang pernah ditempel), dengan timeout, batas ukuran,
penjaga SSRF, dan hasil yang di-cache sehingga konten tetap utuh saat offline.

**Pelajaran yang layak dicatat.** "Tidak butuh integrasi dengan aplikasi lain" dan "tidak boleh
menyentuh jaringan" terdengar mirip tapi jaraknya jauh. Yang pertama soal akun dan sinkronisasi;
yang kedua mencoret separuh blok media Notion. Batasan produk sebaiknya dikonfirmasi pada level
fitur, bukan diangkat sendiri menjadi aturan teknis yang lebih luas.

---

## ADR-15 — Notifikasi: polling saat terbuka, Web Push untuk latar

**Konteks.** Reminder butuh pengiriman, termasuk saat aplikasi tidak sedang dibuka.

**Keputusan.** Dua lapis:

```text
Aplikasi terbuka   polling TanStack Query tiap 30 detik ->
                   registration.showNotification() lewat service worker
Aplikasi tertutup  Web Push (VAPID), service worker berlangganan ke push service browser
Desktop            poller lokal di shell Tauri -> notifikasi OS asli;
                   lebih andal karena tidak bergantung izin dan langganan browser
```

Scheduler tetap `@nestjs/schedule` dengan `FOR UPDATE SKIP LOCKED` — aman tanpa lock
terdistribusi, jadi tidak butuh Redis.

**Konsekuensi.** Reminder yang terlewat tetap dikelompokkan sebagai "Terlewat" saat aplikasi
dibuka. Pengiriman latar bisa gagal karena izin ditolak, perangkat mati, atau langganan
kedaluwarsa — pengguna tidak boleh kehilangan pengingat karena itu, jadi inbox in-app tetap sumber
kebenarannya.

Lihat §70.

---

## ADR-16 — Auto-update Tauri tetap aktif

**Konteks.** Sprint 12 memasang `tauri-plugin-updater`. Revisi sebelumnya menonaktifkannya karena
ADR-14 versi lama.

**Keputusan.** Tetap aktif. Memeriksa pembaruan aplikasi sendiri tidak melibatkan pengguna lain dan
bukan integrasi pihak ketiga.

**Yang masih harus dikerjakan** sebelum rilis: `plugins.updater.pubkey` masih berisi placeholder,
dan endpoint-nya menunjuk host yang belum ada. Selama keduanya belum nyata, updater tidak akan
berhasil memperbarui apa pun — itu pekerjaan rilis, bukan keputusan arsitektur.

## ADR-17 — Empat registry, serializer wajib di tipe

**Konteks.** Paritas Notion menambah sekitar 25 tipe blok, 12 tipe properti, dan 3 tipe view.
Masing-masing, kalau ditulis biasa, menyentuh slash menu, block menu, turn-into, input rule,
eksportir, dan ekstraktor teks pencarian.

**Keputusan.** `BlockTypeRegistry`, `PropertyTypeRegistry`, dan `ViewTypeRegistry` melengkapi
`ContentTypeRegistry`. `toHtml`, `toMarkdown`, dan `toPlainText` adalah **field wajib pada tipe
TypeScript** entri blok.

**Alasan.** Ini Prinsip 3 (§57) yang diturunkan satu tingkat. Menjadikan serializer wajib berarti
tipe blok baru tidak bisa dikompilasi tanpa jalur ekspornya — compiler yang menegakkan paritas,
bukan review kode. Dengan 25 tipe blok, review kode pasti kebobolan.

Lihat §11D.

---

## ADR-18 — State view tersimpan, tidak pernah di React state

**Konteks.** Filter dan sort hidup di `useState` dan hilang saat reload.

**Keputusan.** Semuanya di `database_views.config`, divalidasi `viewConfigSchema` ber-versi, dan
selalu melewati `migrateViewConfig` saat baca maupun tulis.

**Alasan tambahan yang menentukan.** Linked view (ADR-09) berarti dua view atas database yang sama,
di dua halaman, harus punya filter berbeda. Dengan state di React, fitur itu **secara harfiah tidak
mungkin** dibangun — jadi ini bukan sekadar perbaikan kenyamanan.

Lihat §21A.

---

## ADR-19 — Snapshot versi dibatasi hash dan jeda waktu

**Konteks.** Autosave setiap 500–1500ms. Snapshot per penyimpanan menghasilkan ribuan salinan
dokumen penuh per sesi.

**Keputusan.** Lewati bila `content_hash` sama; selain itu tulis versi `auto` hanya bila sudah
lewat 10 menit. Retensi bertingkat lewat cron harian. Snapshot > 256KB dipindah ke object storage.

**Konsekuensi.** Paling banyak 10 menit kerja yang tidak terversi — pertukaran yang tepat untuk
aplikasi satu pengguna. Riwayat versi hanya bermakna karena ADR-01; tanpa id blok stabil, setiap
diff akan melaporkan "semuanya berubah".

Lihat §33A.

---

## ADR-20 — UUID dari klien untuk semua POST

**Konteks.** Membuat sesuatu saat offline menghasilkan id sementara, dan PATCH yang mengantre
sesudahnya menunjuk path berisi id yang belum pernah dilihat server.

**Keputusan.** Setiap `POST` menerima `id` opsional dari klien, dan klien selalu mengirimkannya.

**Alasan.** Jalur online dan offline menjadi identik, dan seluruh kebutuhan pemetaan ulang id
hilang. Ia juga menyelesaikan bug nyata yang ada sekarang: `request()` mengembalikan body permintaan
saat POST gagal jaringan, dan body `createPage` tidak memuat `id`, sehingga `useCreatePage`
menavigasi ke `/undefined`.

**Invariant pendamping.** Resource yang PATCH-nya bisa digabung outbox harus dikirim sebagai
representasi lengkap. Saat ini itu **berlaku secara kebetulan** — `commitCell` sudah mengirim objek
`values` utuh — tapi tidak ada tipe atau tes yang menjaganya, dan pelanggarannya hanya muncul saat
offline. Sprint 13 menambahkan tesnya.

Lihat §14, §10B.5.

---

## ADR-21 — Relasi dua arah menulis dua baris link, bukan satu + arah

**Konteks.** Relasi dua arah (§23A.2) berarti kedua sisi bisa menampilkan tautannya masing-masing.
Ada dua cara menyimpannya: (a) satu baris `database_relation_links` per pasangan baris, dengan sisi
pembacaan yang menukar `from_row_id`/`to_row_id` tergantung properti mana yang sedang dibaca, atau
(b) dua baris — satu per arah, masing-masing berkunci `property_id`-nya sendiri.

**Keputusan.** (b). `addRelation`/`removeRelation` menulis **dua** baris sekaligus dalam satu
transaksi ketika `config.inversePropertyId` terisi: `{property_id: A, from_row_id: R, to_row_id: T}`
dan `{property_id: B, from_row_id: T, to_row_id: R}`, dengan `A`/`B` saling menunjuk lewat
`inversePropertyId`.

**Alasan.** Setiap pembaca — rollup, proyeksi query, `recomputeRow` — sudah menyaring lewat
`property_id = :ini AND from_row_id = :baris_ini` (indeks `(to_row_id, property_id)` dan
constraint unik `(property_id, from_row_id, to_row_id)` keduanya dibangun di atas asumsi ini,
§23A.1). Opsi (a) memaksa setiap query itu tahu apakah properti yang sedang dibaca adalah sisi
"utama" atau "cermin", dan membalik kolom yang dibaca sesuai itu — sebuah flag arah yang harus
merambat ke `database-query.lib.ts`, `FormulaRecomputeService`, dan `PropertyTypeRegistry`
sekaligus. Menduplikasi baris link membuat setiap sisi symmetris dan tidak butuh kode khusus.

**Konsekuensi.** Menghapus satu sisi (`removeRelation`, atau menonaktifkan dua-arah lewat
`updateRelationProperty`) harus menghapus **kedua** baris eksplisit — tidak bisa mengandalkan
`ON DELETE CASCADE` dari satu baris saja. Toggle satu-arah -> dua-arah memicu backfill: baris link
lama yang sudah ada di sisi utama tidak otomatis dapat pasangannya (di luar cakupan Sprint 20 —
`updateRelationProperty` hanya membuat properti pasangan, belum mem-backfill tautan yang sudah ada
sebelum toggle; ditambahkan bila kebutuhan nyata muncul).

Lihat §23A.1, §23A.2, `apps/api/src/databases/databases.service.ts` (`addRelation`,
`removeRelation`, `updateRelationProperty`).

---

## ADR-22 — `position` jadi `double precision`, bukan reindex integer per drag

**Konteks.** Sprint 21 menambahkan drag-drop urut ulang untuk baris, kolom, dan tab view.
`database_properties.position`/`database_rows.position`/`database_views.position` sebelumnya
`integer`, hanya pernah ditulis lewat `max(position) + 1` (tambah di akhir) atau tukar posisi
berdampingan (`moveView`). Menjatuhkan sebuah item di antara dua tetangga sembarang butuh cara
menyisip tanpa menomori ulang semua saudaranya.

**Keputusan.** Ubah ketiga kolom itu jadi `double precision`. Posisi baru = titik tengah dua
tetangga (`fractionalPosition`, sudah ada tanpa dipakai di `apps/web/lib/position.ts` sejak
sebelum Sprint 21 — dipromosikan ke `packages/validation/src/position.ts` supaya `apps/api` juga
bisa memakainya). Saat celah sudah terlalu rapat (`< 1e-7`), sisi server menomori ulang seluruh
saudara ke bilangan bulat berjarak 1 (`renormalizePositions`) lalu mencoba sekali lagi.

**Alasan.** Alternatifnya — reindex-shift semua baris kena drag — berarti menulis ulang N baris
untuk satu drag, dan itu justru kode yang *lebih* rumit untuk hasil yang lebih buruk (kolom float
sudah ada helper aritmetikanya, tinggal dipakai; reindex-shift belum ada sama sekali). Migrasi
`ALTER COLUMN ... TYPE double precision` aman tanpa backfill (int -> float tanpa kehilangan
presisi), index `(database_id, position)` yang ada tetap valid.

**Konsekuensi yang mudah terlewat.** Sebelum sprint ini, jalur baca baris (`database-query.lib.ts`
`buildSortSql`) **tidak pernah** mengurutkan berdasarkan `position` sama sekali — tanpa sort
eksplisit, satu-satunya `ORDER BY` adalah `id asc`. Menambah kolom float tanpa memperbaiki ini
berarti drag baris tidak akan terlihat berubah sama sekali. Perbaikannya: `buildSortSql` jatuh ke
`position asc` (sebelum tiebreak `id asc`) saat `sorts` kosong; `buildKeysetSql` dan cursor
`nextCursor` di `database-query.service.ts` mengikuti fallback yang sama supaya keyset pagination
tetap konsisten dengan urutan yang benar-benar dirender.

Lihat §19A.4, §21, §22A.6, `apps/api/src/databases/database-query.lib.ts`
(`buildSortSql`/`buildKeysetSql`), `apps/api/src/databases/databases.service.ts`
(`reorderRow`/`reorderProperty`/`reorderView`/`reorderRowIntoGroup`).

---

## ADR-23 — Drag sidebar ke editor pakai native HTML5 DnD, bukan dnd-kit yang menjangkau ke dalam ProseMirror

**Konteks.** Sprint 22 menambahkan kemampuan menyeret satu baris sidebar ke dalam dokumen yang
sedang dibuka, menghasilkan blok `linkToPage`. ADR-11 (Sprint 14) sudah menetapkan: dnd-kit tidak
pernah dipasang di dalam DOM konten ProseMirror, drag di dalam editor selalu native ProseMirror.
Kasus baru ini adalah versi lain dari batas yang sama — drag *dimulai* di luar editor (sidebar,
wilayah dnd-kit) tapi *berakhir* di dalam editor.

**Keputusan.** Baris sidebar tetap dikelola dnd-kit untuk reorder/reparent di dalam pohon sidebar
(`useDraggable`/`useDroppable`, lihat §22.3), tapi drag yang melewati batas sidebar->editor dijalankan
lewat native browser drag: atribut HTML `draggable` + `dataTransfer` di elemen baris terluar,
ditangkap oleh plugin ProseMirror `handleDOMEvents.drop`
(`apps/web/features/editor/link-to-page-drop-plugin.ts`) yang membaca MIME type kustom
(`application/x-memoire-page-id`) dan menyisipkan node `linkToPage` pada titik drop. Tidak ada
`DndContext` yang menjangkau ke dalam DOM editor untuk mewujudkan ini.

Dua mekanisme drag ini hidup berdampingan di satu baris DOM tanpa berebut pointer event karena
dipisah oleh elemen: listener dnd-kit (`{...attributes} {...listeners}`) hanya dipasang di
`<span>` handle kecil (`⠿`), sedangkan `draggable`/`onDragStart` native ada di `<div>` baris
terluar. Menyeret handle -> reorder/reparent dnd-kit di sidebar. Menyeret badan baris (misal ke
editor) -> native HTML5 drag, karena `PointerSensor` dnd-kit cuma mendengarkan `pointerdown` di
handle-nya, bukan di seluruh baris.

**Alasan.** Menyatukan kedua drag ini di bawah satu `DndContext` berarti context itu harus
menjangkau ke dalam DOM ProseMirror sebagai target drop — persis yang dilarang ADR-11, dengan
alasan yang sama: ProseMirror mengelola DOM-nya sendiri secara agresif (re-render on every
transaction), dan dnd-kit yang ikut memantau node di dalamnya akan saling rebutan kendali.

Lihat §16A.4, §22.4, `apps/web/features/editor/link-to-page-drop-plugin.ts`,
`apps/web/features/sidebar/sidebar-row.tsx`.

---

## ADR-24 — Cuplikan pencarian dari ekstraksi SQL, dan koreksi cakupan `search_vector` blocks

**Konteks.** ADR-07 (Sprint sebelumnya) sudah memutuskan `search_vector` sebagai generated column
dengan filter `'["string"]'` pada `jsonb_to_tsvector`, diklaim memperbaiki bug lama "mencari
'paragraph' mengembalikan hampir semua halaman". Saat implementasi Sprint 23, klaim itu diuji
langsung ke Postgres — dan ternyata **belum benar-benar terbukti** untuk `blocks.content`: filter
`'["string"]'` memang mengecualikan KUNCI JSON (key), tapi tidak mengecualikan NILAI string dari
kunci `type`/`text` Tiptap sendiri (`{"type": "paragraph", ...}` — "paragraph" di sini adalah NILAI
string yang sah, bukan key). Diverifikasi empiris: 285 blok cocok palsu untuk kueri "paragraph"
sebelum perbaikan, 0 sesudah.

**Keputusan.** `blocks.searchVector` diubah dari `jsonb_to_tsvector(..., '["string"]')` (seluruh
pohon JSON) menjadi `to_tsvector('simple', jsonb_path_query_array(content, '$.**.text')::text)` —
dibatasi ke kunci yang secara harfiah bernama `text`, satu-satunya tempat Tiptap menyimpan teks
yang benar-benar ditampilkan. Generated column melarang subquery (`select ... from
jsonb_array_elements_text(...)`), jadi ekstraksinya lewat cast `::text` pada array JSONB hasil
`jsonb_path_query_array`, bukan `string_agg` — Postgres men-tokenize tanda kurung/kutip array itu
sebagai pemisah kata, cukup untuk tsvector meski bukan teks yang rapi.

`database_rows.values` **tidak** kena bug yang sama (diverifikasi: 0 hasil palsu) — bentuknya
berbeda dari `blocks.content` (dikunci oleh id properti, bukan struktur `type`/`text` Tiptap), jadi
kolomnya tetap `'["string"]'` tanpa perubahan.

**Cuplikan (`ts_headline`) diekstrak di SQL, bukan lewat serializer backend.** §25A.5 awalnya
menyebut "serializer yang sama dengan Markdown export" — ternyata `apps/api/src/export/export.service.ts`
cuma dump JSON datar, tidak ada serializer teks-polos di backend sama sekali, dan
`BlockTypeRegistry.toPlainText` (frontend, `apps/web/features/editor/block-type-registry.ts`)
membawa objek ekstensi Tiptap yang tidak bisa dipindah ke NestJS begitu saja. Porting satu
serializer baru berarti menduplikasi `BlockTypeRegistry` (peringatan §3 CLAUDE.md) atau paket
bersama baru (sudah ditolak ADR-13). Cuplikan karena itu diekstrak langsung di SQL:
`blocks.content` lewat subquery `string_agg` atas `jsonb_path_query_array(..., '$.**.text')`
(subquery legal di sini karena bukan generated column), `database_rows.values` lewat pola serupa
dengan filter JSONPath `$.**?(@.type() == "string")` (semua nilai string, tanpa batasan kunci
`text` — sesuai bentuknya yang flat).

Delimiter `ts_headline` diganti dari `<b>`/`</b>` bawaan ke karakter kontrol SOH/STX
(`\x01`/`\x02`) — frontend memisahnya jadi `<mark>` lewat JSX biasa (`apps/web/lib/search.ts`,
`parseSnippet`), bukan `dangerouslySetInnerHTML`, konsisten dengan tidak ada view daftar lain di
kodebase ini yang menyuntikkan HTML mentah.

**Peluruhan recency** pada `ts_rank_cd` (§25A.4) pakai half-life 30 hari — angka konkret yang
tidak disebutkan spek asli, dipilih karena cukup baru untuk membuat halaman minggu ini jelas
mengungguli halaman setahun lalu, cukup longgar agar catatan sebulan lalu tidak lenyap dari hasil.

Lihat §25A, `apps/api/src/search/search-query.lib.ts`, `apps/api/src/db/schema.ts`
(`blocks.searchVector`), `apps/api/src/search/search.service.ts`, `apps/web/lib/search.ts`.

---

## ADR-25 — Ekspor workspace dikemas di klien dengan `fflate`, backup dikemas di server

**Konteks.** §30B merancang satu renderer (`BlockTypeRegistry`/`PropertyTypeRegistry`) yang
melayani cuplikan pencarian, clipboard, DAN berkas ekspor — implikasinya, ekspor bisa dibangun
sebagai endpoint backend yang membaca database lalu merender. Tapi ADR-24 (Sprint 23) sudah
menetapkan kedua registry itu **frontend-only**: `BlockTypeDefinition`/`PropertyTypeDefinition`
membawa objek ekstensi Tiptap yang tidak bisa jalan di NestJS. Memindahkannya ke backend berarti
menduplikasi registry (dilarang §3 CLAUDE.md) atau paket bersama baru (sudah ditolak ADR-13).

**Keputusan.** Ekspor per-halaman (Markdown/HTML) dan per-view (CSV) berjalan sepenuhnya di klien,
memakai ulang registry yang sudah ada dan sudah benar — tidak ada endpoint backend baru untuk
ekspor. ZIP ekspor workspace juga dikemas di klien, pakai `fflate` (~8KB, murni JS, jalan di
browser tanpa polyfill Node) — bukan `archiver`/`yazl` yang disebut §30B.4, karena keduanya
berorientasi Node stream dan tidak cocok begitu pengemasan pindah ke browser.

**Backup (§31) adalah pengecualian yang disengaja, bukan inkonsistensi.** Isi backup adalah
`memoire.json` (dump JSON mentah dari `ExportService.exportWorkspace()`, sudah ada sejak sebelum
sprint ini) plus lampiran biner — sama sekali tidak melalui registry manapun. Karena itu backup
bisa, dan memang, tetap murni server-side — termasuk dari `@Cron` tanpa browser yang terbuka.
ZIP-nya dikemas dengan `archiver`\* di server.

\* **Catatan implementasi:** `archiver` versi yang terinstal (v8) ternyata rewrite ESM dengan API
berbeda total dari API klasik yang didokumentasikan `@types/archiver` — inkompatibel begitu
dipakai. Diganti `fflate` di sisi server juga (bisa jalan di Node maupun browser), sehingga satu
library menutup seluruh kebutuhan ZIP sprint ini, bukan dua library terpisah seperti rencana awal.

**Konsekuensi yang perlu dipahami.** Ekspor workspace jadi N permintaan HTTP berurutan/paralel dari
browser, bukan satu pembacaan langsung ke Postgres — dapat diterima untuk aplikasi personal
satu-pengguna yang melakukan ini sebagai aksi manual sesekali, bukan jalur panas.

Lihat §30B, §30B.4, §31, `apps/web/features/export/workspace-export.ts`,
`apps/api/src/backup/backup.service.ts`.

---

## ADR-26 — Riwayat versi: hash JSON kanonik, retensi per-workspace, dan `VersionsService` tanpa `PagesService`

**Konteks.** Sprint 25 membangun §33A (riwayat versi) dan memperbaiki dua bug Trash (§32). Lima
keputusan desain lahir dari sprint ini yang tidak jelas dari kode saja.

**1. Judul dan ikon ikut divers, bukan hanya konten blok.** §33A.2 sendiri hanya menyebut satu
titik hook (`BlocksService.replace`) — bacaan literalnya adalah versi hanya menangkap blok. Saat
perencanaan, pengguna secara eksplisit memilih menyertakan judul/ikon juga (lawan dari opsi
"blocks-only" yang direkomendasikan karena lebih sederhana). Konsekuensinya, `PagesService.update`
juga memanggil `VersionsService.autoSnapshotIfDue` saat `title`/`icon` berubah — bukan cuma
`BlocksService.replace`. `contentHash` mencakup ketiganya (`title`, `icon`, `blocks`) sekaligus,
supaya perubahan judul saja tetap memicu versi baru.

**2. Hash konten dari JSON yang di-canonical-kan, bukan `JSON.stringify` polos.** ECMAScript memang
menjamin urutan enumerasi kunci sendiri hari ini, tapi tugas hash ini murni "apakah sesuatu benar-
benar berubah" — kata "kanonik" di §33A.1 sendiri sudah eksplisit. `canonical-json.lib.ts` melakukan
sort kunci rekursif sebelum `JSON.stringify`, ~10 baris, cukup murah untuk tidak dipertaruhkan.

**3. Retensi satu nilai per-workspace, bukan per-halaman.** §33A.3 menyebut "bisa diatur di
Settings" tapi tidak bilang di mana ia hidup — tidak ada mekanisme setting per-workspace yang sudah
ada untuk dipakai ulang. Ditambahkan `workspaces.settings` (jsonb, meniru pola `pages.settings` yang
sudah ada) berisi `{ versionRetentionDays }`, bukan tabel baru. Per-halaman ditolak: kompleksitas UI
dan penyimpanan tambahan untuk kasus yang jarang dibutuhkan di aplikasi personal.

**4. Batas keras 200 versi/halaman berlaku bahkan saat "simpan selamanya".** `retentionDays: null`
melewati pemangkasan jendela waktu, tapi `computeVersionsToDelete` tetap menegakkan `hardCap` di
langkah terakhir — tanpa ini, satu halaman yang sering diedit bisa tumbuh tak terbatas meski tier
bulanan sudah menyusutkan sebagian besar. Ini disengaja, bukan bug melawan ekspektasi "selamanya".

**5. Versi kedua hasil restore berakhir `kind='auto'`.** §33A.6 meminta "tulis konten lama sebagai
versi baru" tanpa menentukan `kind`-nya. `VersionsService.restore` menulis snapshot `pre_restore`
untuk keadaan sekarang, lalu memanggil `BlocksService.replace` dengan konten lama — hook
`autoSnapshotIfDue` yang sudah ada otomatis menangkap ini sebagai versi `'auto'` baru, karena
hash-nya beda dari snapshot `pre_restore` yang baru ditulis. Memakai ulang hook yang sama (bukan
jalur tulis khusus ketiga) lebih sederhana, dengan konsekuensi versi hasil-restore ini bisa
kena pemangkasan retensi otomatis di kemudian hari seperti versi auto lainnya — dianggap wajar,
tapi layak diketahui pembaca kode, bukan kebetulan.

**6. `VersionsService` tidak bergantung pada `PagesService`.** `BlocksService` sudah bergantung
pada `PagesService`, dan `VersionsService` perlu dipanggil dari dalam transaksi keduanya — kalau
`VersionsService` juga bergantung pada `PagesService`, terbentuk siklus tiga-arah
(`Pages -> Versions -> Blocks -> Pages`) yang butuh `forwardRef` konsisten di semua sisi. Sebagai
gantinya, `VersionsService` membaca/menulis tabel `pages` langsung lewat `tx` mentah — pola yang
sama dengan "raw `tx.insert` alih-alih memanggil service" yang sudah dipakai kode impor Sprint 24
untuk `DatabasesService` (siklus itu, dan alasan menghindarinya, ada di §39A/Sprint 24B). Satu-
satunya siklus modul yang tersisa adalah `BlocksModule <-> VersionsModule` (untuk langkah tulis blok
di `restore`), diselesaikan dengan `forwardRef` di kedua sisi modul **dan** di parameter constructor
kedua service — siklus impor ES riil (bukan cuma siklus DI Nest) butuh `forwardRef` di titik
injeksi juga, tidak cukup hanya di level modul, kalau tidak kelas yang direferensikan masih
`undefined` saat metadata decorator dievaluasi.

**7. Bug 1 Trash — restore mengembalikan descendant tanpa syarat.** `setArchived` versi lama hanya
menyentuh satu baris `pages`; anak dari halaman yang diarsipkan jadi yatim tersembunyi (tak
terjangkau dari sidebar, tak muncul di Trash). Perbaikannya membuat archive/restore rekursif ke
seluruh subtree dalam satu transaksi. Restore mengembalikan SEMUA descendant yang sedang terarsip
tanpa syarat — bukan hanya yang diarsipkan bersamaan waktu dengan induknya (itu butuh melacak
`archivedAt` per node, kompleksitas ekstra untuk manfaat kecil di aplikasi satu pengguna). Trade-off
eksplisit: anak yang diarsip ulang secara independen lalu induknya di-restore, akan ikut kembali —
diterima.

**8. Bug 2 Trash — urutan hapus subtree yang aman-FK.** `databaseRows.pageId -> pages.id` adalah
`ON DELETE no action`, beda dengan `databases.ownerPageId`/`databaseRows.databaseId` yang cascade.
`deletePageTree` versi lama (depth-first rekursif) bisa menghapus halaman detail baris sebelum
halaman pemilik database-nya, memicu FK violation yang muncul sebagai `INTERNAL_ERROR` — bug nyata
yang tertangkap langsung di Sprint 24B saat membersihkan data uji. Diperbaiki dengan strategi yang
sudah terbukti di `test/test-helpers.ts`: kumpulkan seluruh id subtree lebih dulu (BFS), null-kan
`databaseRows.pageId` yang menunjuk ke subtree itu, baru hapus halaman dari yang terdalam — kode
produksi dan kode uji kini sengaja memakai strategi yang sama.

Lihat §32, §33A, `apps/api/src/pages/pages.service.ts`, `apps/api/src/versions/`,
`apps/api/src/blocks/blocks.service.ts`, `apps/api/test/test-helpers.ts`.
