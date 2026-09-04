> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §20, §20A, §20B, §20C, §20D, §21, §21A, §21B, §22, §22A, §23, §23A, §24, §24A, §24B

---

# 20. Database Engine
Database adalah salah satu fitur yang membuat aplikasi berbeda dari text editor biasa.

## 20.1 Property types MVP

Implementasi awal:

```text
Title
Text
Number
Select
Multi-select
Checkbox
Date
URL
```

Tahap lanjutan:

```text
Relation
Rollup
Formula
Created time
Updated time
```

---

# 20A. Katalog Tipe Properti

Daftar lengkap tipe properti yang harus ada, setara Notion. Tipe yang berhubungan dengan orang lain
(`Person`, `Created by`, `Last edited by`) sengaja dihilangkan — lihat §56.

Setiap tipe didaftarkan ke `PropertyTypeRegistry` (§11D), bukan ditulis langsung ke komponen tabel.

## 20A.1 Sudah ada

```text
title          -- judul baris; selalu ada, tidak bisa dihapus, sinkron dengan pages.title (§20D)
text           -- teks bebas
number         -- angka
select         -- satu pilihan dari daftar opsi
checkbox       -- boolean
date           -- tanggal
url            -- alamat web; bisa ditampilkan sebagai kartu pratinjau (§29A.1)
```

## 20A.2 Ditambahkan

```text
multi_select      -- banyak opsi, tiap opsi punya warna
status            -- seperti select, tapi opsinya dikelompokkan:
                     To-do / In progress / Complete; grup menentukan perilaku default board
email             -- divalidasi bentuknya; aksi salin dan mailto:
phone             -- aksi salin dan tel:
files             -- lampiran; upload ke attachments, atau URL langsung (§29A.3)
created_time      -- turunan, dari database_rows.created_at
last_edited_time  -- turunan, dari database_rows.updated_at
unique_id         -- auto-increment per database, dengan prefix opsional (mis. TUGAS-14)
relation          -- tautan ke baris database lain (§23, §23A)
rollup            -- agregasi atas relation (§24B)
formula           -- ekspresi atas properti lain (§24, §24A)
```

## 20A.3 Config per tipe

`database_properties.config` (JSONB) diketik ketat per tipe lewat discriminated union di
`@memoire/validation` (§39A) — bukan `z.record(z.unknown())` seperti sekarang.

```text
number      { format: 'plain'|'comma'|'percent'|'currency', currency, precision,
              display: 'number'|'bar'|'ring' }
select      { options: [{ id, name, color }] }
multi_select{ options: [{ id, name, color }] }
status      { options: [{ id, name, color, group: 'todo'|'doing'|'done' }],
              defaultOptionId }
date        { includeTime, format, timeFormat,
              endDateEnabled,                       -- rentang tanggal
              reminder: { offsetMinutes, timeOfDay } | null }   -- §70
files       { maxCount }
unique_id   { prefix, nextValue }
relation    { targetDatabaseId, allowMultiple,
              inversePropertyId | null }            -- terisi bila relasi dua arah
rollup      { relationPropertyId, targetPropertyId, fn }        -- §24B
formula     { source, ast, volatile, returnType }               -- §24A
```

## 20A.4 Nilai di `database_rows.values`

`values` menyimpan **input pengguna saja**. Nilai turunan tidak pernah ditulis ke sana.

```text
values     -- diisi pengguna: text, number, select, date, checkbox, files, ...
computed   -- diisi server: formula & rollup (§24A, §24B)
relation   -- TIDAK di JSONB sama sekali; ada di tabel database_relation_links (§23A)
```

Tiga properti turunan tidak disimpan di keduanya karena sudah ada sumbernya:
`created_time` dan `last_edited_time` diproyeksikan dari kolom timestamp baris, dan `unique_id`
punya kolom sendiri (§10). Menyalinnya ke JSONB hanya menciptakan sumber kebenaran kedua.

## 20A.5 Menghapus properti

Menghapus properti menyentuh lebih banyak tempat daripada yang terlihat. Dalam **satu transaksi**:

```text
1. Sapu semua database_views milik database itu:
   buang propertyId dari filter, sorts, properties, calculations, groupBy, subGroupBy
2. Tolak (atau ikut hapus, setelah konfirmasi) formula yang me-referensi properti itu
3. Hapus baris database_relation_links bila tipenya relation, dua arah
4. Hapus key-nya dari values dan computed di semua baris
```

Tanpa langkah 1 dan 2, aplikasi mengumpulkan view yang rusak diam-diam — filter menunjuk properti
yang sudah tidak ada dan hasilnya kosong tanpa penjelasan.

---

# 20B. Kalkulasi & Agregasi

Notion menaruh satu baris ringkasan di bawah setiap kolom tabel, dan satu ringkasan di kepala setiap
kolom board. Saat ini Memoire tidak punya satu pun. Ini murah dibangun dan langsung terasa berguna
untuk perencanaan pribadi ("berapa tugas belum selesai", "total jam minggu ini").

## 20B.1 Daftar fungsi

```text
Umum (semua tipe)
  count_all            -- jumlah baris
  count_values         -- jumlah baris yang propertinya terisi
  count_unique         -- jumlah nilai unik
  count_empty          -- jumlah kosong
  count_not_empty      -- jumlah terisi
  percent_empty
  percent_not_empty

Angka (number, formula bertipe number, rollup bertipe number)
  sum
  average
  median
  min
  max
  range                -- max - min

Tanggal (date, created_time, last_edited_time, formula bertipe date)
  earliest_date
  latest_date
  date_range           -- selisih latest - earliest

Checkbox
  checked
  unchecked
  percent_checked
  percent_unchecked
```

Fungsi yang tersedia untuk sebuah kolom ditentukan oleh `PropertyTypeRegistry.calculations`
(§11D) — bukan oleh percabangan `switch` di komponen view. Menambah tipe properti baru berarti
mendeklarasikan kalkulasi apa yang masuk akal untuknya, sekali, di satu tempat.

## 20B.2 Di mana dihitung

Di SQL, dalam permintaan `POST /databases/:id/query` yang sama dengan pengambilan baris (§22A) —
bukan di klien atas baris yang sudah diambil. Alasannya sederhana: dengan pagination, klien tidak
pernah memegang semua baris, jadi menghitung `sum` di klien akan menghasilkan jumlah dari satu
halaman saja. Ini kesalahan yang mudah terjadi dan sulit dilihat.

```text
resp.calculations   -- { [propertyId]: nilai }  untuk seluruh hasil filter, bukan satu halaman
resp.groups[].calculations
                    -- ringkasan per grup, untuk board dan tabel ber-grup
```

Kalkulasi dihitung **setelah filter, sebelum pagination**.

## 20B.3 Penyimpanan

Pilihan kalkulasi per kolom disimpan di `database_views.config.calculations`
(`{ [propertyId]: calculationId }`, §21A) — sama seperti semua state view lain, ia bertahan setelah
reload. Nilai hasilnya tidak pernah disimpan; selalu dihitung ulang saat query.

---

# 20C. Inline & Linked Database

Di Notion sebuah database tidak harus menjadi satu halaman penuh. Ia bisa ditanam di tengah
dokumen (*inline*), dan view atas database yang sama bisa muncul di halaman lain (*linked view*).
Ini salah satu hal yang membuat database Notion terasa hidup: satu sumber data, banyak sudut
pandang, di tempat yang relevan.

## 20C.1 Tabrakan dengan skema sekarang

```text
databases.page_id   uuid NOT NULL UNIQUE
```

Constraint ini mengunci "satu database = satu halaman". Database inline melanggarnya dua kali:
satu dokumen bisa memuat beberapa database, dan sebuah database inline tidak memiliki halaman
sendiri.

## 20C.2 Perubahan skema

```text
databases
- id
- workspace_id     BARU, not null
- owner_page_id    DIGANTI NAMA dari page_id; not null
                   halaman tempat database ini secara fisik tinggal
- is_inline        BARU, boolean not null default false
- name
- created_at, updated_at

-- hapus unique constraint lama pada page_id, ganti dengan partial unique:
create unique index databases_full_page_uniq
  on databases (owner_page_id) where is_inline = false;
```

Partial unique index inilah kuncinya: invariant asli ("satu halaman bertipe `database` punya tepat
satu database") tetap dijaga oleh basis data, sementara satu halaman `document` boleh memuat
sebanyak apa pun database inline.

## 20C.3 Inline dan linked adalah blok yang sama

```text
blocks.type = 'database_view'
content.attrs = {
  blockId,                 -- §11E
  databaseId,
  viewId,                  -- view milik blok ini sendiri
  mode: 'inline' | 'linked'
}
```

Bedanya hanya siapa pemilik databasenya:

```text
inline   -- databases.owner_page_id == halaman tempat blok ini berada
linked   -- databases.owner_page_id menunjuk halaman lain
```

**Setiap blok punya baris `database_views` sendiri.** Ini alasan konkret kenapa konfigurasi view
wajib per-view dan tersimpan (§21A): dua linked view atas database yang sama, di dua halaman,
harus bisa punya filter dan sort yang berbeda. Dengan state view di `useState` seperti sekarang,
fitur ini secara harfiah tidak mungkin dibangun.

## 20C.4 Siklus hidup dan kasus tepi

```text
Hapus halaman pemilik
  owner_page_id on delete cascade. Karena halaman di-soft delete (§32), cascade baru
  benar-benar berjalan saat permanent delete dari Trash.

Database yang ditunjuk sudah tidak ada
  Blok merender state "Database ini sudah dihapus" beserta tombol hapus blok.
  Tidak pernah crash, tidak pernah 500.

Menghapus database yang punya linked view di tempat lain
  Diizinkan, tapi diberi peringatan beserta jumlah dan daftar halaman perujuk.
  Enumerasi perujuk:
    select ... from blocks where content @> '{"attrs":{"databaseId":"..."}}'
  membutuhkan: create index blocks_content_gin on blocks using gin (content jsonb_path_ops);

Konversi inline -> halaman penuh
  Satu transaksi: buat page baru, set is_inline=false, arahkan owner_page_id ke page itu,
  ganti blok lama dengan blok link_to_page.
```

## 20C.5 `databases.name` versus `pages.title`

Dua sumber kebenaran untuk "nama database" sudah ada sejak sekarang. Aturannya ditulis di §10B:

```text
is_inline = false  -> pages.title otoritatif; databases.name dicerminkan oleh service layer
is_inline = true   -> databases.name otoritatif (tidak ada halaman yang mewakilinya)
```

---

# 20D. Row Page

Di Notion setiap baris database **adalah** sebuah halaman: diklik, ia terbuka dengan panel properti
di atas dan area dokumen bebas di bawahnya. Ini yang membuat database Notion bukan sekadar
spreadsheet — sebuah tugas bisa memuat catatan, checklist, dan lampirannya sendiri.

Kolom `database_rows.page_id` sudah ada di skema sejak awal tapi tidak pernah diisi.

## 20D.1 Row page bukan tipe konten baru

```text
pages.type      tetap 'document'
pages.database_id   BARU, uuid null, references databases(id)   -- TANPA on delete cascade
```

**Jangan menambahkan `pages.type = 'row'`.** ContentTypeRegistry (§11A) mengatur *strategi render*,
dan row page dirender sebagai dokumen biasa ditambah panel properti di atasnya — bukan mesin render
yang berbeda. Menjadikannya tipe konten berarti menduplikasi seluruh jalur dokumen. Ini kesalahan
belok yang paling mungkin terjadi di area ini; karena itu ditulis eksplisit di §10B dan CLAUDE.md.

## 20D.2 Dibuat di depan, bukan malas

Halaman dibuat dalam transaksi yang sama dengan barisnya, bukan saat pertama kali dibuka.
Pembuatan malas memaksa setiap konsumen bercabang ("apakah baris ini sudah punya halaman?") dan
membuat sinkronisasi judul jadi ambigu. Biayanya satu baris murah per baris database.

```text
parent_page_id  = databases.owner_page_id
                  supaya breadcrumb bekerja apa adanya, tanpa kasus khusus
```

## 20D.3 Menjaga row page keluar dari sidebar

Kalau tidak difilter, membuat 200 baris akan membanjiri sidebar dengan 200 halaman. Pengecualiannya
hanya di dua tempat — bukan tersebar:

```text
PagesService.findAll()
  tambahkan and(isNull(pages.databaseId))
  ini yang dikonsumsi sidebar, command palette, dan buildPageTree sekaligus

PagesService.findOne(id)
  TIDAK difilter; row page tetap bisa dibuka lewat URL langsung

PagesService.copyPageTree()
  lewati anak yang database_id-nya tidak null
  kalau tidak, duplikasi halaman database menyalin setiap baris dua kali:
  sekali lewat duplicateForPage, sekali lagi lewat penelusuran anak
```

Poin ketiga adalah bug nyata yang akan muncul saat §20D dipasang di atas kode duplikasi yang sudah
ada sekarang. Dicatat di sini supaya tidak ditemukan lewat data yang rusak.

## 20D.4 Sinkronisasi judul

```text
pages.title  <->  values[titlePropertyId]
```

Dijaga dua arah di service layer (`DatabaseRowsService.update` dan `PagesService.update`), dalam
satu transaksi. Tanpa trigger basis data — business logic tinggal di service layer sesuai konvensi
proyek, dan trigger membuat perilakunya tidak terlihat dari kode.

## 20D.5 Trash

```text
database_rows.is_archived   BARU
```

Mengarsipkan row page mengarsipkan barisnya, dan sebaliknya, dalam satu transaksi.

**Tidak ada `on delete cascade` dari `databases` ke `pages`.** Cascade akan menghapus keras baris
`pages`, yang bertentangan langsung dengan aturan soft delete (§32). Menghapus database
mengarsipkan row page-nya lewat transaksi service; penghapusan permanen baru menghapus barisnya.
Ini tabrakan nyata antara FK cascade dan aturan soft delete, dan berlaku umum — lihat §10B.

## 20D.6 Membuka baris

```text
side peek     -- panel kanan, halaman di belakangnya tetap terlihat (default)
center peek   -- modal di tengah
full page     -- navigasi biasa ke /[pageId]
```

Pilihannya per view, di `config.openAs` (§21A). Search mengembalikan row page dengan breadcrumb
`Nama DB > Judul Baris` dan menavigasi ke `/[pageId]`, dengan `?peek=1` opsional untuk membuka
langsung sebagai side peek.

---

# 21. Database Views
## Table

```text
| Name | Status | Priority | Due Date |
```

## Board

```text
TODO
 ├── Task A
 └── Task B

IN PROGRESS
 └── Task C

DONE
 └── Task D
```

## List

```text
Task A
Task B
Task C
```

## Calendar

```text
       August
Mon Tue Wed Thu Fri
            1   2
3   4   5   6   7
```

## Gallery

Card-based view untuk content visual.

---

# 21A. Skema View Config

Ini gap terbesar antara Memoire dan Notion hari ini, dan yang paling sering terasa: filter dan sort
hidup di `useState` dan hilang begitu halaman dimuat ulang. `database_views.config` ada di skema
tapi hampir tidak dipakai, dan divalidasi sebagai `z.record(z.unknown())` — artinya tidak
divalidasi sama sekali.

**Invariant: tidak ada state view yang boleh tinggal di React state.** Satu-satunya pengecualian
adalah isi dialog filter yang sedang diketik sebelum ditekan "Terapkan".

## 21A.1 Bentuk config

Skema ber-versi, discriminated union per tipe view, tinggal di `@memoire/validation` (§39A) supaya
frontend dan backend memakai definisi yang sama persis.

```text
base (semua view)
  version         literal 1
  filter          FilterGroup | null          -- bersarang, AND/OR (§22)
  sorts           [{ propertyId, direction }] -- multi-level, maks 10
  properties      [{ propertyId, visible, width? }]
                  URUTAN array ini = urutan kolom
  calculations    { [propertyId]: calculationId }        -- §20B
  pageSize        25..500, default 50
  openAs          'side' | 'center' | 'full'             -- §20D.6
  locked          boolean
  search          string                                 -- pencarian dalam view

table     rowHeight 'short'|'medium'|'tall', wrapCells, showRowNumbers, groupBy?
board     groupBy (wajib), subGroupBy?, cardSize, cardPreview, colorByGroup, collapsedGroups[]
calendar  dateProperty (wajib), endDateProperty?, showWeekends, span 'month'|'week'
gallery   cardSize, cardPreview, fitImage
list      -- hanya base
timeline  startProperty (wajib), endProperty?, zoom, showTable

collapsedGroups (Sprint 21) — array kunci grup yang kartunya sedang disembunyikan:
  `optionId` di level atas, `optionId:subOptionId` saat sub-grouping aktif,
  `__empty__` untuk kolom "no status". Bukan `GroupConfig` bertipe tersendiri
  dengan `hideEmpty`/`order[]` — urutan kolom board mengikuti urutan
  `config.options[]` milik properti select/status itu sendiri. Menulis ulang
  urutan opsi lewat `PATCH /database-properties/:id` sudah didukung server,
  tapi UI drag-untuk-mengurutkan opsi sendiri belum dibangun Sprint 21 (belum
  ada editor opsi untuk properti yang sudah dibuat sama sekali, terlepas dari
  drag) — dicatat di §71 sebagai BELUM, bukan gap Sprint 21 secara spesifik.

cardPreview
  'none' | 'cover' | 'content' | { propertyId }   -- properti files sebagai gambar kartu
```

## 21A.2 Versi dan migrasi

```text
migrateViewConfig(raw: unknown, properties: DatabaseProperty[]): ViewConfig
```

Fungsi murni, switch pada `raw.version`, mengisi default untuk apa pun yang tidak dikenali.
Dijalankan **saat baca dan saat tulis**, sehingga config yang ditulis build lama diperbaiki
transparan tanpa migrasi data. Field `version` adalah satu-satunya hal yang memungkinkan skema ini
berevolusi tanpa menyentuh basis data.

## 21A.3 Integritas rujukan

`config` penuh dengan `propertyId`. Sebuah properti bisa dihapus kapan saja.

```text
Saat properti dihapus  -- sapu semua view database itu dalam satu transaksi (§20A.5)
Saat config dibaca     -- migrateViewConfig menerima daftar properti hidup dan
                          membuang id yang sudah tidak ada, defensif
```

Dua lapis ini disengaja: yang pertama menjaga data tetap bersih, yang kedua menjaga UI tetap hidup
kalau lapis pertama pernah terlewat (misalnya karena migrasi manual atau restore backup lama).

## 21A.4 Jalur tulis

```text
PATCH /databases/:dbId/views/:viewId   { config }
```

Debounce 400ms di klien, optimistik lewat TanStack Query. Menggeser lebar kolom atau melipat grup
tidak boleh terasa seperti menunggu jaringan.

---

# 21B. View Baru: List dan Timeline

Melengkapi lima view di §21 menjadi tujuh, setara Notion.

## 21B.1 List

View paling sederhana, dan justru paling sering dipakai untuk catatan pribadi: satu baris per
entri, tanpa garis kolom, hanya judul plus beberapa properti kecil di kanan.

```text
Judul halaman                                    Tag    12 Mei
Judul lain yang lebih panjang                    Ide    13 Mei
```

Tidak punya konfigurasi khusus di luar `base` (§21A) — kolom yang tampil diatur lewat
`properties[].visible` seperti view lain.

## 21B.2 Timeline (Gantt)

```text
                Mei                          Juni
        10  11  12  13  14  15       1   2   3   4
Riset   [============]
Desain          [==============]
Bangun                      [====================]
```

```text
Konfigurasi
  startProperty   properti date, wajib
  endProperty     properti date; bila null, batang berdurasi satu hari
                  (atau memakai endDate dari properti date ber-rentang, §20A.3)
  zoom            day | week | month | quarter | year
  showTable       tampilkan tabel di sebelah kiri, bisa digeser lebarnya

Interaksi (§19A, dnd-kit)
  geser batang    -- menggeser start dan end sekaligus
  tarik tepi      -- mengubah durasi
  keduanya menulis balik ke properti date lewat PATCH baris biasa
```

Timeline tidak menyimpan apa pun sendiri: posisi batang selalu turunan dari properti tanggal.
Tidak ada tabel "timeline" dan tidak ada state posisi tersimpan — kalau tanggalnya berubah dari
view mana pun, timeline langsung ikut.

**Dependency antar tugas (garis penghubung) tidak dibangun.** Notion sendiri tidak punya; ia
membutuhkan model graf terpisah dan penyelesaian jadwal, yang jauh melampaui kebutuhan perencanaan
pribadi. Bila suatu saat diperlukan, relasi antar baris sudah tersedia lewat §23A.

## 21B.3 Chart

Notion punya view chart (bar, line, donut). Ditunda, bukan dikecualikan: nilainya jauh di bawah
enam view lain untuk penggunaan pribadi, dan ia bergantung pada §20B (agregasi) yang harus stabil
lebih dulu. Dicatat di §71 sebagai prioritas rendah, bukan sebagai sesuatu yang hilang.

---

# 22. Filtering dan Sorting
Database harus mendukung:

```text
Filter
Sort
Group
```

Contoh filter:

```text
Status = In Progress
```

Contoh sort:

```text
Priority DESC
Due Date ASC
```

Contoh group:

```text
Group by Status
```

Jangan implementasikan query builder yang terlalu kompleks di MVP.

---

# 22A. Query Engine & Batas Evaluasi

Sekarang filter dan sort dijalankan di browser atas seluruh baris yang sudah diambil. Itu cukup
untuk satu filter dan seratus baris, tapi runtuh begitu ada pagination, formula, rollup, dan
agregasi — `sum` atas satu halaman baris bukan `sum` yang benar.

**Aturan: server adalah kontrak. Klien hanya boleh melakukan pratinjau.**

## 22A.1 Endpoint

```http
POST   /databases/:id/query
```

```text
body
  viewId       view yang dipakai (filter/sort/group diambil dari config-nya)
  overrides    Partial<ViewConfig>, opsional
               dipakai untuk mempratinjau filter yang belum disimpan
  cursor       keyset cursor, opsional
  limit        default dari config.pageSize

response
  rows         baris untuk halaman ini
  groups       [{ key, count, calculations, cursor }]   -- bila groupBy aktif
  calculations { [propertyId]: nilai }                  -- atas SELURUH hasil filter
  total        jumlah baris setelah filter
  nextCursor   null bila habis
  computedAt   kapan nilai turunan dihitung (§14, penanda basi saat offline)
```

Operasi tulis baris tetap REST biasa (`POST /database-rows`, `PATCH /database-rows/:id`). Hanya
pembacaan yang lewat `/query`.

## 22A.2 Pembagian kerja klien-server

```text
Server   filter, sort, group, agregasi, pagination    -- selalu, dan selalu menang
Klien    applyFilter / applySort yang sudah ada di database.lib.ts
         dipakai HANYA sebagai overlay optimistik selama request berjalan,
         supaya mengetik di kotak filter terasa instan
```

Overlay dimatikan begitu jumlah baris melebihi satu halaman. Di atas ambang itu, menampilkan hasil
klien yang tidak lengkap lebih buruk daripada menampilkan spinner — jawaban yang salah tapi
terlihat yakin adalah kegagalan yang paling mahal di sini.

`database.lib.ts` yang ada sekarang **tetap dipakai** dan diperluas, bukan dibuang.

## 22A.3 Operator filter per tipe

Operator ditentukan oleh `PropertyTypeRegistry.filterOperators` (§11D).

```text
text, title, url, email, phone
  is, is_not, contains, does_not_contain, starts_with, ends_with,
  is_empty, is_not_empty

number
  =, !=, >, <, >=, <=, is_empty, is_not_empty

select, status
  is, is_not, is_any_of, is_none_of, is_empty, is_not_empty

multi_select
  contains, does_not_contain, is_empty, is_not_empty

checkbox
  is (true/false)

date
  is, is_before, is_after, is_on_or_before, is_on_or_after, is_within,
  is_empty, is_not_empty
  nilai relatif: today, tomorrow, yesterday, this_week, past_week,
                 next_week, past_month, next_month, past_year, next_year

files
  is_empty, is_not_empty

relation
  contains, does_not_contain, is_empty, is_not_empty

formula, rollup
  mengikuti operator dari tipe hasilnya
```

Operator lama (`equals`, `not_equals`) dipetakan ke `is`/`is_not` oleh `migrateViewConfig`
(§21A.2) sehingga view yang sudah ada tidak rusak.

## 22A.4 Grup filter bersarang

```text
FilterGroup
  conjunction  'and' | 'or'
  rules        [FilterRule | FilterGroup]     -- rekursif, maks 50 aturan

Contoh
  AND
    Status is_any_of [Doing, Todo]
    OR
      Due is_within this_week
      Priority is High
```

Diterjemahkan langsung menjadi ekspresi `WHERE` bersarang. Kedalaman dibatasi (3 tingkat di UI)
karena di luar itu tidak ada yang bisa membacanya lagi.

## 22A.5 Indeks dan batas jujur

Id properti adalah UUID dinamis, sehingga **indeks ekspresi per properti tidak bisa dibuat secara
umum** tanpa menjalankan DDL saat runtime — yang tidak akan dilakukan.

```sql
create index database_rows_values_gin
  on database_rows using gin (values jsonb_path_ops);
create index database_rows_db_pos
  on database_rows (database_id, position);
```

```text
Dilayani indeks    equality dan containment: select, status, checkbox, multi_select,
                   relation-presence. Ini mayoritas filter yang benar-benar dipakai.
Tidak dilayani     range dan sort atas text/number/date -> scan di dalam SATU database,
                   lalu sort atas (values->>'<id>')::numeric / ::timestamptz
```

Ini **batas desain, bukan kelalaian**: database pribadi berukuran 10^2 sampai 10^4 baris, dan
Postgres menyortir 10^4 ekstraksi jsonb dalam hitungan milidetik. Menukar kesederhanaan itu dengan
mesin indeks tersendiri sekarang adalah optimasi tanpa masalah.

Jalan keluar bila suatu saat sebuah database melewati sekitar 50 ribu baris:

```text
database_row_index   (row_id, property_id, text_value, num_value, date_value, bool_value)
  dipelihara di transaksi yang sama dengan penulisan baris, dengan composite index
```

**Didesain di sini supaya jalur migrasinya tertulis, tapi tidak dibangun.**

## 22A.6 Pagination

Keyset (cursor pada tuple kunci sort + `id`), bukan `OFFSET`. `OFFSET` melambat linear dan
melewatkan baris ketika ada penyisipan di tengah scroll — keduanya terasa persis seperti bug.

Tanpa sort eksplisit, tuple kunci itu bukan cuma `id` — `position` (§19A.4, ADR-22) ikut jadi
kolom sort implisit (`buildSortSql`/`buildKeysetSql`), supaya urutan drag manual sungguhan
mengubah apa yang terlihat, dan keyset cursor-nya tetap konsisten dengan urutan itu (menggeser
sebuah baris pertengahan scroll berperilaku sama seperti insert baris baru pertengahan scroll —
sudah ditoleransi desain keyset ini sejak awal).

---

# 23. Relation
Tahap lanjutan:

```text
Database A
    |
    | relation
    v
Database B
```

Contoh:

```text
Projects
    |
    +---- Tasks
```

Sebuah task dapat menunjuk ke project.

---

# 23A. Storage Relation

Relation menautkan baris di satu database ke baris di database lain. Ini fondasi rollup (§24B) dan
satu-satunya cara membuat data pribadi saling terhubung — Proyek ke Tugas, Buku ke Catatan,
Resep ke Bahan.

## 23A.1 Tabel, bukan JSONB

```text
database_relation_links
- id
- property_id    -> database_properties(id) on delete cascade
- from_row_id    -> database_rows(id) on delete cascade
- to_row_id      -> database_rows(id) on delete cascade
unique (property_id, from_row_id, to_row_id)
index (to_row_id, property_id)
```

Ini penerapan langsung Prinsip 4 (§57), bukan pengecualiannya: relation **di-filter, di-sort, dan
di-relasikan**, jadi ia mendapat tabel sungguhan. Menyimpan array id di `values` akan memaksa
setiap lookup terbalik menjadi pemindaian JSONB.

Index `(to_row_id, property_id)` wajib, bukan opsional: ia melayani pertanyaan "baris mana saja
yang menunjuk ke baris ini", yang dijalankan setiap kali sebuah baris berubah untuk mencari rollup
yang perlu dihitung ulang (§24B). Tanpa index itu, setiap edit memindai seluruh tabel.

`values` tidak pernah menyimpan relasi. API memproyeksikannya saat membaca.

## 23A.2 Relasi dua arah

```text
database_properties (A) config.inversePropertyId -> id properti di database B
database_properties (B) config.inversePropertyId -> id properti di database A
```

Dua baris properti yang saling menunjuk. Service layer menulis kedua arah dalam satu transaksi,
sehingga tidak mungkin ada keadaan setengah tertaut.

```text
Satu arah   hanya satu properti; database lawan tidak menampilkan apa pun
Dua arah    kedua database menampilkan kolomnya masing-masing
```

Mengubah satu arah menjadi dua arah membuat properti pasangan di database lawan dan mengisi
tautannya; mengubah kembali menghapus properti pasangan itu, dengan konfirmasi.

## 23A.3 Menghapus

```text
Hapus baris        cascade menghapus tautan dari dua arah
Hapus properti     cascade menghapus tautannya, plus buang properti pasangan bila dua arah (§20A.5)
Hapus database     tolak bila masih ada relation dari database lain yang menunjuknya,
                   sebutkan database mana. Menghapus diam-diam akan mengosongkan kolom
                   di tempat yang tidak sedang dilihat pengguna.
```

---

# 24. Formula
Formula sebaiknya dikerjakan setelah database dasar stabil.

Contoh:

```text
if(status == "Done", 100, 50)
```

atau:

```text
price * quantity
```

Jangan langsung membuat formula language besar. Mulai dari parser sederhana atau expression evaluator yang aman.

---

# 24A. Bahasa Formula

§24 menyarankan evaluator ekspresi sederhana dan memperingatkan agar tidak langsung membangun
bahasa besar. Peringatan itu tetap berlaku; yang berubah adalah bahasanya sekarang punya
spesifikasi tertulis dan batas yang jelas.

## 24A.1 Paket sendiri

```text
packages/formula/     @memoire/formula
  tokenizer  -> parser (Pratt) -> AST (diketik Zod di @memoire/validation) -> evaluator
```

Dipakai **identik** di dua sisi: frontend untuk pratinjau langsung dan pesan error saat mengetik,
backend untuk nilai otoritatif. Satu implementasi, jadi tidak mungkin ada selisih antara angka yang
dilihat pengguna saat mengetik dan angka yang tersimpan.

Murni, tanpa dependensi kecuali `date-fns`. Ini satu-satunya tempat di seluruh kode di mana bug
tidak terlihat sampai angka seseorang diam-diam salah — karena itu porsi unit test-nya paling berat
(§40).

## 24A.2 Pustaka fungsi

```text
Operator      + - * / %  = != > < >= <=  and or not  ? :
Logika        if(cond, a, b), and(), or(), not(), empty(x)
Teks          concat, join, length, slice, contains, replace, replaceAll,
              test, lower, upper, trim, format
Angka         toNumber, round, floor, ceil, abs, sqrt, pow, min, max, mod
Tanggal       now, today, dateAdd, dateSubtract, dateBetween, dateRange,
              formatDate, timestamp, year, month, day, hour, minute
Akses         prop("Nama Properti")
```

`prop()` merujuk **nama** properti, seperti Notion, tapi disimpan sebagai id di AST. Mengganti nama
properti tidak merusak formula; sumber teksnya ditulis ulang saat ditampilkan.

## 24A.3 Formula volatil — keputusan yang paling menentukan

Formula yang memakai `now()` atau `today()` berubah nilainya tanpa ada yang mengeditnya.

```text
Ditandai volatile saat parse
Tidak pernah masuk database_rows.computed
Dievaluasi saat baca, di dalam response API
```

Ini menghapus kebutuhan job harian "hitung ulang semua baris karena tanggalnya berganti" — job yang
akan menyentuh setiap baris di setiap database setiap tengah malam, untuk hasil yang mayoritasnya
tidak berubah.

**Konsekuensinya ditulis terbuka, bukan disembunyikan:** formula volatil tidak bisa di-filter atau
di-sort di SQL, karena nilainya tidak ada di basis data. Editor properti memberi peringatan saat
formula yang ditulis ternyata volatil; filter atasnya dievaluasi di lapisan API setelah pengambilan
data, dengan batas jumlah baris yang tegas.

Pola paling umum ("jatuh tempo dalam 3 hari") tetap bisa dilakukan tanpa formula volatil, lewat
filter tanggal relatif (`is_within next_week`, §22A.3) yang dijalankan di SQL.

## 24A.4 Graf dependensi dan siklus

```text
FormulaGraphService
  membangun DAG per database dari config properti:
    formula -> properti yang dirujuk prop()
    rollup  -> relation property + target property
  di-cache di Map biasa berkunci databaseId
  di-invalidasi saat properti apa pun berubah
```

Cache di memori proses sudah cukup — satu proses, satu pengguna. Tidak ada alasan menambah Redis.

Deteksi siklus: DFS pewarnaan putih/abu/hitam saat properti dibuat atau diubah. Bila ada siklus,
tolak dengan `400` **beserta jalur siklusnya** (`Status -> Prioritas -> Status`) — pesan "circular
reference detected" tanpa jalur memaksa pengguna menebak. Referensi ke diri sendiri ditolak sama.

## 24A.5 Kapan dihitung ulang

```text
1. Nilai baris berubah
   hitung ulang formula baris itu, urut topologis, DI TRANSAKSI YANG SAMA.
   Pekerjaannya terbatas, jadi tidak ada jeda yang terasa.

2. Config properti berubah (formula diedit, rollup dialihkan)
   hitung ulang semua baris database itu, dipecah 500 baris per batch lewat
   job sekali-jalan @nestjs/schedule supaya request HTTP langsung selesai.
   View menampilkan banner "menghitung ulang..." berdasarkan computed_at.

3. Baris terkait berubah
   cari dependennya lewat database_relation_links (to_row_id, property_id),
   hitung ulang rollup mereka. KEDALAMAN DIBATASI 1 HOP.
```

Batas 1 hop berarti rollup-atas-rollup dan formula yang merujuk rollup lintas dua database tidak
didukung di v1. Editor properti **menolak mengonfigurasinya**, bukan menghitungnya dengan salah.
Rantai yang lebih dalam membutuhkan antrean pekerjaan untuk invalidasi yang benar, dan antrean
berarti Redis — yang tidak boleh ditambahkan (§56).

---

# 24B. Rollup

Rollup meringkas properti dari baris-baris yang tertaut lewat sebuah relation (§23A). Ini yang
membuat "Proyek" bisa menampilkan total jam dari semua "Tugas" miliknya tanpa menghitung manual.

## 24B.1 Konfigurasi

```text
config
  relationPropertyId   relation mana yang diikuti
  targetPropertyId     properti apa di database seberang yang diringkas
  fn                   fungsi agregasi
```

## 24B.2 Fungsi

```text
show_original      tampilkan nilainya apa adanya, sebagai daftar
count_all, count_values, count_unique, count_empty, count_not_empty,
percent_empty, percent_not_empty
sum, average, median, min, max, range
earliest_date, latest_date, date_range
checked, unchecked, percent_checked, percent_unchecked
```

Daftar yang sama dengan §20B — dan memang sengaja: keduanya membaca dari
`PropertyTypeRegistry.calculations` (§11D), sehingga menambah satu fungsi agregasi otomatis
tersedia di kalkulasi kolom maupun rollup. Dua fitur, satu definisi.

## 24B.3 Penyimpanan dan perhitungan

Hasil rollup dimaterialisasi ke `database_rows.computed`, sama seperti formula:

```text
values     input pengguna
computed   hasil formula dan rollup, ditulis HANYA oleh API
```

Inilah alasan materialisasi dilakukan: karena hasilnya ada sebagai data, mesin query (§22A) bisa
mem-filter, menyortir, dan mengagregasi rollup **dengan SQL yang sama persis** seperti properti
biasa. Tanpa materialisasi, setiap view yang menyentuh rollup harus mengambil semua baris lebih
dulu, dan pagination jadi mustahil.

Klien tidak pernah menulis `computed`. Nilai turunan otoritatif di server (§14, §57).

## 24B.4 Invalidasi

Saat sebuah baris berubah, baris mana yang rollup-nya jadi basi?

```sql
select from_row_id
  from database_relation_links
 where to_row_id = :changed and property_id = :relation_property
```

Persis pertanyaan yang dilayani index `(to_row_id, property_id)` di §23A.1. Dependen ditemukan
lalu dihitung ulang di transaksi yang sama.

Kedalaman dibatasi 1 hop (§24A.5): rollup tidak boleh menjadi target rollup lain. Editor properti
menolak konfigurasi seperti itu dengan penjelasan, bukan menerimanya lalu memberi angka yang salah.
