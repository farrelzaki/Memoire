> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §15, §15A, §16, §16A, §25, §25A, §26, §27, §58, §59

---

# 15. Page Management
Fitur halaman:

```text
Create page
Rename page
Delete page
Archive page
Duplicate page
Move page
Move into page
Favorite page
Add icon
Add cover
```

Hierarchy:

```text
Workspace
└── Page A
    ├── Page B
    │   ├── Page C
    │   └── Page D
    └── Page E
```

---

# 15A. Backlinks

Notion menampilkan "Backlinks" di kepala halaman: daftar halaman lain yang menyebut halaman ini.
Untuk catatan pribadi ini salah satu fitur paling berguna — ia mengubah kumpulan halaman terpisah
menjadi jaringan tanpa perlu menatanya secara manual.

## 15A.1 Tabel

```text
page_links
- id
- source_page_id    -> pages(id) on delete cascade
- source_block_id   uuid   -- blok tempat sebutan itu berada (§11E)
- target_page_id    -> pages(id) on delete cascade
- target_block_id   uuid null
index (target_page_id)
```

## 15A.2 Kapan dibangun

Setiap kali blok sebuah halaman disimpan (`PUT /pages/:id/blocks`), dalam transaksi yang sama:

```text
1. hapus semua page_links dengan source_page_id = halaman ini
2. telusuri dokumen, kumpulkan setiap page mention (§12A.3), link internal (§12A.2),
   blok link_to_page dan sub_page (§12B.3)
3. sisipkan ulang
```

Hapus-lalu-sisipkan-ulang, bukan diff. Jumlah tautan per halaman kecil, dan pendekatan ini tidak
mungkin meninggalkan tautan basi — mode kegagalan yang jauh lebih mahal daripada beberapa baris
tulis tambahan.

Ini bergantung pada `source_block_id` yang stabil (§11E); dengan id yang lahir ulang setiap simpan,
setiap penyimpanan akan menghasilkan kumpulan backlink yang seluruhnya "baru".

## 15A.3 Tampilan

```text
Panel di bawah judul, terlipat secara default:
  "Ditautkan dari 3 halaman"
  - Jurnal Harian / 12 Mei        "...lihat catatan Riset Pasar untuk..."
  - Proyek Alpha                  "...bergantung pada Riset Pasar..."
```

Cuplikan diambil dari blok sumbernya lewat `toPlainText` (§11D.2) — sekali lagi serializer yang
sama dengan pencarian dan ekspor.

## 15A.4 Yang tidak dibangun

Graph view (visualisasi jaringan halaman) tidak masuk. Notion sendiri tidak punya, dan nilainya
untuk perencanaan pribadi jauh di bawah biayanya. Data yang dibutuhkan sudah tersedia di
`page_links` bila suatu saat berubah pikiran.

---

# 16. Sidebar
Sidebar minimal:

```text
Workspace
│
├── Search
├── Favorites
├── All Pages
├── Databases
├── Templates
└── Trash
```

Tombol "New Page" di sidebar membuka submenu tipe page yang sumbernya dari `ContentTypeRegistry` (lihat 11A):

```text
New Page
├── Document
├── Database
├── Whiteboard
└── Diagram
```

Tipe page ditampilkan dengan icon berbeda di tree navigation agar mudah dibedakan sekilas.

Tree navigation:

```text
▾ College
  ▾ Semester 5
      Notes
      Project
      Schedule

▾ Personal
    Journal
    Ideas
```

Tambahkan drag & drop setelah basic hierarchy stabil.

---

# 16A. Interaksi Sidebar

§16 menjelaskan struktur sidebar. Seksi ini melengkapinya dengan interaksi yang sudah ada di Notion
dan belum ada di sini.

## 16A.1 Drag halaman

Endpoint-nya **sudah ada**: `POST /pages/:id/move` menerima `parentPageId` dan `position`. Klien
sekarang hanya mengirim `parentPageId` lewat menu "Move to…" dan tidak pernah mengirim `position`.
Yang kurang murni sisi UI.

```text
Urutkan ulang    jatuhkan di antara dua saudara -> position pecahan (§19A.4)
Pindah induk     jatuhkan DI ATAS sebuah baris -> jadi anaknya, baris ikut membuka
Ke akar          jatuhkan di area kosong bawah daftar

Penanda jatuh
  garis horizontal   akan disisipkan sebagai saudara
  sorotan baris      akan menjadi anak

Ditolak
  menjatuhkan halaman ke dalam subtree-nya sendiri
  backend sudah menolaknya (hasAncestor), UI tidak boleh menawarkannya sejak awal
```

Memakai dnd-kit, dengan satu `DndContext` milik sidebar sendiri (§19A.3).

## 16A.2 Drag ke editor

Menyeret halaman dari sidebar ke dalam dokumen menyisipkan blok `link_to_page` (§12B.3). Ini
peralihan antara wilayah dnd-kit dan wilayah ProseMirror, jadi penanganannya lewat drop handler
ProseMirror yang membaca data drag — bukan dengan memasang sensor dnd-kit di dalam editor (§19A.1).

## 16A.3 Bagian sidebar

```text
Quick actions   Search, Home, Inbox notifikasi (§70)
Favorites       sudah ada
Recents         BARU -- halaman yang baru dibuka, dari localStorage; murni sisi klien
Private         pohon halaman
Footer          Trash, Templates, Settings, New page
```

"Recents" sengaja tidak disimpan di server: ia adalah riwayat penelusuran satu perangkat, bukan
data workspace, dan menyimpannya berarti satu tulis basis data setiap navigasi.

## 16A.4 Multi-select halaman

Shift+klik dan Ctrl+klik memilih beberapa baris; aksi massal: pindahkan, favoritkan, arsipkan,
ekspor. Berguna terutama saat merapikan catatan lama.

---

# 25. Search
Search adalah fitur wajib untuk personal knowledge base.

MVP:

```text
Ctrl + K
```

Search berdasarkan:

- page title
- block text
- database name
- database row

Tahap awal:

**PostgreSQL Full Text Search**

Jika nanti data sangat besar:

```text
PostgreSQL
     |
     v
Meilisearch / OpenSearch
```

Untuk aplikasi personal, kemungkinan PostgreSQL saja sudah cukup lama.

---

# 25A. Desain Full-Text Search

§25 merencanakan Postgres FTS. Yang terbangun adalah `ILIKE '%q%'` atas `content::text`. Itu punya
tiga masalah yang langsung terasa: ia mencocokkan **kunci** JSON dan nama tipe (mencari
"paragraph" mengembalikan hampir setiap halaman), ia tidak bisa memberi peringkat, dan ia memindai
seluruh tabel.

## 25A.1 Generated column, bukan trigger

Kuncinya: `jsonb_to_tsvector` dengan regconfig literal bersifat `IMMUTABLE`, sehingga bisa dipakai
sebagai **generated stored column**. Artinya nol kode pemeliharaan — tidak ada trigger, tidak ada
antrean, tidak ada job reindex. Kesegarannya dijamin Postgres.

```sql
alter table pages add column search_vector tsvector
  generated always as (setweight(to_tsvector('simple', coalesce(title,'')), 'A')) stored;
create index pages_fts_idx on pages using gin (search_vector);

alter table blocks add column search_vector tsvector
  generated always as (jsonb_to_tsvector('simple', coalesce(content,'{}'::jsonb), '["string"]')) stored;
create index blocks_fts_idx on blocks using gin (search_vector);

alter table database_rows add column search_vector tsvector
  generated always as (jsonb_to_tsvector('simple', coalesce(values,'{}'::jsonb), '["string"]')) stored;
create index database_rows_fts_idx on database_rows using gin (search_vector);

create extension if not exists pg_trgm;
create index pages_title_trgm on pages using gin (title gin_trgm_ops);
```

`'["string"]'` mengindeks **hanya nilai string**, bukan kunci — ini sendirian yang memperbaiki bug
"cari `paragraph`, dapat semua halaman".

## 25A.2 Kenapa `'simple'`, bukan `'english'`

Isi catatan bercampur Indonesia dan Inggris. Postgres tidak menyertakan stemmer Indonesia, dan
stemmer Inggris akan merusak token Indonesia ("berlari" tidak akan pernah cocok dengan "lari",
tapi "sedang" bisa diperlakukan salah). `'simple'` — huruf kecil, tanpa stemming — adalah pilihan
yang benar, dengan `pg_trgm` menutupi toleransi salah ketik pada judul.

## 25A.3 Query

```text
Kueri normal    websearch_to_tsquery('simple', q)
                mendukung frasa "dalam kutip" dan -pengecualian

Quick find      q pendek atau sedang diketik ->
                to_tsquery('simple', quote_literal(q) || ':*')  (prefix)
                digabung dengan pencocokan trigram pada judul
```

## 25A.4 Peringkat

```text
ts_rank_cd(search_vector, query)
  x bobot sumber      judul halaman 3.0 | nama database 2.0 | baris 1.2 | blok 1.0
  x peluruhan recency berdasarkan updated_at
```

Satu `ORDER BY` di atas `UNION ALL` dari tiga sumber.

## 25A.5 Bentuk hasil

```text
{ type, pageId, blockId?, rowId?, databaseId?, title, breadcrumb, snippet, rank }
```

`blockId` bermakna **hanya karena §11E**: tanpa id blok yang stabil, tautan "lompat ke bagian ini"
akan menunjuk blok yang sudah tidak ada. Search-ke-anchor adalah dependensi langsung identitas blok.

Cuplikan dibuat dengan `ts_headline` atas teks polos hasil `toPlainText` dari
`BlockTypeRegistry` (§11D.2) — serializer yang sama dengan eksportir Markdown. Satu implementasi,
sehingga cuplikan pencarian dan hasil ekspor tidak pernah berbeda dalam menafsirkan sebuah blok.

Baris database dicocokkan lewat `database_rows.search_vector` lalu diselesaikan ke `page_id`-nya
(§20D), sehingga hasil klik selalu mendarat di halaman sungguhan.

## 25A.6 Filter pencarian

```text
tipe halaman     document | database | whiteboard | diagram
rentang waktu    diubah 7 hari / 30 hari / tahun ini
lokasi           di dalam halaman tertentu beserta anaknya
urutan            relevansi | terakhir diubah
```

---

# 26. Command Palette
Shortcut:

```text
Ctrl + K
```

Menu:

```text
Search
Go to page
Create page
Create database
Create whiteboard
Create diagram
Toggle sidebar
Toggle dark mode
Export
Settings
```

Daftar "Create ..." di command palette dan sidebar diambil dari `ContentTypeRegistry` yang sama (lihat 11A), sehingga menambah tipe page baru di masa depan otomatis muncul di kedua tempat tanpa perubahan manual.

Command palette dapat menjadi pusat navigasi aplikasi.

---

# 27. Keyboard Shortcut
Minimal:

```text
Ctrl + K    Search
Ctrl + P    Page switcher
Ctrl + N    New page
Ctrl + S    Manual save/export trigger jika diperlukan
Ctrl + Z    Undo
Ctrl + Shift + Z    Redo
```

Editor shortcut mengikuti Tiptap.

---

# 58. UX Architecture
Aplikasi harus terasa seperti satu workspace, bukan website biasa.

Layout:

```text
+--------------------------------------------------------+
| Sidebar |                  Content                    |
|         |                                             |
|         |                                             |
|         |                                             |
|         |                                             |
+--------------------------------------------------------+
```

Sidebar dapat:

- collapse
- resize
- remember state

Content:

```text
Icon
Title
Properties
Cover
Blocks
```

---

# 59. Responsive Strategy
Desktop-first karena aplikasi productivity seperti Notion banyak digunakan dalam layar besar.

Breakpoints:

```text
Desktop
Tablet
Mobile
```

Mobile tidak harus memiliki semua fungsi advanced pada versi awal.

Prioritas mobile:

```text
Read
Edit
Search
Create
```

Advanced database editing dapat menjadi tahap berikutnya.
