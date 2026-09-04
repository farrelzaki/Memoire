> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §30, §30A, §30B, §31, §32, §33, §33A

---

# 30. Import / Export
Karena aplikasi personal, fitur backup sangat penting.

**Status (Sprint 24 + 24B): semuanya di bawah sudah terbangun** — Export penuh termasuk yang
tadinya ditulis "Tahap lanjut" (ZIP, PDF); Import penuh termasuk CSV -> database dan Notion export
.zip (Sprint 24B, dipisah dari Sprint 24 karena keduanya secara eksplisit "Tahap lanjut" di §30
sendiri, sementara baris roadmap Sprint 24 sempat mencampurnya dengan yang minimal). HTML *import*
(kebalikan dari HTML *export*, yang sudah ada sejak Sprint 24) tetap belum ada — tidak disebutkan
lagi di roadmap manapun setelah Sprint 24B, jadi dianggap ditunda tanpa tenggat.

## Export

Minimal:

```text
JSON
Markdown
HTML
```

Tahap lanjut:

```text
ZIP
PDF
```

## Import

Minimal:

```text
Markdown
JSON
```

Tahap lanjut (terbangun Sprint 24B, kecuali HTML):

```text
HTML               -- belum, tidak ada tenggat
CSV
Notion export .zip
```

---

# 30A. Pipeline Import

§30 mendaftar format. Seksi ini menjelaskan bagaimana masing-masing masuk.

## 30A.1 Format

```text
Markdown (.md, atau .zip berisi banyak .md)
  parser hand-rolled (`apps/api/src/import/markdown-to-blocks.lib.ts`) — BELUM disambungkan ke
  paste markdown (§12A.5 punya catatan gap-nya sendiri; keduanya seharusnya satu parser tapi
  belum, karena paste berjalan di frontend dan parser import ini backend-only)
  struktur folder -> hierarki halaman
  gambar relatif (http/https) -> di-unduh (lewat penjaga SSRF §29A.1) lalu dipindah ke object
  storage, tautannya ditulis ulang; gambar dengan path relatif ke berkas lain di dalam zip
  BELUM ditangani (di luar cakupan — lihat batasan Notion export di bawah)

CSV -> database
  baris pertama = nama properti
  tipe ditebak per kolom (angka, tanggal, checkbox, sisanya teks — persis 4 tipe ini, tidak
  pernah menebak select/relation/dll karena butuh config yang tidak bisa disuplai sel CSV),
  dan tebakan itu DITAMPILKAN untuk dikoreksi sebelum diimpor lewat `PATCH /import/:stagingId`
  kolom pertama jadi properti title, terkunci — tidak bisa diubah lewat koreksi

Notion export (.zip)
  Notion mengekspor Markdown + CSV dengan sufiks hash pada nama berkas
  hash dipakai untuk menyambungkan tautan antar halaman, lalu dibuang dari judul
  CSV yang berdampingan dengan folder diperlakukan sebagai database
  **Batasan yang disengaja (§30A, "best-effort, bukan resolver graf-tautan dari nol")**:
  ekspor database asli Notion juga menyertakan satu .md per baris di dalam folder yang sama
  dengan .csv-nya (isi yang sama, dua bentuk) — importer ini belum mendeduplikasi itu, jadi
  baris akan muncul dua kali (satu dari .md sebagai halaman biasa, satu dari baris CSV sebagai
  halaman detail baris). Tautan internal yang tidak berhasil di-resolve (hash tidak ditemukan)
  dibiarkan apa adanya dan dilaporkan lewat `warnings`, bukan membuat impor gagal.

memoire.json
  ekspor penuh milik sendiri; jalur restore yang lossless (§31)
```

## 30A.2 Pratinjau sebelum menulis

Impor selalu dua langkah:

```text
1. Unggah -> parse -> tampilkan ringkasan:
   "42 halaman, 3 database, 118 gambar. Akan dibuat di bawah: Impor / 12 Mei"
2. Konfirmasi -> tulis dalam satu transaksi
```

Impor adalah operasi yang paling mudah menghasilkan penyesalan — ratusan halaman muncul di tempat
yang salah, dan membatalkannya satu per satu tidak realistis. Karena itu tidak ada impor satu klik,
dan hasilnya selalu masuk ke satu halaman induk yang bisa dibuang sekaligus.

## 30A.3 Aturan penulisan

```text
Selalu di bawah SATU halaman induk baru, tidak pernah tersebar ke akar
Snapshot versi 'pre_import' bila impor menimpa halaman yang ada (§33A)
Gambar dan lampiran diunduh lalu dipindah ke attachments, bukan ditinggal sebagai tautan
  ke berkas luar yang bisa hilang (§29A.3)
Blok yang tidak dikenali -> jadi blok kode berisi sumber aslinya, bukan dibuang diam-diam
```

Aturan terakhir penting: kehilangan data saat impor lebih buruk daripada hasil yang jelek tapi
terlihat.

**Catatan Sprint 24** — baris pertama ("selalu satu halaman induk baru") sudah menjawab pertanyaan
snapshot `pre_import`: kedua format yang terbangun sprint ini (Markdown, memoire.json) **tidak
pernah** menimpa halaman yang ada — keduanya selalu membuat halaman baru di bawah induk baru.
Snapshot `pre_import` baru relevan untuk format yang benar-benar bisa menimpa (Notion-ZIP re-import
lewat pencocokan hash, Sprint 24B) — pada saat itu tabel `page_versions` (§33A) sudah ada dari
Sprint 25, jadi urutan sprint menyelesaikan sendiri ketergantungannya, bukan risiko yang perlu
ditunda dengan sengaja.

---

# 30B. Renderer: HTML, Markdown, CSV, dan PDF

Satu renderer melayani banyak konsumen sekaligus. Ini bukan kebetulan — ia dirancang begitu supaya
cuplikan pencarian, isi clipboard, dan berkas ekspor tidak pernah menafsirkan blok secara berbeda.

**Catatan arsitektur (Sprint 24, ADR-25):** `BlockTypeRegistry`/`PropertyTypeRegistry` adalah
frontend-only (ADR-24, Sprint 23) — membawa objek ekstensi Tiptap yang tidak bisa jalan di NestJS.
Konsekuensinya, ekspor per-halaman/per-view (Markdown/HTML/CSV) **berjalan di klien**, bukan lewat
endpoint backend baru — memakai ulang registry yang sama persis dengan yang dipakai editor dan
pencarian, tanpa duplikasi. ZIP ekspor workspace juga dikemas di klien (`fflate`, bukan
`archiver`/`yazl` yang disebut §30B.4 — lihat catatan di sana). Ini TIDAK berlaku untuk backup
(§31): backup adalah artefak berbeda (dump JSON mentah, bukan render), jadi tetap murni server-side.

```text
BlockTypeRegistry.toHtml       -> ekspor HTML, clipboard text/html, route cetak
BlockTypeRegistry.toMarkdown   -> ekspor Markdown, clipboard text/plain
BlockTypeRegistry.toPlainText  -> cuplikan pencarian (§25A), hitung kata
PropertyTypeRegistry.toCsv     -> ekspor CSV
```

Semuanya wajib (§11D.2), jadi satu tipe blok baru tidak bisa lolos kompilasi tanpa melengkapi
jalur ekspornya.

## 30B.1 HTML

Renderer sisi server murni: menelusuri JSON blok dan merangkai string. Tanpa DOM, tanpa React SSR,
tanpa dependensi.

```text
Mode satu berkas   CSS di-inline, gambar sebagai data URI
Mode ZIP           CSS di <style>, gambar di assets/
```

## 30B.2 CSV

Per view, **menghormati filter, sort, dan kolom yang tampil** — bukan seluruh isi database mentah.
Yang diekspor adalah apa yang sedang dilihat; kalau tidak, tombol ekspor di sebuah view yang
terfilter menghasilkan berkas yang mengejutkan.

Nilai formula dan rollup ikut terekspor sebagai nilai hasilnya, bukan rumusnya.

## 30B.3 PDF lewat `window.print()`

Menambahkan Puppeteer atau Playwright-chromium berarti sekitar 300MB, sebuah browser di dalam
image Docker, dan unduhan Chromium saat instalasi — biaya besar untuk satu fitur ekspor.

Pendekatannya:

```text
apps/web/app/print/[pageId]/page.tsx
  merender halaman dalam mode baca-saja dengan stylesheet cetak:
    @page { margin: 2cm } + nomor halaman lewat counter
    break-inside: avoid   pada callout, blok kode, tabel
    break-after: avoid    pada heading
    toggle dan toggle heading dipaksa terbuka
    a::after { content: " (" attr(href) ")" }   -- URL terlihat saat dicetak

"Ekspor ke PDF" membuka route itu di TAB BARU lalu memanggil print() setelah render selesai
  (bukan iframe tersembunyi — lebih sederhana untuk debug/fokus di aplikasi personal satu tab)
```

Nol dependensi tambahan, memakai font asli pengguna, dan hasilnya bagus justru karena browser
memang mesin layout HTML terbaik yang tersedia — kita hanya tidak perlu **mem-bundel** satu lagi.

**Puppeteer masuk daftar yang tidak boleh ditambahkan tanpa diskusi.** Bila suatu saat benar-benar
butuh PDF batch tanpa browser (misalnya backup terjadwal), pakai `pdfkit` (JS murni) dengan tata
letak yang sengaja disederhanakan, dan katakan apa adanya bahwa hasilnya tidak identik dengan hasil
cetak.

## 30B.4 ZIP

**Terbangun dengan `fflate`, bukan `archiver`/`yazl`** — pengemasan ZIP ini berjalan di KLIEN
(§30B, ADR-25), jadi butuh library yang jalan di browser tanpa polyfill Node; `archiver`/`yazl`
berorientasi Node stream dan tidak cocok begitu paket ini pindah ke sisi klien. `fflate` sudah
terbukti dipakai juga oleh backup (§31, sisi server) dan restore (unzip di klien) — satu library
untuk semua kebutuhan ZIP sprint ini.

```text
memoire-export-2026-05-12.zip
├── pages/          cermin hierarki halaman sebagai .md
├── databases/      satu .csv per database
├── assets/         lampiran
└── memoire.json    ekspor JSON penuh -- sumber restore yang lossless
```

`memoire.json` sengaja ikut disertakan: berkas Markdown enak dibaca manusia tapi kehilangan
sebagian struktur (config view, formula, relasi). Satu arsip berisi keduanya — versi untuk dibaca
dan versi untuk dipulihkan.

---

# 31. Backup
Backup harus menjadi fitur inti.

**Status: terbangun (Sprint 24), termasuk penjadwalan** — teksnya sendiri di bawah tadinya menunda
"backup otomatis... bila aplikasi sudah stabil", tapi dibangun sekarang atas instruksi eksplisit
saat perencanaan sprint. `@Cron('0 3 * * *')` (`apps/api/src/backup/backup.service.ts`) jalan
setiap hari, plus trigger manual (`POST /backup/run`) dan restore dari daftar backup di
`/settings`. Retensi: 7 backup terbaru disimpan lokal di `BACKUP_DIR`, sisanya dihapus.

Contoh:

```text
Export Workspace
        |
        v
workspace-backup.zip
```

Isi **terbangun** — disederhanakan dari daftar berkas terpisah di bawah menjadi satu `memoire.json`
(bentuk yang sama persis dengan `GET /export/json`) + `attachments/`, bukan lima berkas JSON
terpisah. Fungsinya identik (restore penuh, satu sumber kebenaran) dan menghindari perlu menjaga
dua bentuk skema JSON (yang sudah ada di `exportWorkspace()`, dan satu lagi yang terpecah) tetap
sinkron:

```text
memoire-backup-<timestamp>.zip
├── memoire.json
└── attachments/
```

Restore memakai ulang pipeline import (§30A) dengan `kind: 'memoire-json'` — tidak ada jalur
restore terpisah.

---

# 32. Trash
Jangan langsung hard-delete halaman.

Gunakan:

```text
is_archived
```

atau soft delete.

Flow:

```text
Delete page
    |
    v
Trash
    |
    +--> Restore
    |
    +--> Permanently Delete
```

**Status: dibangun (Sprint 25).** Dua perbaikan terhadap implementasi sebelumnya:

```text
Archive/restore kini rekursif ke seluruh subtree, dalam satu transaksi.
  -> Sebelumnya hanya menyentuh satu baris pages: anak dari halaman yang
     diarsipkan menjadi tak terjangkau dari sidebar (induknya hilang) tapi
     tidak pernah muncul di Trash juga (belum isArchived) -- keadaan yatim
     yang tersembunyi. Restore mengembalikan SEMUA descendant yang sedang
     terarsip tanpa syarat (bukan hanya yang diarsipkan bersamaan) --
     mencocokkan perilaku Notion, trade-off yang wajar untuk aplikasi
     satu pengguna. Lihat ADR-26.

Permanent delete pada subtree berisi database populasi tidak lagi crash.
  -> database_rows.page_id -> pages.id TIDAK cascade (beda dengan
     databases.owner_page_id dan database_rows.database_id yang cascade),
     jadi penghapusan depth-first lama bisa mencoba menghapus halaman detail
     baris sebelum halaman pemilik database-nya -- Postgres menolak dengan
     FK violation. Diperbaiki: kumpulkan seluruh id subtree lebih dulu (BFS),
     null-kan database_rows.page_id yang menunjuk ke subtree itu, baru hapus
     halaman dari yang terdalam. Reproduksi nyata: Sprint 24B menabrak bug
     ini saat membersihkan data uji coba import.
```

---

# 33. Version History
Fitur ini tidak wajib untuk MVP.

Tahap pertama cukup menyimpan:

```text
updated_at
```

Tahap lanjut:

```text
page_versions
- id
- page_id
- snapshot
- created_at
```

Kemudian:

```text
History
   |
   +-- Version 1
   +-- Version 2
   +-- Version 3
```

Dapat dibuat restore snapshot.

---

# 33A. Snapshot Versi & Retensi

§33 menunda riwayat versi. Seksi ini menspesifikasikannya, dengan perhatian utama pada satu hal:
autosave berjalan setiap 500–1500ms, jadi kebijakan snapshot yang naif menghasilkan ribuan salinan
dokumen penuh dalam satu sesi kerja.

**Status: dibangun (Sprint 25).** Satu penyesuaian terhadap spesifikasi awal di bawah: **judul dan
ikon halaman ikut disnapshot dan bisa direstore**, bukan hanya konten blok — keputusan eksplisit
pengguna saat sprint ini direncanakan, melampaui satu titik hook literal di `BlocksService.replace`
yang disebut §33A.2. Konsekuensinya, `PagesService.update` juga memanggil hook snapshot yang sama
saat `title`/`icon` berubah. Lihat ADR-26 untuk alasan lengkap dan trade-off desain
tx-composable-nya.

## 33A.1 Tabel

```text
page_versions
- id
- page_id       -> pages(id) on delete cascade
- version       int, naik monoton per halaman
- kind          'auto' | 'manual' | 'pre_restore' | 'pre_import'
- label         text null
- content       jsonb null   -- snapshot penuh, atau null bila dipindah ke storage
- storage_key   text null    -- object storage, bila content > 256KB
- content_hash  text         -- sha256 dari JSON kanonik
- size_bytes    int
- created_at
unique (page_id, version)
index (page_id, created_at desc)
```

## 33A.2 Kapan snapshot dibuat

Dievaluasi di `BlocksService.replace` setelah upsert (§11E.3):

```text
Lewati sama sekali bila content_hash sama dengan versi terakhir
  -> penyimpanan yang cuma mengurutkan ulang, atau tanpa perubahan, tidak menulis apa pun.
     Ini alasan penjaga "updated_at hanya naik bila content berubah" di §11E.3 penting.

Selain itu, tulis versi 'auto' hanya bila sudah lewat >= 10 MENIT sejak versi auto
terakhir halaman itu.
  -> paling banyak 10 menit kerja yang tidak terversi. Untuk aplikasi satu pengguna,
     itu pertukaran yang tepat melawan ribuan baris snapshot.

Selalu snapshot pada:
  "Simpan versi" manual        kind = 'manual'
  sebelum restore              kind = 'pre_restore'
  sebelum impor menimpa        kind = 'pre_import'
  edit pertama setelah halaman menganggur > 24 jam
```

## 33A.3 Retensi

Job harian `@nestjs/schedule`, `@Cron('0 3 * * *')`, bertingkat:

```text
24 jam terakhir    simpan semuanya
7 hari terakhir    simpan yang terbaru per JAM
30 hari terakhir   simpan yang terbaru per HARI
365 hari terakhir  simpan yang terbaru per MINGGU
lebih lama         simpan yang terbaru per BULAN

Tidak pernah dipangkas: kind != 'auto', dan 5 versi terbaru
Batas keras: 200 versi per halaman
Jendela retensi bisa diatur di Settings, termasuk pilihan "simpan selamanya"
```

## 33A.4 Snapshot besar

Dokumen di atas 256KB JSON kanonik disimpan ke object storage
(`versions/<pageId>/<versionId>.json`), `content` dibiarkan null. Ini menghormati semangat aturan
"data besar/biner tidak di PostgreSQL" (§57) dan mencegah satu halaman berisi whiteboard membengkakkan
tabel.

## 33A.5 Diff

Dihitung saat diminta, dari dua snapshot, di tingkat blok, berkunci `blockId` (§11E):

```text
ditambah | dihapus | dipindah | diubah
```

Di dalam blok yang berubah, diff kata memakai LCS sekitar 60 baris di
`apps/api/src/versions/diff.lib.ts` — tanpa dependensi.

**Riwayat versi hanya bermakna karena id blok stabil.** Dengan id yang lahir ulang tiap simpan,
setiap diff akan melaporkan "semuanya berubah" dan fiturnya tidak berguna. Ini contoh paling jelas
kenapa §11E harus lebih dulu.

## 33A.6 Restore tidak pernah merusak

```text
1. snapshot keadaan sekarang sebagai 'pre_restore'
2. tulis konten lama sebagai versi BARU
```

Tidak pernah memundurkan sejarah. Menekan restore karena penasaran harus selalu bisa dibatalkan.
