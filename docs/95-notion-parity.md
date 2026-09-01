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
           quote, divider, code block, image, mermaid (di luar Notion)
SEBAGIAN   code block   -- tanpa syntax highlight, pemilih bahasa, tombol salin
           image        -- tanpa resize, align, caption
BELUM      toggle list, toggle heading 1-3, callout, columns 2-5, table sederhana,
           equation block, inline equation, sub-page, link-to-page, breadcrumb,
           table of contents, synced block, template button,
           video / audio / file / PDF (upload atau URL),
           bookmark (pratinjau URL), embed ber-sandbox,
           database inline, linked database view
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
ADA        title, text, number, select, checkbox, date, url
BELUM      multi-select, status (dengan grup todo/doing/done), email, phone,
           files & media (upload atau URL), format number (persen, mata uang, bar, ring),
           rentang tanggal + waktu, reminder pada tanggal,
           relation (satu & dua arah), rollup, formula,
           created time, last edited time, unique ID
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
SEBAGIAN   filter  -- tepat SATU filter, 5 operator, hidup di useState, hilang saat reload
           sort    -- satu level, juga tidak tersimpan
           group   -- hanya board, dipilih otomatis, tidak bisa diubah
BELUM      grup filter AND/OR bersarang, operator per tipe properti,
           multi-level sort, sub-group, visibilitas & urutan properti,
           lebar kolom, row height, wrap cells, ukuran & pratinjau kartu,
           pencarian dalam view, perilaku buka halaman (side/center/full), lock view

           PERSISTENSI SEMUANYA -- ini gap tunggal terbesar (§21A)
```

## 71.6 Kalkulasi

```text
BELUM      seluruhnya. 20 fungsi: count all / values / unique / empty / not empty,
           percent empty / not empty, sum, average, median, min, max, range,
           earliest date, latest date, date range,
           checked, unchecked, percent checked, percent unchecked
           plus footer tabel dan kalkulasi per grup board
```

## 71.7 Struktur database

```text
ADA        database sebagai halaman penuh, beberapa view per database,
           duplicate database (ikut lewat duplicate halaman)
BELUM      database inline di dalam dokumen   -- terhalang unique constraint (§20C)
           linked view atas database lain
           baris sebagai halaman (properti + konten)  -- kolom page_id ada, tak pernah diisi
           side peek / center peek
           template baris
           konversi tabel sederhana <-> database
DITUNDA    sinkronisasi database dari sumber eksternal   -- butuh integrasi akun (§56.3)
```

## 71.8 Fitur halaman

```text
ADA        page icon (emoji), cover (gradien & upload), favorite, duplicate,
           move to, Trash + restore + hapus permanen, breadcrumb,
           full width, small text
BELUM      cover reposition, font family, lock page, hitung kata,
           riwayat versi, panel backlink, page template,
           icon dari upload
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
