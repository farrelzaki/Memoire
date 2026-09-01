> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §10, §10A, §10B, §45, §47

---

# 10. Struktur Database
## 10.1 users

Karena aplikasi personal, tabel user sebenarnya opsional.

Jika aplikasi sepenuhnya lokal, tabel ini bahkan dapat dihilangkan.

Jika aplikasi memiliki login lokal untuk mengamankan aplikasi:

```text
users
- id
- email
- password_hash
- name
- avatar
- created_at
- updated_at
```

## 10.2 workspaces

```text
workspaces
- id
- name
- icon
- created_at
- updated_at
```

Untuk single-user, cukup satu workspace default.

## 10.3 pages

```text
pages
- id
- workspace_id
- parent_page_id
- title
- icon
- cover_url
- type            -- 'document' | 'database' | 'whiteboard' | 'diagram' | ...
- is_favorite
- is_archived
- position
- created_at
- updated_at
```

**Kolom `type` adalah perubahan paling penting dari draf sebelumnya.**

Draf sebelumnya mengasumsikan setiap page selalu berisi blocks. Dengan kolom `type`:

- `document` → konten disimpan di tabel `blocks` (seperti sebelumnya).
- `database` → konten disimpan di tabel `databases` + `database_rows`.
- `whiteboard` → konten disimpan di tabel `page_canvases` (lihat 10.11).
- `diagram` → konten juga disimpan di tabel `page_canvases`, dibedakan lewat `canvas_kind`.

Backend menggunakan `type` untuk menentukan service/handler mana yang dipanggil (lihat 11A — Content Type System). Frontend menggunakan `type` untuk menentukan komponen renderer mana yang dipakai di area konten.

`parent_page_id` digunakan untuk hierarchy, dan berlaku sama untuk semua tipe page — whiteboard dan diagram tetap bisa dinested di bawah page lain seperti biasa.

Contoh:

```text
Home
├── College
│   ├── Semester 5
│   ├── Projects
│   └── Notes
├── Personal
└── Ideas
```

## 10.4 blocks

```text
blocks
- id
- page_id
- parent_block_id
- type
- position
- content
- properties
- created_at
- updated_at
```

`content` dan `properties` dapat menggunakan JSONB.

Contoh:

```json
{
  "type": "paragraph",
  "content": [
    {
      "type": "text",
      "text": "Hello World"
    }
  ]
}
```

## 10.5 databases

```text
databases
- id
- page_id
- name
- created_at
- updated_at
```

## 10.6 database_properties

```text
database_properties
- id
- database_id
- name
- type
- config
- position
```

Contoh type:

```text
text
number
select
multi_select
checkbox
date
url
relation
formula
created_time
updated_time
```

## 10.7 database_rows

```text
database_rows
- id
- database_id
- page_id
- values
- position
- created_at
- updated_at
```

`values` dapat menggunakan JSONB.

Konsep penting:

```text
Database Row
    |
    +-- Page
          |
          +-- Blocks
```

Dengan model tersebut, row database dapat memiliki halaman detail sendiri.

## 10.8 database_views

```text
database_views
- id
- database_id
- name
- type
- config
- position
```

View:

```text
table
board
list
calendar
gallery
```

## 10.9 attachments

```text
attachments
- id
- page_id
- block_id
- filename
- mime_type
- size
- storage_key
- metadata
- created_at
```

## 10.10 templates

```text
templates
- id
- name
- icon
- description
- content
- created_at
- updated_at
```

## 10.11 page_canvases (Whiteboard & Diagram)

```text
page_canvases
- id
- page_id
- canvas_kind      -- 'whiteboard' | 'diagram'
- elements         -- JSONB, canvas-specific
- viewport         -- JSONB (zoom, pan/scroll position)
- created_at
- updated_at
```

Satu page dengan `type = 'whiteboard'` atau `type = 'diagram'` memiliki tepat satu baris di `page_canvases`.

`elements` bersifat schema-less by design karena format Excalidraw dan React Flow berbeda:

```json
// whiteboard (Excalidraw-like)
{
  "elements": [
    { "type": "rectangle", "x": 10, "y": 20, "width": 100, "height": 50 },
    { "type": "text", "x": 30, "y": 30, "text": "Ide utama" }
  ]
}
```

```json
// diagram (React Flow-like)
{
  "nodes": [
    { "id": "1", "position": { "x": 0, "y": 0 }, "data": { "label": "Start" } }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" }
  ]
}
```

Karena single-user dan tanpa realtime, autosave canvas memakai strategi sama seperti editor: debounce + PATCH ke `page_canvases`, bukan operational transform / CRDT.

---

# 10A. Perubahan Skema untuk Paritas Notion

§10 menjelaskan sebelas tabel yang ada sekarang. Seksi ini mendaftar perubahan dan tabel baru yang
dibutuhkan fitur-fitur di §71, beserta alasan singkatnya. Setiap perubahan menunjuk seksi yang
membahasnya penuh.

## 10A.1 Perubahan pada tabel yang ada

```text
blocks
+ descendant_ids   uuid[] not null default '{}'   -- §11E.4, id blok bersarang
+ search_vector    tsvector generated stored      -- §25A
  parent_block_id  DINYATAKAN PERMANEN NULL       -- §11E.4

pages
+ database_id      uuid null -> databases(id)     -- §20D, TANPA on delete cascade
+ search_vector    tsvector generated stored      -- §25A
+ settings         jsonb not null default '{}'    -- §35A: fullWidth, smallText, font, locked

databases
+ workspace_id     uuid not null
~ page_id          DIGANTI NAMA jadi owner_page_id -- §20C.2
+ is_inline        boolean not null default false  -- §20C.2
  hapus unique(page_id); ganti partial unique where is_inline = false

database_properties
~ config           diketik ketat per tipe, bukan record bebas  -- §20A.3

database_rows
+ computed         jsonb not null default '{}'    -- §24A, §24B, ditulis HANYA oleh API
+ computed_at      timestamptz null
+ is_archived      boolean not null default false -- §20D.5
+ unique_id_seq    integer null                   -- §20A.2, properti unique_id
+ search_vector    tsvector generated stored      -- §25A

database_views
~ config           divalidasi viewConfigSchema, bukan record bebas -- §21A
```

## 10A.2 Tabel baru

```text
10.12 database_relation_links   -- §23A.1
      id, property_id, from_row_id, to_row_id
      unique (property_id, from_row_id, to_row_id)
      index (to_row_id, property_id)

10.13 page_versions             -- §33A
      id, page_id, version, kind, label, content, storage_key,
      content_hash, size_bytes, created_at
      unique (page_id, version); index (page_id, created_at desc)

10.14 page_links                -- §15A, backlink
      id, source_page_id, source_block_id, target_page_id, target_block_id
      index (target_page_id)
      dibangun ulang setiap kali blok sebuah halaman disimpan

10.15 reminders                 -- §70
      id, source, page_id, database_row_id, property_id, block_id,
      remind_at, recurrence, message, status, created_at, updated_at
      index (status, remind_at)

10.16 notifications             -- §70
      id, kind, title, body, target_page_id, target_row_id, target_block_id,
      is_read, created_at
      index (is_read, created_at desc)

10.17 settings                  -- §35A, key-value untuk satu pengguna
      key text primary key, value jsonb
```

Tabel `templates` (§10.10) sudah ada tapi belum pernah dipakai; ia baru terpakai di Sprint 28
(page template, database row template) tanpa perubahan bentuk.

## 10A.3 Catatan migrasi Drizzle

Drizzle Kit **tidak** menghasilkan tiga hal berikut secara otomatis. Semuanya harus ditulis manual
di file SQL migrasi:

```text
1. Generated column (search_vector)          -- §25A
2. Partial unique index                       -- databases_full_page_uniq, §20C.2
3. Backfill data (blockId ke content lama)    -- §11E.6
```

Ini jebakan yang nyata: `pnpm db:generate` akan menghasilkan migrasi yang terlihat lengkap tapi
diam-diam melewatkan ketiganya.

---

# 10B. Invarian Data

Aturan yang harus benar setiap saat. Sebagian tidak bisa dipaksakan oleh basis data dan hanya
dijaga oleh service layer — justru itu sebabnya ditulis di sini.

## 10B.1 Identitas dan kepemilikan

```text
1. blocks.parent_block_id selalu NULL.
   Blok bersarang tinggal di dalam content JSON, dialamati lewat descendant_ids. (§11E.4)

2. Setiap node blok punya content.attrs.blockId yang unik dalam satu halaman.
   Id tidak pernah diregenerasi untuk konten yang tidak berubah. (§11E)

3. Nama database:
   is_inline = false -> pages.title otoritatif, databases.name dicerminkan
   is_inline = true  -> databases.name otoritatif                          (§20C.5)

4. Row page: pages.type tetap 'document' dan pages.database_id terisi.
   TIDAK ADA pages.type = 'row'.                                           (§20D.1)

5. pages.title sebuah row page selalu sama dengan nilai properti title barisnya,
   dijaga dua arah di service layer.                                       (§20D.4)
```

## 10B.2 Sumber kebenaran nilai

```text
6. database_rows.values  = input pengguna saja.
   database_rows.computed = hasil formula & rollup, ditulis HANYA oleh API.
   Klien tidak pernah menulis computed.                                    (§24A, §24B)

7. Relasi TIDAK PERNAH disimpan di values.
   Satu-satunya sumbernya adalah database_relation_links.                  (§23A.1)

8. created_time, last_edited_time, dan unique_id tidak disalin ke values;
   ketiganya diproyeksikan dari kolom aslinya.                             (§20A.4)

9. Nilai formula volatil (now/today) tidak pernah masuk computed;
   dievaluasi saat baca.                                                   (§24A.3)
```

## 10B.3 Soft delete menang atas cascade

```text
10. Tidak ada FK cascade yang boleh menghapus baris pages.
    Penghapusan yang menyentuh pages ditangani di transaksi service layer.
    Cascade antar tabel konten non-page dibolehkan.                        (§20D.5, §32)
```

Ini tabrakan nyata: `on delete cascade` adalah refleks yang benar untuk sebagian besar relasi baru
(`pages.database_id`, `databases.owner_page_id`), tapi pada apa pun yang berujung ke `pages` ia
melanggar aturan soft delete — halaman akan hilang tanpa pernah singgah di Trash.

## 10B.4 Konfigurasi

```text
11. database_views.config selalu lolos viewConfigSchema dan selalu melewati
    migrateViewConfig saat dibaca maupun ditulis.                          (§21A.2)

12. Tidak ada state view yang hidup hanya di React state.
    Filter, sort, grup, lebar kolom, visibilitas, kalkulasi: semuanya di config. (§21A)

13. Menghapus properti menyapu rujukannya di semua view, formula, dan relation
    dalam satu transaksi.                                                  (§20A.5)
```

## 10B.5 Konsistensi tulis

```text
14. Setiap POST menerima id dari klien.
    Klien selalu mengirimkannya (crypto.randomUUID), sehingga jalur online dan
    offline identik dan tidak perlu pemetaan ulang id sementara.           (§14)

15. Resource yang PATCH-nya bisa digabung oleh outbox offline harus dikirim
    sebagai representasi LENGKAP dari sub-objek yang diubah.
    Berlaku khusus untuk database_rows.values.                             (§14)
```

Invarian 15 saat ini **berlaku secara kebetulan**, bukan karena dijaga: `commitCell` sudah
mengirim seluruh objek `values`, dan `updateRow` di backend memang mengganti kolomnya utuh. Tidak
ada tes atau tipe yang mencegah seseorang mengirim patch parsial nanti — dan begitu itu terjadi,
penggabungan dangkal di `coalesceOutbox` akan menghilangkan field secara diam-diam, hanya saat
offline. Karena itu ia ditulis sebagai invariant, dan Sprint 13 menambahkan tesnya.

---

# 45. Transaction Strategy
Operasi yang mengubah struktur harus memakai database transaction.

Contoh move page:

```text
Begin Transaction
   |
   +-- update old parent
   +-- update new parent
   +-- update position
   |
Commit
```

Contoh delete database:

```text
Begin Transaction
   |
   +-- delete rows
   +-- delete properties
   +-- delete views
   +-- delete database
   |
Commit
```

---

# 47. Database Indexes
Minimal:

```text
pages(workspace_id)
pages(parent_page_id)
pages(updated_at)
pages(is_favorite)

blocks(page_id)
blocks(parent_block_id)
blocks(position)

databases(page_id)
database_rows(database_id)
database_views(database_id)

attachments(page_id)
```

Search index dapat ditambahkan kemudian.
