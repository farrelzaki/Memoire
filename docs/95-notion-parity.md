> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §71

---

# 71. Matriks Paritas Notion

Inventaris fitur Notion beserta statusnya di Memoire. **File ini dipelihara terus** — setiap sprint
yang selesai memperbarui kolom statusnya. Ia adalah jawaban atas pertanyaan "apa lagi yang kurang",
dan sekaligus rem terhadap kecenderungan menambah fitur yang Notion sendiri tidak punya.

```text
ADA       sudah jalan
SEBAGIAN  ada tapi belum setara
BELUM     direncanakan, ada di roadmap
DITUNDA   belum dikerjakan, bukan dilarang
DILUAR    tidak akan pernah ada -- semuanya karena melibatkan pengguna lain
```

## 71.1 Blok

```text
ADA        paragraph, heading 1-3, bulleted list, numbered list, to-do,
           quote, divider, code block, image (resize, align, caption, full-bleed),
           mermaid (di luar Notion), toggle list, toggle heading 1-3, callout,
           columns 2-5, table sederhana, equation block, inline equation,
           sub-page, link-to-page, breadcrumb-block, table of contents,
           synced block, video / audio / file / PDF (upload atau URL),
           bookmark (pratinjau URL), embed ber-sandbox,
           database inline, linked database view
SEBAGIAN   code block   -- tanpa syntax highlight, pemilih bahasa, tombol salin
BELUM      template button
DITUNDA    button multi-aksi   -- template button menutup sebagian besar kebutuhannya
           blok AI             -- bersama integrasi pihak ketiga lain (§56.3)
DILUAR     komentar per blok   -- melibatkan pengguna lain (§56.2)
```

## 71.2 Formatting inline

```text
ADA        bold, italic, strike, inline code, input rule markdown dasar
BELUM      underline, highlight, warna teks, warna latar, superscript, subscript,
           link (internal & eksternal), mention @halaman, mention @tanggal,
           inline equation, selection toolbar, paste markdown jadi blok
DILUAR     mention @orang, komentar, suggested edit   -- melibatkan pengguna lain (§56.2)
```

## 71.3 Tipe properti database

```text
ADA        title, text, number, select, multi-select, status (dengan grup todo/doing/done),
           checkbox, date, url, email, phone, created time, last edited time, unique ID,
           relation (satu & dua arah, §23A), rollup (§24B), formula (§24A)
SEBAGIAN   files       -- properti & filter is_empty/is_not_empty ada, kolom tabel baca-saja,
                          belum ada UI unggah (beda dari blok file/video/audio/pdf editor, §12B.2)
           number      -- format persen/mata uang/bar/ring divalidasi skema, belum ada UI pengaturan
           formula     -- editor properti masih textarea polos, tanpa live preview/syntax highlight
BELUM      files & media unggah lewat sel database, rentang tanggal + waktu, reminder pada tanggal
DILUAR     person, created by, last edited by   -- melibatkan pengguna lain (§56.2)
```

## 71.4 View database

```text
ADA        table, board, calendar, gallery
SEBAGIAN   board     -- ganti grup lewat dropdown, kartu belum bisa di-drag
           calendar  -- baca saja, belum bisa seret atau membuat dari klik
           gallery   -- tanpa konfigurasi kartu maupun gambar sampul
BELUM      list, timeline / gantt
           duplicate view, urutkan tab view, lock view
DITUNDA    chart view  -- nilainya rendah untuk penggunaan pribadi, butuh §20B stabil
```

## 71.5 Konfigurasi view

```text
ADA        viewConfigSchema + migrateViewConfig, PERSISTENSI SEMUANYA lewat
           database_views.config (§21A) -- filter, sort, kalkulasi, pageSize,
           rowHeight & wrapCells (table) semuanya bertahan setelah reload
           filter/sort/group/agregasi dijalankan server-side lewat POST /databases/:id/query,
           keyset pagination (§22A)
           grup filter AND/OR bersarang + operator penuh per tipe properti (mesin, §22A.3-4)
           multi-sort hingga 10 level (mesin + UI chip "+ Sort")
           visibilitas properti -- checkbox tampil/sembunyi per kolom
SEBAGIAN   filter builder UI -- mesin mendukung grup AND/OR bersarang, UI baru satu aturan
BELUM      sub-group, urutan & lebar kolom (dnd-kit, Sprint 21), ukuran & pratinjau kartu,
           pencarian dalam view, perilaku buka halaman (side/center/full), lock view
```

## 71.6 Kalkulasi

```text
ADA        20 fungsi: count all / values / unique / empty / not empty,
           percent empty / not empty, sum, average, median, min, max, range,
           earliest date, latest date, date range,
           checked, unchecked, percent checked, percent unchecked
           dihitung di SQL server-side (§20B.2), footer tabel per kolom,
           kalkulasi per grup board
```

## 71.7 Struktur database

```text
ADA        database sebagai halaman penuh, beberapa view per database,
           duplicate database (ikut lewat duplicate halaman)
           database inline di dalam dokumen (blok, §20C)
           linked view atas database lain (blok, §20C.3)
           baris sebagai halaman (properti + konten, §20D) -- panel properti di atas dokumen baris
           side peek / center peek (properti + tautan ke halaman penuh; belum menyematkan konten blok)
           template baris (buat dari baris, pilih saat baris baru)
           duplicate view, geser urutan tab (tombol; drag-and-drop di Sprint 21), lock view
BELUM      konversi tabel sederhana <-> database
           page template (template halaman biasa, beda dari template baris)
DITUNDA    sinkronisasi database dari sumber eksternal   -- butuh integrasi akun (§56.3)
```

## 71.8 Fitur halaman

```text
ADA        page icon (emoji), cover (gradien & upload), cover reposition,
           favorite, duplicate, move to, Trash + restore + hapus permanen,
           breadcrumb, full width, small text, font family, lock page,
           hitung kata, panel backlink
BELUM      riwayat versi, page template, icon dari upload
DILUAR     share, publish ke web, guest, komentar, analytics halaman   -- (§56.2)
```

## 71.9 Navigasi

```text
ADA        pohon sidebar, resize sidebar, Favorites, breadcrumb,
           command palette (Ctrl+K)
SEBAGIAN   pencarian  -- ILIKE, tanpa ranking, tanpa cuplikan, mencocokkan kunci JSON
           shortcut   -- hanya Ctrl+K / Ctrl+P / Ctrl+N
BELUM      drag halaman di sidebar (urutkan + pindah induk), Recents,
           multi-select halaman, full-text search + ranking + cuplikan,
           filter pencarian, page peek, cheatsheet shortcut
```

## 71.10 Interaksi

```text
ADA        resize sidebar, drop gambar untuk upload,
           drag di dalam Excalidraw & React Flow (bawaan library)
BELUM      drag blok untuk urut ulang, drag blok ke kolom, penanda garis jatuh,
           multi-select blok + aksi massal, context menu klik-kanan,
           drag halaman di sidebar, drag kartu kanban, urutkan baris & kolom tabel,
           geser lebar kolom, urutkan kartu gallery, seret event kalender,
           seret batang timeline, resize gambar, urutkan tab view,
           copy-paste blok dengan strukturnya
```

## 71.11 Import / Export

```text
ADA        export JSON seluruh workspace
BELUM      export Markdown, CSV (per view), HTML, PDF (lewat print), ZIP + lampiran
           import Markdown, CSV -> database, Notion export ZIP, restore memoire.json
           backup terjadwal lokal
DITUNDA    import dari Evernote / Google Docs lewat API mereka   -- butuh akun (§56.3)
```

## 71.12 Settings

```text
BELUM      seluruhnya -- tidak ada UI settings sama sekali (§35A)
DITUNDA    connections & integrations   -- (§56.3)
DILUAR     members, guests, plan & billing, public sites,
           identity provisioning, analytics workspace   -- (§56.2)
```

## 71.13 Ringkasan pengecualian

Hanya ada **satu** pengecualian permanen:

```text
Fitur yang melibatkan pengguna lain -- tidak akan pernah ada.
  share & publish, permission & role, komentar & diskusi, mention @orang,
  presence & cursor, suggested edit, penugasan, teamspace & guest,
  properti Person / Created by / Last edited by, activity feed, Forms
```

Aplikasi ini dipakai satu orang, jadi seluruh permukaan kolaborasi Notion tidak punya arti di sini.
Bukan ditunda — memang tidak berlaku.

Di luar itu, yang belum ada hanyalah **ditunda**, bukan dilarang: integrasi yang butuh akun pihak
ketiga (Drive, Slack, Figma, GitHub, Notion sync, web clipper, AI). Boleh masuk kapan saja lewat
diskusi; masing-masing membawa OAuth dan penyimpanan token yang perlu dipikirkan dulu (§56.3).

Aplikasi sendiri bebas menghubungi internet untuk hal biasa — pratinjau tautan, embed, media dari
URL, aset CDN, push notification. Aturan teknisnya di §29A.
