# Memoire — Technical Planning
> Personal Knowledge Workspace (terinspirasi Notion)

## 1. Ringkasan Proyek

**Memoire** adalah **personal knowledge management / productivity app** yang mengambil konsep utama Notion: halaman bertingkat, block editor, database, berbagai view, pencarian, attachment, template, dan pengorganisasian workspace.

Karena aplikasi hanya digunakan oleh **satu pengguna**, seluruh fitur yang berhubungan dengan pengguna lain sengaja dihilangkan.

> **Revisi kritis:** Draf awal dokumen ini mengasumsikan setiap Page hanya berisi konten block-based (dokumen teks). Ini membatasi fleksibilitas. Memoire dirancang agar sebuah Page bisa berupa **tipe konten apa pun** — dokumen, database, whiteboard, diagram, dan tipe baru di masa depan — melalui **Content Type System** yang dijelaskan di Bagian 11A. Ini adalah perubahan arsitektur paling penting dibanding draf sebelumnya.

### Fitur yang TIDAK dibutuhkan

- Multi-user account
- Workspace invitation
- Team member
- Role dan permission antar-user
- Real-time collaboration
- Presence / online status
- Cursor collaboration
- CRDT
- WebSocket untuk collaborative editing
- Shared workspace
- Comment antar-user
- Mention antar-user
- Social activity
- Team notification

Fokus utama adalah membuat pengalaman personal yang cepat, nyaman, extensible, dan dapat bekerja secara lokal maupun melalui server pribadi.

---

# 0. Peta Seksi

Dokumen ini dulunya satu file 2842 baris. Setelah cakupannya diperluas ke paritas fitur Notion,
isinya dipecah per topik agar bisa tumbuh tanpa menjadi tidak terbaca. **File ini adalah indeks
dan arsitektur inti**; detail per topik ada di file tetangganya.

## 0.1 Cara membaca dokumen ini

Nomor seksi (§1, §11A, §22) adalah **identitas permanen**, bukan posisi. Sebuah seksi membawa
nomornya ke mana pun ia dipindahkan. Karena itu semua rujukan lama di dalam dokumen — "lihat 11A",
"Bagian 10.11" — tetap sah; yang berubah hanya file tempatnya tinggal. Gunakan tabel §0.2 untuk
menemukan file sebuah nomor seksi.

## 0.2 Tabel seksi → file

| Seksi | Judul | File |
|---|---|---|
| §0 | Peta Seksi _(baru)_ | _(indeks ini)_ |
| §1 | Ringkasan Proyek | _(indeks ini)_ |
| §2 | Target Produk | _(indeks ini)_ |
| §3 | Rekomendasi Stack | _(indeks ini)_ |
| §4 | Backend | _(indeks ini)_ |
| §5 | Database | _(indeks ini)_ |
| §6 | Storage | [`40-files-media.md`](./40-files-media.md) |
| §7 | Cache | _(indeks ini)_ |
| §8 | Arsitektur Sistem | _(indeks ini)_ |
| §9 | Arsitektur Data | _(indeks ini)_ |
| §10 | Struktur Database | [`10-data-model.md`](./10-data-model.md) |
| §10A | Riwayat Migrasi _(baru)_ | [`10-data-model.md`](./10-data-model.md) |
| §10B | Invarian Data _(baru)_ | [`10-data-model.md`](./10-data-model.md) |
| §11 | Block System | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §11A | Extensible Content Type System | [`11-content-types.md`](./11-content-types.md) |
| §11B | Whiteboard Page Type | [`11-content-types.md`](./11-content-types.md) |
| §11C | Diagram Page Type | [`11-content-types.md`](./11-content-types.md) |
| §11D | Kontrak Registry v2 _(baru)_ | [`11-content-types.md`](./11-content-types.md) |
| §11E | Identitas Blok _(baru)_ | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §12 | Editor Architecture | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §12A | Inline Formatting & Marks _(baru)_ | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §12B | Katalog Blok _(baru)_ | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §13 | Autosave | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §14 | Offline Support | [`60-platform.md`](./60-platform.md) |
| §15 | Page Management | [`30-navigation-search.md`](./30-navigation-search.md) |
| §15A | Backlinks _(baru)_ | [`30-navigation-search.md`](./30-navigation-search.md) |
| §16 | Sidebar | [`30-navigation-search.md`](./30-navigation-search.md) |
| §16A | Interaksi Sidebar _(baru)_ | [`30-navigation-search.md`](./30-navigation-search.md) |
| §17 | Slash Command | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §18 | Block Menu | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §18A | Selection Toolbar _(baru)_ | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §19 | Drag and Drop | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §19A | Arsitektur Drag _(baru)_ | [`12-editor-blocks.md`](./12-editor-blocks.md) |
| §20 | Database Engine | [`20-database.md`](./20-database.md) |
| §20A | Katalog Tipe Properti _(baru)_ | [`20-database.md`](./20-database.md) |
| §20B | Kalkulasi & Agregasi _(baru)_ | [`20-database.md`](./20-database.md) |
| §20C | Inline & Linked Database _(baru)_ | [`20-database.md`](./20-database.md) |
| §20D | Row Page _(baru)_ | [`20-database.md`](./20-database.md) |
| §21 | Database Views | [`20-database.md`](./20-database.md) |
| §21A | Skema View Config _(baru)_ | [`20-database.md`](./20-database.md) |
| §21B | View Baru (List, Timeline) _(baru)_ | [`20-database.md`](./20-database.md) |
| §22 | Filtering dan Sorting | [`20-database.md`](./20-database.md) |
| §22A | Query Engine & Batas Evaluasi _(baru)_ | [`20-database.md`](./20-database.md) |
| §23 | Relation | [`20-database.md`](./20-database.md) |
| §23A | Storage Relation _(baru)_ | [`20-database.md`](./20-database.md) |
| §24 | Formula | [`20-database.md`](./20-database.md) |
| §24A | Bahasa Formula _(baru)_ | [`20-database.md`](./20-database.md) |
| §24B | Rollup _(baru)_ | [`20-database.md`](./20-database.md) |
| §25 | Search | [`30-navigation-search.md`](./30-navigation-search.md) |
| §25A | Desain Full-Text Search _(baru)_ | [`30-navigation-search.md`](./30-navigation-search.md) |
| §26 | Command Palette | [`30-navigation-search.md`](./30-navigation-search.md) |
| §27 | Keyboard Shortcut | [`30-navigation-search.md`](./30-navigation-search.md) |
| §28 | File Handling | [`40-files-media.md`](./40-files-media.md) |
| §29 | Image System | [`40-files-media.md`](./40-files-media.md) |
| §29A | Sumber Daya Eksternal _(baru)_ | [`40-files-media.md`](./40-files-media.md) |
| §30 | Import / Export | [`50-portability.md`](./50-portability.md) |
| §30A | Pipeline Import _(baru)_ | [`50-portability.md`](./50-portability.md) |
| §30B | Renderer (HTML / Markdown / CSV / print-PDF) _(baru)_ | [`50-portability.md`](./50-portability.md) |
| §31 | Backup | [`50-portability.md`](./50-portability.md) |
| §32 | Trash | [`50-portability.md`](./50-portability.md) |
| §33 | Version History | [`50-portability.md`](./50-portability.md) |
| §33A | Snapshot Versi & Retensi _(baru)_ | [`50-portability.md`](./50-portability.md) |
| §34 | Themes | [`60-platform.md`](./60-platform.md) |
| §35 | Settings | [`60-platform.md`](./60-platform.md) |
| §35A | Model Settings _(baru)_ | [`60-platform.md`](./60-platform.md) |
| §36 | Desktop App | [`60-platform.md`](./60-platform.md) |
| §37 | PWA | [`60-platform.md`](./60-platform.md) |
| §38 | Security | [`60-platform.md`](./60-platform.md) |
| §39 | Validation | [`70-api-contract.md`](./70-api-contract.md) |
| §39A | packages/validation _(baru)_ | [`70-api-contract.md`](./70-api-contract.md) |
| §40 | Testing | [`80-engineering.md`](./80-engineering.md) |
| §41 | Project Structure | [`80-engineering.md`](./80-engineering.md) |
| §42 | Feature Modules Frontend | [`80-engineering.md`](./80-engineering.md) |
| §43 | Feature Modules Backend | [`80-engineering.md`](./80-engineering.md) |
| §44 | API Design | [`70-api-contract.md`](./70-api-contract.md) |
| §44A | Katalog Endpoint _(baru)_ | [`70-api-contract.md`](./70-api-contract.md) |
| §45 | Transaction Strategy | [`10-data-model.md`](./10-data-model.md) |
| §46 | Performance Strategy | [`80-engineering.md`](./80-engineering.md) |
| §47 | Database Indexes | [`10-data-model.md`](./10-data-model.md) |
| §48 | Development Environment | [`80-engineering.md`](./80-engineering.md) |
| §49 | Git Workflow | [`80-engineering.md`](./80-engineering.md) |
| §50 | CI/CD | [`80-engineering.md`](./80-engineering.md) |
| §51 | MVP Scope | [`90-roadmap.md`](./90-roadmap.md) |
| §52 | Phase 2 | [`90-roadmap.md`](./90-roadmap.md) |
| §53 | Phase 3 | [`90-roadmap.md`](./90-roadmap.md) |
| §54 | Phase 4 | [`90-roadmap.md`](./90-roadmap.md) |
| §55 | Roadmap Development | [`90-roadmap.md`](./90-roadmap.md) |
| §56 | Hal yang Tidak Perlu Dibangun | _(indeks ini)_ |
| §57 | Keputusan Arsitektur Penting | _(indeks ini)_ |
| §58 | UX Architecture | [`30-navigation-search.md`](./30-navigation-search.md) |
| §59 | Responsive Strategy | [`30-navigation-search.md`](./30-navigation-search.md) |
| §60 | Error Handling | [`80-engineering.md`](./80-engineering.md) |
| §61 | Empty States | [`80-engineering.md`](./80-engineering.md) |
| §62 | Observability | [`80-engineering.md`](./80-engineering.md) |
| §63 | Deployment Options | [`80-engineering.md`](./80-engineering.md) |
| §64 | Recommended Final Stack | [`90-roadmap.md`](./90-roadmap.md) |
| §65 | Recommended Build Order | [`90-roadmap.md`](./90-roadmap.md) |
| §66 | Definition of Done untuk MVP | [`90-roadmap.md`](./90-roadmap.md) |
| §67 | Prinsip Utama Proyek | _(indeks ini)_ |
| §68 | Final Architecture Summary | _(indeks ini)_ |
| §69 | Kesimpulan | _(indeks ini)_ |
| §70 | Reminder & Notifikasi _(baru)_ | [`60-platform.md`](./60-platform.md) |
| §71 | Matriks Paritas Notion _(baru)_ | [`95-notion-parity.md`](./95-notion-parity.md) |
| §72 | Architecture Decision Log _(baru)_ | [`96-decisions.md`](./96-decisions.md) |

## 0.3 Aturan penomoran (normatif)

1. **Nomor tidak pernah diubah.** Tidak ada renumbering, selamanya. Nomor adalah identitas.
2. **Satu nomor seksi tidak pernah terbelah dua file.** §10 pindah utuh bersama 10.1–10.11,
   sehingga "10.11" tetap bisa ditemukan hanya dari nomornya.
3. **Konten baru** memakai **sufiks huruf** pada seksi induknya (§22A, §24B) — sehingga otomatis
   mendarat di file yang sama dengan induknya — atau **nomor ≥70** untuk area yang benar-benar
   baru. Rentang 1–69 tidak pernah disisipi nomor baru.
4. **Judul seksi yang dipindah tidak diubah**, agar anchor lama tetap hidup.
5. **Setiap file topik** dibuka dengan dua baris: pointer ke indeks ini + daftar seksi miliknya.
6. Menambah seksi berarti menambah satu baris di tabel §0.2. Tabel itu satu-satunya sumber
   kebenaran untuk pemetaan seksi → file.

## 0.4 Urutan baca untuk kontributor baru

```text
1. §1, §2     apa yang dibangun dan untuk siapa
2. §8, §9     bentuk sistem dan bentuk datanya
3. §67        prinsip yang tidak boleh dilanggar
4. §56        apa yang sengaja TIDAK dibangun   <- baca sebelum mengusulkan apa pun
5. §72        alasan di balik keputusan yang terasa aneh
6. §71        status paritas fitur terhadap Notion
7. §55        roadmap: apa yang dikerjakan berikutnya
```

---

# 2. Target Produk
Target akhir aplikasi:

> Sebuah personal workspace seperti Notion yang memungkinkan pengguna menulis dokumen berbasis block, membuat database, menghubungkan data, mencari seluruh isi workspace, mengunggah file, dan mengatur seluruh informasi pribadi dari satu aplikasi.

Prioritas produk:

1. Editor harus terasa nyaman.
2. Struktur page harus fleksibel.
3. Database harus powerful tetapi tidak terlalu rumit.
4. Data harus aman dan mudah dibackup.
5. Aplikasi harus cepat.
6. Arsitektur harus mudah dikembangkan.
7. Fitur offline dapat ditambahkan tanpa mengubah fondasi utama.
8. **Page harus mendukung banyak tipe konten (document, database, whiteboard, diagram) tanpa mengubah fondasi utama.** Menambah tipe konten baru harus semudah menambah modul baru, bukan refactor besar.

### Catatan tentang cakupan "sama persis dengan Notion"

**Revisi:** target sekarang adalah **paritas fitur penuh dengan Notion**, bukan sekadar meniru
mental model intinya. Setiap fitur Notion masuk rencana, kecuali satu kelompok yang gugur karena
bentuk produknya:

```text
Fitur yang melibatkan pengguna lain -- TIDAK AKAN PERNAH ADA
  share & publish, permission & role, komentar & diskusi, mention @orang,
  presence & cursor, suggested edit, penugasan tugas, teamspace & guest,
  properti Person / Created by / Last edited by, activity feed, Notion Forms
```

Itu satu-satunya pengecualian permanen. Aplikasi ini dipakai satu orang, jadi seluruh permukaan
kolaborasi Notion tidak punya arti di sini — bukan ditunda, memang tidak berlaku.

Selain itu, **integrasi yang butuh akun pihak ketiga** (Google Drive, Slack, Figma, GitHub, Notion
sync, web clipper) belum dikerjakan — ditunda karena belum dibutuhkan, bukan dilarang. Aplikasi
sendiri bebas menghubungi internet untuk hal biasa seperti pratinjau tautan, embed, media dari URL,
dan notifikasi push; aturannya di §29A.

Yang tersisa justru bagian Notion yang paling banyak dipakai untuk kerja pribadi: editor blok,
database beserta relation, rollup, formula, dan tujuh jenis view, plus interaksi drag-and-drop yang
membuat semuanya terasa langsung. Status per fitur ada di §71, dan alasan di balik keputusan yang
terasa aneh ada di §72.

Yang tetap benar dari draf lama: menyamai **skala** dan performa Notion di jutaan halaman bukan
target, dan tidak perlu. Aplikasi ini melayani satu orang. Batas desain yang mengikuti dari situ
ditulis apa adanya di tempatnya masing-masing, misalnya §22A.5.

Memoire juga tetap tumbuh melebihi Notion di area yang Notion tidak punya secara native:
whiteboard (§11B), diagram (§11C), dan blok Mermaid inline.

---

# 3. Rekomendasi Stack
## 3.1 Frontend

### Framework

**Next.js + React + TypeScript**

Alasan:

- React cocok untuk UI interaktif yang kompleks.
- Next.js menyediakan struktur aplikasi yang matang.
- TypeScript membantu menjaga type safety.
- Cocok untuk aplikasi desktop-like berbasis web.

### UI

- Tailwind CSS
- shadcn/ui
- Radix UI bila diperlukan
- Lucide Icons

### Editor

**Tiptap**

Tiptap digunakan sebagai fondasi block editor.

Alasan:

- Extensible
- Cocok untuk rich text
- Dapat membuat custom node
- Cocok untuk nested content
- Mendukung berbagai extension
- Lebih mudah dikontrol untuk membangun editor bergaya Notion

### State Management

**Zustand**

Gunakan untuk UI state seperti:

- sidebar state
- selected block
- modal
- command menu
- settings UI
- editor UI state yang bukan source of truth

### Server Data

**TanStack Query**

Gunakan untuk:

- pages
- databases
- attachments
- settings
- templates
- search result

---

# 4. Backend
## 4.1 Framework

**NestJS + TypeScript**

Backend digunakan untuk:

- CRUD pages
- CRUD blocks
- database engine
- search
- attachment management
- backup/export
- import
- settings
- templates
- automation sederhana

Tidak membutuhkan realtime server.

## 4.2 API Style

Gunakan REST API.

Contoh:

```text
/api/pages
/api/pages/:id
/api/blocks
/api/databases
/api/databases/:id
/api/database-rows
/api/attachments
/api/search
/api/templates
/api/export
/api/import
```

GraphQL tidak diperlukan untuk versi pertama.

---

# 5. Database
## 5.1 Rekomendasi

**PostgreSQL**

PostgreSQL digunakan sebagai primary database.

Alasan:

- relational database matang
- transaction support
- indexing kuat
- JSONB
- full-text search
- cocok untuk struktur page/database
- mudah dibackup

## 5.2 ORM

**Drizzle ORM**

Dipakai untuk:

- schema
- migration
- query
- type-safe database access

---

# 7. Cache
**Redis bersifat opsional.**

Untuk aplikasi personal dengan trafik rendah, jangan jadikan Redis sebagai dependency wajib sejak hari pertama.

Mulai tanpa Redis.

Tambahkan Redis ketika dibutuhkan untuk:

- cache
- background job
- rate limiting
- session cache
- expensive search/cache operation

Untuk MVP:

```text
Next.js
   |
NestJS
   |
PostgreSQL
   |
Object Storage
```

Sudah cukup.

---

# 8. Arsitektur Sistem
## 8.1 Arsitektur yang direkomendasikan

Gunakan **modular monolith**.

```text
                    Browser
                       |
                       | HTTPS
                       v
              +------------------+
              |     Next.js      |
              |                  |
              | React            |
              | Tiptap           |
              | Zustand          |
              | TanStack Query   |
              +--------+---------+
                       |
                       | REST API
                       v
              +------------------+
              |     NestJS       |
              |                  |
              | Auth             |
              | Pages            |
              | Blocks           |
              | Databases        |
              | Search           |
              | Attachments      |
              | Templates        |
              | Import/Export    |
              +--------+---------+
                       |
              +--------+---------+
              |                  |
              v                  v
      +---------------+   +---------------+
      |  PostgreSQL   |   | Object Storage|
      |               |   |               |
      | pages         |   | images        |
      | blocks        |   | files         |
      | databases     |   | attachments   |
      | rows          |   +---------------+
      +---------------+
```

Tidak ada:

```text
WebSocket
CRDT
Hocuspocus
Liveblocks
Kafka
Microservices
Kubernetes
```

untuk versi awal.

---

# 9. Arsitektur Data
Konsep utama aplikasi:

```text
Workspace
   |
   +-- Page
   |    |
   |    +-- Block
   |    +-- Block
   |    +-- Block
   |    |
   |    +-- Child Page
   |
   +-- Database
        |
        +-- Property
        +-- Row
        +-- View
```

Walaupun hanya ada satu user, konsep `workspace` tetap berguna sebagai container data.

---

# 56. Hal yang Tidak Perlu Dibangun

Baca seksi ini sebelum mengusulkan fitur apa pun. Daftarnya bukan kelalaian — setiap baris adalah
keputusan, dan sebagian besar punya entri di §72.

## 56.1 Infrastruktur

```text
Microservices
Kubernetes
GraphQL
Kafka
Redis (sebelum ada kebutuhan cache/queue yang benar-benar terukur)
WebSocket
CRDT
Antrean pekerjaan eksternal
Plugin runtime pihak ketiga  -- registry tetap internal & compile-time (§11A.4, §11D.5)
```

## 56.2 Multi-pengguna — tidak akan pernah ada

Aplikasi ini dipakai satu orang. Ini bukan tahapan; ini bentuk produknya.

```text
Real-time collaboration, presence, cursor, suggested edit
Multi-user permission, role, workspace invitation
Team management, teamspace, guest
Komentar dan diskusi, mention @orang
Penugasan tugas, activity feed
Properti Person / Created by / Last edited by
Share, publish ke web, Notion Forms, analytics halaman
```

## 56.3 Integrasi pihak ketiga — ditunda, bukan dilarang

Belum dikerjakan karena belum dibutuhkan. Kalau suatu saat memang berguna, ia boleh masuk — tapi
lewat diskusi dulu, karena masing-masing membawa OAuth, penyimpanan token, dan penanganan kuota.

```text
Google Drive, Slack, Figma, GitHub, Jira
Notion sync (database yang tersinkron dari sumber luar)
Web clipper
Import langsung dari Evernote / Google Docs lewat API mereka
Fitur AI
```

Yang **tidak** termasuk daftar ini, dan boleh dikerjakan kapan saja: pratinjau tautan, embed
iframe, media dari URL, aset CDN, push notification, dan pemeriksaan pembaruan desktop. Semuanya
tidak butuh akun pihak ketiga. Aturan teknisnya — pengambilan dari sisi server, timeout, penjaga
SSRF, dan perilaku saat offline — ada di §29A.

## 56.4 Implementasi yang dilarang

Bukan fitur, tapi cara mengerjakan yang sudah ditolak beserta alasannya:

```text
Puppeteer / Playwright-chromium untuk ekspor PDF     -- ADR-12
Normalisasi blok bersarang ke blocks.parent_block_id -- ADR-01
dnd-kit di dalam DOM konten ProseMirror              -- ADR-11
DndContext global di layout.tsx                      -- ADR-11
pages.type baru untuk baris database                 -- ADR-08
FK cascade yang menghapus baris pages                -- ADR-10
State view di React useState                         -- ADR-18
Klien menulis database_rows.computed                 -- ADR-03
Fetch ke host luar langsung dari browser             -- §29A.1, kebocoran privasi
Fetch tanpa penjaga SSRF                             -- §29A.1
```

Kalau sebuah task sepertinya membutuhkan salah satu di atas, berhenti dan tanyakan dulu —
kemungkinan besar ada pendekatan lain yang sejalan dengan prinsip proyek ini.

---

# 57. Keputusan Arsitektur Penting
## Decision 1 — Monolith

Gunakan modular monolith.

Alasan:

- sederhana
- mudah debugging
- mudah deployment
- cocok untuk personal application

## Decision 2 — PostgreSQL sebagai source of truth

Jangan menjadikan browser sebagai satu-satunya penyimpanan permanen.

## Decision 3 — JSONB untuk flexible content

Gunakan JSONB untuk:

- block content
- block properties
- database row values
- view configuration

Jangan memasukkan semua hal ke JSONB. Data yang sering dicari atau direlasikan tetap dibuat sebagai column/table normal.

## Decision 4 — Tidak menggunakan realtime collaboration

Autosave cukup dengan HTTP API + debounce.

## Decision 5 — Storage terpisah

File binary tidak disimpan sebagai PostgreSQL blob.

---

# 67. Prinsip Utama Proyek
## Keep the core simple

Tidak perlu meniru kompleksitas internal Notion.

Yang perlu ditiru adalah:

```text
mental model
UX
flexibility
```

bukan seluruh infrastructure mereka.

## Build extensible, not over-engineered

Contoh yang benar:

```text
Modular monolith
```

Contoh yang terlalu jauh untuk tahap awal:

```text
Microservices + Kafka + Kubernetes
```

## Data safety > fancy features

Karena aplikasi ini personal, backup dan export lebih penting daripada fitur sosial.

## Editor first

Kualitas editor akan sangat menentukan apakah aplikasi benar-benar terasa seperti Notion atau hanya terlihat seperti clone sederhana.

---

# 68. Final Architecture Summary
```text
                         PERSONAL USER
                              |
                              v
                    +--------------------+
                    |      Next.js       |
                    |                    |
                    | React              |
                    | Tiptap             |
                    | Zustand            |
                    | TanStack Query     |
                    +---------+----------+
                              |
                              | REST
                              v
                    +--------------------+
                    |      NestJS        |
                    |                    |
                    | Pages              |
                    | Content Type       |
                    |   Registry ────────┼── Document
                    |                    |── Database
                    |                    |── Whiteboard
                    |                    |── Diagram
                    | Blocks             |
                    | Databases          |
                    | Search             |
                    | Attachments        |
                    | Templates          |
                    | Backup             |
                    +---------+----------+
                              |
                    +---------+----------+
                    |                    |
                    v                    v
             +------------+       +-------------+
             | PostgreSQL |       | S3 / MinIO  |
             |            |       |             |
             | Pages      |       | Images      |
             | Blocks     |       | Files       |
             | Database   |       | Attachments |
             | Rows       |       +-------------+
             | Canvases   |
             | (whiteboard/|
             |  diagram)  |
             +------------+
```

Tidak ada collaboration layer karena aplikasi memang dirancang untuk satu pengguna. Fleksibilitas untuk fitur masa depan (whiteboard, diagram, dan tipe lain) datang dari **Content Type Registry**, bukan dari menambah kompleksitas infrastruktur (bukan microservices, bukan plugin runtime pihak ketiga).

---

# 69. Kesimpulan
Stack yang paling direkomendasikan untuk **Memoire** adalah:

**Next.js + React + TypeScript + Tiptap + Tailwind + shadcn/ui + Zustand + TanStack Query + NestJS + PostgreSQL + Drizzle + S3/MinIO + Docker**, ditambah **Excalidraw** (whiteboard), **React Flow** (diagram), dan **Mermaid** (diagram inline di document).

Arsitektur terbaik untuk tahap awal adalah **modular monolith**, bukan microservices.

Fleksibilitas untuk fitur masa depan dijamin lewat **Content Type System** (Bagian 11A) — sebuah registry pattern di backend dan frontend yang membuat penambahan tipe page baru (whiteboard, diagram, dan lainnya nanti) menjadi menambah satu modul yang mengikuti kontrak yang sama, bukan refactor fondasi. Ini adalah perubahan paling signifikan dibanding draf sebelumnya, dan langsung menjawab kebutuhan aplikasi yang "fleksibel, bisa ditambahkan fitur lain."

Komponen yang sengaja dihilangkan:

```text
WebSocket
CRDT
Hocuspocus
Liveblocks
Redis (sementara)
Microservices
Kubernetes
Multi-user permission
Collaboration
Plugin runtime pihak ketiga (registry tetap internal/compile-time)
```

Dengan pendekatan tersebut, proyek menjadi jauh lebih realistis untuk dikerjakan tetapi tetap memiliki fondasi yang cukup kuat untuk berkembang menjadi personal productivity platform yang besar — termasuk ke arah yang belum terpikirkan hari ini.
