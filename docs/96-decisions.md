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
