> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §11, §11E, §12, §12A, §12B, §13, §17, §18, §18A, §19, §19A

---

# 11. Block System
Block adalah inti dari aplikasi.

## 11.1 Block type MVP

Wajib:

```text
paragraph
heading_1
heading_2
heading_3
bullet_list
ordered_list
todo
quote
code
divider
image
link
```

## 11.2 Block type lanjutan

```text
callout
bookmark
file
video
audio
toggle
synced_block
embed
table
math
```

## 11.3 Page block

Page juga dapat direpresentasikan sebagai block/container tertentu bila diperlukan untuk nested page.

---

# 11E. Identitas Blok

Seksi ini menyelesaikan satu keputusan yang menghalangi enam fitur lain sekaligus. Ia harus
dikerjakan sebelum synced block, backlink, komentar per-blok, anchor hasil pencarian, diff versi,
dan reminder per-blok — semuanya bergantung pada blok yang punya identitas tetap.

## 11E.1 Masalahnya

`BlocksService.replace` menghapus seluruh baris blok sebuah halaman lalu menyisipkannya kembali:

```text
delete from blocks where page_id = :id
insert into blocks ...
```

Artinya setiap penyimpanan otomatis — setiap 800ms saat mengetik — melahirkan UUID baru untuk
setiap blok. Apa pun yang menunjuk ke sebuah blok akan menunjuk ke sesuatu yang sudah tidak ada,
satu ketukan tombol kemudian.

## 11E.2 Id tinggal di dokumen, bukan di basis data

Ekstensi Tiptap `BlockId` menambahkan atribut global `blockId` ke setiap node level-blok,
dirender sebagai `data-block-id`.

```text
Plugin ProseMirror dengan appendTransaction, pada setiap perubahan dokumen:
  1. isi blockId = crypto.randomUUID() untuk node blok yang masih kosong
  2. deteksi DUPLIKAT dengan menelusuri dokumen memakai Set, lalu
     regenerasi kemunculan kedua
  3. jangan pernah menyentuh id yang sudah ada dan unik
```

Langkah 2 adalah yang membedakan implementasi yang benar dari yang naif. Menyalin sebuah blok
(paste, atau Ctrl+D) menghasilkan dua node dengan `blockId` sama; tanpa deteksi duplikat, upsert
di §11E.3 akan menulis dua baris ke id yang sama dan salah satunya hilang diam-diam.

`docToBlocks()` di `apps/web/lib/blocks.ts` mengembalikan `{ id, type, content }`;
`blocksToDoc()` sudah mengembalikan `content` apa adanya, sehingga id bertahan melewati reload
tanpa perubahan tambahan.

## 11E.3 Simpan jadi upsert, bukan ganti total

`PUT /pages/:id/blocks` menerima array terurut `[{ id, type, content }]`. Dalam satu transaksi:

```sql
insert into blocks (id, page_id, type, content, position, descendant_ids, updated_at)
values ...
on conflict (id) do update set
  type           = excluded.type,
  content        = excluded.content,
  position       = excluded.position,
  descendant_ids = excluded.descendant_ids,
  updated_at     = case when blocks.content is distinct from excluded.content
                        then now() else blocks.updated_at end;

delete from blocks where page_id = $1 and id <> all($2::uuid[]);
```

Penjaga `case when ... is distinct from` membuat pengurutan ulang murni tidak menaikkan
`updated_at`. Itu penting supaya kebijakan snapshot versi (§33A) tidak mencatat versi baru hanya
karena sebuah blok digeser.

Server memvalidasi setiap id berbentuk UUID dan unik dalam payload. Bila klien mengirim id ganda
atau kosong, server membuatkan yang baru dan response (`.returning()`) menjadi daftar kanonik yang
direkonsiliasi editor ke dalam atribut node.

## 11E.4 Blok bersarang tetap di JSON

Kolom, toggle, sel tabel, dan item list hidup di dalam subtree sebuah node level-atas.
Menormalkannya menjadi baris `blocks` ber-`parent_block_id` akan menciptakan sumber kebenaran kedua
yang bertengkar dengan model dokumen ProseMirror, dan mengubah autosave menjadi diff pohon.

**Keputusan: tidak dinormalkan.** Sebagai gantinya:

```text
1. Plugin BlockId juga memberi id pada node blok bersarang
2. blocks.descendant_ids uuid[]  -- dihitung service dengan menelusuri content saat simpan
   create index blocks_descendants_idx on blocks using gin (descendant_ids);
3. Mencari "blok X":
   select * from blocks where id = X or descendant_ids @> array[X]
   lalu telusuri JSON di dalam content untuk menemukan node-nya. Satu query ber-index.
```

```text
blocks.parent_block_id   DINYATAKAN PERMANEN NULL
```

Kolomnya tetap ada sebagai cadangan tapi tidak pernah diisi. Ini ditulis di §10B dan CLAUDE.md,
karena tanpa catatan eksplisit seseorang akan "membantu" mengisinya.

## 11E.5 Konsekuensi granularitas

Halaman yang ditata dengan kolom menjadi satu baris `blocks` yang memuat sebagian besar isi
halaman. Yang menjadi kasar hanyalah "baris yang mana", bukan kemampuan mengalamati: `descendant_ids`
tetap menemukan blok bersarang mana pun, dan `ts_headline` (§25A) tetap menghasilkan cuplikan yang
tepat. Diterima secara sadar, dicatat di sini supaya tidak ditemukan sebagai kejutan.

## 11E.6 Migrasi backfill

Baris yang sudah ada tidak punya `blockId` di JSON-nya.

```sql
update blocks
   set content = jsonb_set(content, '{attrs,blockId}', to_jsonb(id::text))
 where content -> 'attrs' ->> 'blockId' is null;
```

Tanpa langkah ini, penyimpanan pertama setelah upgrade akan menganggap semua blok baru dan
menuliskan ulang seluruh halaman — merusak identitas yang baru saja dibangun, tepat pada saat
fiturnya dipasang.

---

# 12. Editor Architecture
Editor flow:

```text
User input
    |
    v
Tiptap Editor
    |
    v
Editor JSON
    |
    v
Frontend state
    |
    v
REST API
    |
    v
PostgreSQL
```

Ketika halaman dibuka:

```text
GET /pages/:id
       |
       v
page metadata
       +
blocks
       |
       v
Tiptap document
```

Ketika user menyimpan:

```text
Tiptap JSON
    |
    v
validation
    |
    v
API
    |
    v
PostgreSQL
```

---

# 12A. Inline Formatting & Marks

Saat ini editor hanya memuat StarterKit, yang berarti tidak ada link sama sekali, tidak ada warna,
dan tidak ada toolbar seleksi. Menebalkan teks hanya bisa lewat pintasan keyboard.

## 12A.1 Mark yang harus ada

```text
Sudah ada (StarterKit)
  bold, italic, strike, code

Ditambahkan
  underline
  highlight            -- warna latar teks
  textColor            -- warna teks
  link                 -- lihat 12A.2
  subscript, superscript
  inline equation      -- KaTeX, dirender sebagai node atom inline
  page mention         -- @halaman, node atom (12A.3)
  date mention         -- @tanggal, opsional dengan reminder (§70)
```

Warna teks dan latar memakai palet token tema (§34), bukan nilai hex bebas, supaya tetap terbaca
saat berpindah antara mode terang dan gelap. Ini alasan teknis, bukan selera: teks kuning yang
dipilih di mode terang menjadi tidak terbaca di mode gelap kalau disimpan sebagai hex.

## 12A.2 Link tanpa jaringan keluar

```text
Link internal    menunjuk pageId; dirender dengan ikon dan judul halaman yang hidup
Link eksternal   anchor biasa, target _blank, rel="noopener noreferrer"
```

**Tidak ada pengambilan pratinjau.** Tidak ada judul halaman, favicon, atau gambar yang diambil
dari alamat eksternal. Ini konsekuensi langsung §29A: alamat eksternal tetap teks yang bisa
diklik, tidak lebih. Blok bookmark Notion sengaja tidak dibangun (§56).

## 12A.3 Mention

```text
@             memicu menu: halaman, tanggal
@halaman      node atom menyimpan pageId; judulnya dibaca live, bukan disalin
              -> ikut memperbarui backlink (§15A) saat blok disimpan
@tanggal      node atom menyimpan tanggal ISO + flag reminder opsional
              -> direkonsiliasi ke tabel reminders saat blok disimpan (§70)
```

Judul halaman yang dirujuk **tidak pernah disalin** ke dalam dokumen. Kalau disalin, mengganti nama
halaman akan meninggalkan sebutan usang di puluhan tempat tanpa cara memperbaikinya.

`@orang` tidak ada — tidak ada pengguna lain (§56).

## 12A.4 Toolbar seleksi

Lihat §18A.

## 12A.5 Markdown

```text
Input rule (mengetik)
  # ## ###      heading
  - * +         bullet
  1.            ordered
  [] [x]        to-do
  >             quote
  ```           code block
  ---           divider
  **x** *x*     bold, italic
  `x`           inline code
  ~~x~~         strike
  ==x==         highlight
  $x$           inline equation

Paste
  teks Markdown yang ditempel dikonversi menjadi blok, bukan menjadi satu paragraf
  mentah. Memakai parser yang sama dengan import Markdown (§30A) supaya
  "tempel" dan "impor" tidak pernah berbeda hasilnya.

Copy
  menyalin blok menghasilkan Markdown di clipboard teks/plain dan HTML di
  clipboard text/html, keduanya lewat serializer di BlockTypeRegistry (§11D).
```

---

# 12B. Katalog Blok

Daftar lengkap tipe blok yang harus ada. §11.1 dan §11.2 tetap berlaku sebagai pembagian
MVP/lanjutan; seksi ini adalah inventaris finalnya beserta status dan catatan implementasi.

## 12B.1 Teks dan struktur

```text
paragraph            ada
heading_1/2/3        ada
toggle_heading_1/2/3 BARU  -- heading yang bisa dilipat; state lipat tersimpan (12B.5)
bulleted_list        ada
numbered_list        ada
todo                 ada
toggle               BARU
quote                ada
callout              BARU  -- ikon emoji + warna latar dari token tema
divider               ada
code                 ada, perlu: pemilih bahasa, syntax highlight (Shiki), tombol salin, wrap
equation             BARU  -- KaTeX blok
table                BARU  -- tabel sederhana (Tiptap table), bukan database
columns              BARU  -- 2 sampai 5 kolom, lebar bisa digeser
```

## 12B.2 Media — hanya hasil upload

```text
image                ada; perlu: resize, align, caption, full-bleed
video                BARU  -- upload saja
audio                BARU  -- upload saja
file                 BARU  -- upload saja, tampil sebagai kartu unduhan
pdf                  BARU  -- upload saja, dirender dengan viewer PDF bawaan browser
```

**Tidak ada media dari URL.** Semua berkas melewati `attachments` dan object storage (§28, §29A).
Ini konsekuensi langsung dari keputusan "nol request keluar" dan berlaku tanpa pengecualian.

## 12B.3 Tautan dan navigasi

```text
sub_page             BARU  -- membuat halaman anak, tampil inline sebagai tautan
link_to_page         BARU  -- menunjuk halaman yang sudah ada
breadcrumb           BARU  -- jejak induk halaman ini
table_of_contents    BARU  -- diturunkan dari heading di halaman; tidak menyimpan apa pun
synced_block         BARU  -- lihat 12B.4
template_button      BARU  -- menyisipkan sekumpulan blok dari templates (§28 roadmap)
database_view        BARU  -- database inline atau linked view (§20C.3)
mermaid              ada   -- di luar cakupan Notion, dipertahankan
```

## 12B.4 Synced block

```text
content.attrs.sourceBlockId   -> blockId blok sumber (§11E)
```

Blok sumber adalah pemilik isinya; salinan mana pun merender isi yang sama dan menulis balik ke
sumber. Ini **hanya mungkin karena §11E**: dengan id yang lahir baru setiap penyimpanan, tautan
sinkron akan putus dalam hitungan detik.

```text
Sumber dihapus   salinan merender "Blok sumber sudah dihapus", dengan opsi
                 melepaskan salinan menjadi blok biasa. Tidak pernah hilang diam-diam.
```

## 12B.5 State lipat

Toggle, toggle heading, dan grup board sama-sama punya "sedang terbuka atau tertutup". State ini
milik tampilan, bukan konten, dan hanya relevan untuk satu pengguna di satu perangkat:

```text
disimpan di localStorage, berkunci blockId   -- bukan di blocks.content
```

Menyimpannya di konten berarti setiap membuka-tutup toggle menulis ke basis data dan mengotori
riwayat versi.

## 12B.6 Kontrak wajib setiap blok

Setiap entri di `BlockTypeRegistry` (§11D) **wajib** menyediakan tiga serializer:

```text
toHtml        -> export HTML, clipboard text/html, route cetak (§30B)
toMarkdown    -> export Markdown, clipboard text/plain
toPlainText   -> ekstraksi teks untuk cuplikan pencarian (§25A) dan hitung kata
```

Ketiganya adalah field wajib pada tipe TypeScript-nya, sehingga blok baru **tidak bisa
dikompilasi** tanpa serializer-nya. Compiler yang menegakkan paritas ekspor, bukan review kode —
ini satu-satunya cara daftar sepanjang ini tidak pelan-pelan bocor di jalur ekspor.

## 12B.7 Yang sengaja tidak dibangun

```text
bookmark / link preview    butuh pengambilan metadata dari alamat luar (§29A)
embed (iframe apa pun)     butuh memuat situs lain
gambar/video dari URL      sama
button multi-aksi          ditunda; template_button menutup sebagian besar kebutuhannya
komentar per-blok          fitur multi-pengguna (§56)
```

---

# 13. Autosave
Aplikasi personal tidak membutuhkan realtime collaboration, tetapi tetap membutuhkan autosave.

Strategi:

```text
User typing
    |
    v
Debounce 500-1500 ms
    |
    v
Detect changes
    |
    v
Save API
```

Tambahkan status:

```text
Saving...
Saved
Failed to save
```

Jangan melakukan request ke server setiap karakter.

---

# 17. Slash Command
Slash command menjadi fitur penting.

Saat user mengetik:

```text
/
```

muncul:

```text
Text
Heading 1
Heading 2
Heading 3
Bulleted List
Numbered List
To-do
Quote
Code
Callout
Divider
Image
File
Database
Whiteboard        -- membuat child page baru bertipe whiteboard
Diagram           -- membuat child page baru bertipe diagram
Mermaid Diagram   -- menyisipkan block diagram inline di dalam document
```

Search command:

```text
/hea
```

hasil:

```text
Heading 1
Heading 2
Heading 3
```

---

# 18. Block Menu
Setiap block mempunyai menu:

```text
⋮⋮
```

Isi menu:

```text
Turn into
Duplicate
Copy
Copy link
Move to
Delete
```

Kemudian dapat ditambah:

```text
Color
Background
Convert to page
```

---

# 18A. Selection Toolbar

§18 menjelaskan menu per-blok (tombol ⋮⋮). Seksi ini tentang toolbar yang muncul saat **teks
diseleksi** — di Notion inilah cara utama memformat, dan Memoire belum punya sama sekali.

## 18A.1 Isi toolbar

```text
[ Teks v ]  B  I  U  S  </>  A▾  🖍▾  🔗  💬
    |       |                  |   |    |
    |       |                  |   |    +- ubah jadi tautan
    |       |                  |   +- warna latar
    |       |                  +- warna teks
    |       +- bold, italic, underline, strike, code
    +- turn into: ubah blok terseleksi jadi tipe lain
```

Muncul di atas seleksi, mengikuti posisi lewat `coordsAtPos` seperti slash menu yang sudah ada.
Hilang saat seleksi kosong atau saat menekan Escape.

## 18A.2 Saat banyak blok terseleksi

Toolbar berubah isi, bukan menghilang:

```text
[ Turn into v ]  A▾  🖍▾  ⧉ Duplikat  🗑 Hapus
```

Mark tetap bisa diterapkan ke seluruh rentang; "turn into" mengubah semua blok terseleksi
sekaligus. Ini bagian dari multi-select di §19A.

## 18A.3 Yang tidak masuk toolbar

Aksi tingkat blok (pindahkan, salin tautan ke blok, ubah warna latar blok) tetap di menu ⋮⋮ (§18)
dan di context menu klik-kanan. Memasukkan semuanya ke toolbar seleksi membuat toolbar itu selebar
layar dan lambat dibaca — batas yang dipakai: toolbar seleksi untuk hal yang berlaku pada **teks**,
menu blok untuk hal yang berlaku pada **blok**.

---

# 19. Drag and Drop
Block harus dapat:

- dipindah
- di-nest
- di-reorder
- dipindah ke parent lain

Contoh:

```text
Heading
Paragraph
    Todo
    Todo
Paragraph
```

Ketika drag:

```text
Paragraph
    Todo
```

menjadi:

```text
Paragraph
Todo
    Todo
```

Struktur parent-child harus diperbarui dengan transaction.

---

# 19A. Arsitektur Drag

§19 menjelaskan *apa* yang bisa di-drag. Seksi ini menjelaskan *dengan apa* — dan ini keputusan
yang mudah salah, karena ada tiga sistem di aplikasi ini yang sama-sama ingin memiliki peristiwa
pointer.

## 19A.1 Aturan pembagian wilayah

```text
DI DALAM konten editor    -> drag native ProseMirror. TITIK.
DI LUAR konten editor     -> dnd-kit
Kanvas pihak ketiga       -> milik mereka sendiri; jangan disentuh
```

**Kenapa bukan dnd-kit di editor.** ProseMirror memiliki DOM di dalam editor dan sudah punya
penanganan drag sendiri (`NodeSelection`, `dropcursor`, `handleDrop`). Memasang sensor dnd-kit di
atasnya menghasilkan dua state drag yang berjalan bersamaan, seleksi teks yang rusak, dan transaksi
yang hilang — sehingga Ctrl+Z tidak lagi membatalkan pemindahan blok.

Cara yang benar:

```text
1. Hover handle ⋮⋮ men-set NodeSelection pada mousedown
2. Wrapper node diberi draggable
3. ProseMirror memindahkan node dan menghasilkan transaksi yang bisa di-undo
4. dropcursor bawaan menggambar garis penanda posisi jatuh
```

Perkiraan sekitar 150 baris di sebuah NodeView. `@tiptap/extension-drag-handle` adalah paket
**Tiptap Pro berbayar** — jangan direncanakan sebagai dependensi.

## 19A.2 Wilayah dnd-kit

```text
sidebar        urutkan ulang + pindah induk halaman (§16A)
kanban         kartu antar dan di dalam grup
tabel          urutkan ulang baris, urutkan ulang kolom, geser lebar kolom
gallery        urutkan ulang kartu
view tabs      urutkan ulang tab view
timeline       geser batang, tarik tepi untuk mengubah durasi
calendar       geser event ke tanggal lain
```

## 19A.3 DndContext dipasang per fitur

```text
BENAR   satu DndContext di dalam Sidebar
        satu DndContext per komponen view database
SALAH   satu DndContext di app/layout.tsx atau providers.tsx
```

Excalidraw dan React Flow menangkap peristiwa pointer secara agresif. `DndContext` global akan
mencegat drag di dalam kanvas dan membuat whiteboard maupun diagram berhenti bekerja — kegagalan
yang muncul jauh dari tempat penyebabnya, jadi ditulis sebagai aturan keras di CLAUDE.md.

## 19A.4 Urutan setelah drag

```text
Blok      posisi = indeks node di dokumen; disimpan lewat PUT blocks biasa (§11E.3)
Halaman   POST /pages/:id/move { parentPageId, position }
          endpoint-nya SUDAH ADA dan menerima position; klien sekarang tidak
          pernah mengirimnya. Sidebar drag hanya perlu mulai mengirim.
Baris DB  PATCH position; satu transaksi untuk seluruh rentang yang bergeser
```

Untuk penyisipan di tengah, posisi memakai bilangan pecahan (rata-rata tetangga) sehingga
memindahkan satu item tidak perlu menulis ulang semua saudaranya. Normalisasi ulang ke bilangan
bulat dilakukan saat jarak antar posisi menjadi terlalu kecil.

## 19A.5 Umpan balik visual

```text
Garis penanda jatuh   di antara blok / baris / kartu
Bayangan item         mengikuti kursor, opasitas dikurangi
Sorotan target        kolom kanban atau baris sidebar yang sedang dituju
Auto-scroll           saat menyeret mendekati tepi kontainer
```

Auto-scroll gampang terlupa dan langsung terasa hilang begitu daftar lebih panjang dari layar —
memindahkan halaman ke induk yang berada di luar viewport menjadi mustahil tanpanya.
