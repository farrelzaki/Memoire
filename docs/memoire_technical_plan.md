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

Meniru Notion 100% (termasuk seluruh internal formula engine, semua edge-case block, dan performa mereka di skala jutaan halaman) adalah pekerjaan tim besar bertahun-tahun. Yang realistis dan bernilai untuk proyek personal adalah meniru **mental model dan UX inti** Notion, sambil membangun fondasi yang genuinely extensible — sehingga Memoire bisa tumbuh melebihi Notion di area yang Notion sendiri tidak punya secara native, seperti whiteboard dan diagram.

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

# 6. Storage

Ada dua jenis data:

### Structured data

Disimpan di PostgreSQL:

- pages
- blocks
- databases
- database properties
- database rows
- tags
- settings
- templates

### Binary files

Disimpan di object storage:

- images
- PDFs
- videos
- audio
- attachments

Untuk development lokal:

**MinIO**

Untuk production:

**S3-compatible storage**

Contoh:

- AWS S3
- Cloudflare R2
- Backblaze B2
- MinIO server sendiri

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

# 11A. Extensible Content Type System

Ini adalah **jawaban langsung untuk kebutuhan "sistem fleksibel, bisa ditambah fitur lain seperti whiteboard dan diagram."**

Tanpa lapisan ini, setiap fitur baru (whiteboard, diagram, mind map, kanban standalone, dsb) akan memaksa perubahan pada routing, sidebar, command palette, dan API secara terpisah-pisah dan tidak konsisten. Content Type System membuat penambahan fitur baru menjadi **mendaftarkan satu modul**, bukan menyentuh banyak tempat.

## 11A.1 Konsep

Setiap "Content Type" (document, database, whiteboard, diagram, ...) mendefinisikan kontrak yang sama, di frontend maupun backend.

**Backend — kontrak per Content Type:**

```text
ContentTypeModule
- key                     -- 'document' | 'whiteboard' | 'diagram' | ...
- createDefaultContent()  -- dipanggil saat page baru dibuat
- getContent(pageId)
- updateContent(pageId, data)
- deleteContent(pageId)
- exportContent(pageId, format)
- validateContent(data)   -- Zod schema khusus tipe ini
```

**Frontend — kontrak per Content Type:**

```text
ContentTypeDefinition
- key
- label                 -- "Document", "Whiteboard", "Diagram"
- icon
- renderer              -- komponen React yang dirender di area konten
- createInSlashMenu      -- true/false, muncul di slash command "/"
- createInSidebar        -- true/false, muncul di tombol "New" sidebar
- createInCommandPalette -- true/false
```

## 11A.2 Registry Pattern

```text
ContentTypeRegistry
  .register('document',   DocumentContentType)
  .register('database',   DatabaseContentType)
  .register('whiteboard', WhiteboardContentType)
  .register('diagram',    DiagramContentType)
```

Ketika sebuah Page dibuka:

```text
GET /pages/:id
     |
     v
page.type
     |
     v
ContentTypeRegistry.get(page.type)
     |
     +-- backend: panggil .getContent(pageId)
     +-- frontend: render .renderer dengan data tersebut
```

## 11A.3 Menambahkan Content Type baru di masa depan

Untuk menambah tipe baru (misal "Mind Map" atau "Kanban standalone"), langkah yang diperlukan konsisten:

```text
1. Buat modul backend baru di src/content-types/<nama>/
2. Implementasikan kontrak ContentTypeModule
3. Buat komponen renderer frontend di features/content-types/<nama>/
4. Daftarkan ke ContentTypeRegistry (backend & frontend)
5. Selesai — otomatis muncul di slash command, sidebar "New", command palette
```

Tidak perlu mengubah struktur `pages`, `page_canvases`, sidebar, atau command palette secara manual — mereka membaca dari registry.

## 11A.4 Batasan yang disengaja

Tetap ada bagian yang **tidak** dibuat generic demi kesederhanaan:
- `document` dan `database` tetap punya jalur khusus di kode (mereka adalah tipe inti, bukan plugin eksternal).
- Registry ini adalah pola internal untuk kerapian kode — bukan sistem plugin pihak ketiga yang bisa di-install runtime. Menambah tipe baru tetap butuh deploy ulang aplikasi. Ini keputusan sadar agar tidak overengineered untuk aplikasi personal.

---

# 11B. Whiteboard Page Type

## 11B.1 Rekomendasi Library

**Excalidraw** (`@excalidraw/excalidraw`)

Alasan:

- Open-source, MIT license, bisa di-self-host penuh (tidak butuh service eksternal).
- Komponen React siap pakai, tinggal di-embed.
- Format data JSON native, mudah disimpan ke `page_canvases.elements`.
- Mendukung export ke PNG/SVG secara built-in — berguna untuk thumbnail page di sidebar.
- Terasa familiar (dipakai banyak aplikasi lain), sehingga kurva belajar pengguna rendah.

Alternatif: **tldraw** — lebih modern dan sangat customizable, tapi lisensi tldraw versi terbaru memiliki syarat komersial tertentu untuk penggunaan production; perlu dicek ulang sebelum dipakai. Untuk MVP, Excalidraw lebih aman dari sisi lisensi.

## 11B.2 Alur Kerja

```text
Buka page (type = whiteboard)
       |
       v
GET /pages/:id/canvas
       |
       v
Excalidraw component (initialData = elements)
       |
       v
User menggambar
       |
       v
onChange → debounce 800ms
       |
       v
PATCH /pages/:id/canvas
       |
       v
page_canvases.elements
```

## 11B.3 Fitur MVP vs Lanjutan

MVP:

```text
Shape dasar (rectangle, ellipse, arrow, line)
Text
Freehand draw
Sticky note
Pan & zoom
Undo/redo (built-in Excalidraw)
```

Lanjutan:

```text
Embed image ke canvas
Export PNG/SVG
Link antar elemen ke page lain
Multiple canvas per page (frame)
```

---

# 11C. Diagram Page Type

Whiteboard cocok untuk sketsa bebas. Diagram cocok untuk struktur formal seperti flowchart, mind map, atau arsitektur sistem — sehingga dipisah sebagai Content Type tersendiri, bukan digabung dengan whiteboard.

## 11C.1 Rekomendasi Library

**React Flow** (`@xyflow/react`)

Alasan:

- Dibangun khusus untuk node-based diagram (flowchart, mind map, org chart, dependency graph).
- Data model node/edge yang bersih dan mudah divalidasi.
- Auto-layout, minimap, dan snapping tersedia sebagai plugin resmi.
- Aktif dikembangkan dan populer untuk use-case ini.

## 11C.2 Dua Cara Membuat Diagram

Sediakan dua jalur agar fleksibel sesuai kebutuhan:

```text
1. Diagram Page (full page, type = 'diagram')
   → React Flow penuh satu halaman, untuk diagram kompleks.

2. Mermaid block (di dalam document biasa)
   → Blok kode dengan syntax Mermaid, dirender jadi diagram sederhana inline.
   → Cocok untuk diagram cepat di tengah catatan, tanpa buka halaman baru.
```

Mermaid block cukup ditambahkan sebagai satu block type baru (lihat 11.2 — Block type lanjutan) yang me-render teks Mermaid menjadi SVG di client-side, tanpa perlu tabel baru — konsisten dengan prinsip "jangan bangun lebih dari yang dibutuhkan".

## 11C.3 Alur Kerja Diagram Page

Sama seperti Whiteboard, hanya berbeda struktur data (`nodes` + `edges` alih-alih `elements`) dan komponen renderer (`ReactFlow` alih-alih `Excalidraw`).

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

# 14. Offline Support

Offline-first tidak wajib untuk MVP, tetapi sangat cocok untuk aplikasi personal.

Tahap awal:

```text
Online only
```

Tahap lanjut:

```text
Browser
  |
  +-- IndexedDB
  |
  +-- Local cache
  |
  +-- Pending changes
  |
  v
Backend
```

Teknologi yang dapat dipertimbangkan:

- IndexedDB
- Dexie
- TanStack Query persistence
- Service Worker
- PWA

Karena tidak ada collaboration, offline synchronization menjadi jauh lebih sederhana.

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

# 28. File Handling

Flow upload:

```text
User selects file
       |
       v
Frontend
       |
       v
Backend validation
       |
       v
Object Storage
       |
       v
Attachment record
       |
       v
Block references attachment
```

Validasi:

- MIME type
- file size
- extension
- filename

Gunakan signed URL untuk storage bila diperlukan.

---

# 29. Image System

Image block perlu mendukung:

```text
Upload
URL
Resize
Caption
Alt text
Delete
Replace
```

Tahap lanjutan:

```text
Crop
Compression
Thumbnail
Lazy loading
```

---

# 30. Import / Export

Karena aplikasi personal, fitur backup sangat penting.

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

Tahap lanjut:

```text
HTML
CSV
```

---

# 31. Backup

Backup harus menjadi fitur inti.

Contoh:

```text
Export Workspace
        |
        v
workspace-backup.zip
```

Isi:

```text
backup/
├── pages.json
├── blocks.json
├── databases.json
├── rows.json
├── settings.json
└── attachments/
```

Tambahkan backup otomatis bila aplikasi sudah stabil.

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

# 34. Themes

Minimal:

```text
Light
Dark
System
```

CSS variable digunakan agar theme mudah dikembangkan.

Jangan hardcode warna ke setiap component.

---

# 35. Settings

## General

- application name
- language
- timezone
- start page

## Appearance

- theme
- font
- editor width
- compact mode

## Editor

- spell check
- default block
- markdown shortcuts
- autosave

## Storage

- attachment location
- backup location

## Backup

- export
- import
- automatic backup

---

# 36. Desktop App

Desktop application sebaiknya dibuat setelah web version stabil.

Rekomendasi:

**Tauri**

Struktur:

```text
Tauri
  |
  v
Next.js frontend
  |
  v
same NestJS API
```

Alternatif:

**Electron**

Pilih Tauri jika prioritasnya footprint yang lebih ringan.

---

# 37. PWA

Sebelum membuat desktop app, pertimbangkan PWA.

Fitur:

- installable
- offline cache
- app-like window
- icon
- startup page

Ini bisa menjadi langkah murah menuju pengalaman seperti aplikasi native.

---

# 38. Security

Karena personal, security tetap penting.

Minimal:

- HTTPS
- secure session/cookie
- password hashing jika ada login
- input validation
- file type validation
- file size limit
- SQL injection protection melalui ORM/parameterized query
- XSS protection
- CSRF protection sesuai authentication architecture
- secure headers
- backup encryption bila menyimpan data sensitif

Untuk markdown/HTML rendering, sanitization wajib.

---

# 39. Validation

Gunakan:

**Zod**

Di frontend dan backend untuk shared validation bila memungkinkan.

Contoh:

```text
CreatePageSchema
UpdatePageSchema
CreateDatabaseSchema
CreateAttachmentSchema
```

---

# 40. Testing

## Unit Test

Gunakan:

**Vitest**

Test:

- database logic
- formula parser
- filters
- sorting
- page tree
- validation

## Integration Test

Gunakan:

**Supertest**

Test API.

## End-to-End Test

Gunakan:

**Playwright**

Test flow:

```text
Login
→ create page
→ type content
→ reload
→ content remains
```

dan:

```text
Create database
→ create row
→ filter
→ sort
→ reload
```

---

# 41. Project Structure

Rekomendasi monorepo:

```text
memoire/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   └── content-types/    -- document, database, whiteboard, diagram
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── lib/
│   │
│   └── api/
│       └── src/
│           ├── auth/
│           ├── pages/
│           ├── content-types/    -- ContentTypeRegistry + per-type module
│           ├── blocks/
│           ├── databases/
│           ├── attachments/
│           ├── search/
│           ├── templates/
│           ├── backup/
│           └── settings/
│
├── packages/
│   ├── ui/
│   ├── editor/
│   ├── types/
│   ├── validation/
│   └── config/
│
├── infra/
│   ├── docker/
│   └── nginx/
│
├── docs/
│
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

---

# 42. Feature Modules Frontend

```text
features/
├── sidebar/
├── page/
├── editor/
├── block/
├── content-types/          -- ContentTypeRegistry frontend (lihat 11A)
│   ├── document/
│   ├── database/
│   ├── whiteboard/         -- wrapper Excalidraw
│   └── diagram/            -- wrapper React Flow
├── database/
├── search/
├── command-palette/
├── attachment/
├── templates/
├── settings/
└── backup/
```

Jangan membuat semua logic di satu `components/` folder.

---

# 43. Feature Modules Backend

```text
src/
├── pages/
│   ├── pages.controller.ts
│   ├── pages.service.ts
│   ├── pages.repository.ts
│   └── pages.schema.ts
│
├── content-types/              -- implementasi ContentTypeRegistry (lihat 11A)
│   ├── content-type.registry.ts
│   ├── document/
│   ├── database/
│   ├── whiteboard/
│   │   ├── whiteboard.controller.ts
│   │   ├── whiteboard.service.ts
│   │   └── whiteboard.schema.ts
│   └── diagram/
│       ├── diagram.controller.ts
│       ├── diagram.service.ts
│       └── diagram.schema.ts
│
├── blocks/
├── databases/
├── attachments/
├── search/
├── templates/
├── backup/
└── settings/
```

Service layer menangani business logic. Setiap folder di dalam `content-types/` adalah modul yang mandiri dan didaftarkan ke `content-type.registry.ts` — inilah yang membuat penambahan tipe page baru (mind map, kanban standalone, dst) tidak menyentuh modul lain.

---

# 44. API Design

## Pages

```http
GET    /pages
GET    /pages/:id
POST   /pages
PATCH  /pages/:id
DELETE /pages/:id
POST   /pages/:id/duplicate
POST   /pages/:id/move
POST   /pages/:id/archive
POST   /pages/:id/restore
```

## Blocks

```http
GET    /pages/:id/blocks
POST   /pages/:id/blocks
PATCH  /blocks/:id
DELETE /blocks/:id
POST   /blocks/:id/move
POST   /blocks/:id/duplicate
```

## Databases

```http
GET    /databases/:id
POST   /databases
PATCH  /databases/:id
DELETE /databases/:id
POST   /databases/:id/rows
PATCH  /database-rows/:id
DELETE /database-rows/:id
```

## Canvas (Whiteboard & Diagram)

```http
GET    /pages/:id/canvas
PATCH  /pages/:id/canvas
POST   /pages/:id/canvas/export     -- PNG/SVG
```

## Search

```http
GET /search?q=...
```

## Attachments

```http
POST   /attachments/upload
GET    /attachments/:id
DELETE /attachments/:id
```

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

# 46. Performance Strategy

MVP:

- pagination untuk daftar besar
- lazy loading attachments
- debounced autosave
- database indexes
- cache browser
- virtualized database table bila diperlukan

Editor:

Jangan merender ribuan block sekaligus bila belum diperlukan.

Database table:

Gunakan virtualization ketika row menjadi sangat banyak.

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

---

# 48. Development Environment

Gunakan Docker Compose untuk dependency lokal.

```yaml
services:
  postgres:
    image: postgres

  minio:
    image: minio/minio
```

Redis belum perlu dimasukkan sebelum memang dibutuhkan.

Development stack:

```text
Node.js
pnpm
Docker
PostgreSQL
MinIO
```

---

# 49. Git Workflow

Repository:

```text
main
```

Development:

```text
dev
```

Feature branch:

```text
feature/editor
feature/database
feature/search
feature/backup
```

Commit format:

```text
feat: add page tree
fix: prevent duplicate blocks
refactor: simplify page service
test: add database filter tests
docs: update architecture
```

---

# 50. CI/CD

Gunakan GitHub Actions untuk:

```text
push
  |
  +-- typecheck
  +-- lint
  +-- unit test
  +-- build
  +-- e2e test
```

Tidak perlu pipeline deployment yang kompleks pada tahap awal.

---

# 51. MVP Scope

MVP harus jauh lebih kecil dari Notion.

## MVP wajib

```text
Authentication lokal opsional
Workspace
Sidebar
Page hierarchy
Page CRUD
Block editor
Paragraph
Heading
List
Todo
Quote
Code
Divider
Image
Slash command
Block menu
Autosave
Dark mode
Search page
Trash
Export JSON
```

## MVP database

```text
Database
Table view
Title
Text
Number
Select
Checkbox
Date
Filter
Sort
```

Dengan fitur tersebut, aplikasi sudah terasa seperti personal Notion versi dasar.

---

# 52. Phase 2

Setelah MVP stabil:

```text
Drag & drop
Nested blocks
Board view
List view
Calendar view
Gallery view
Templates
Command palette
Full text search
Markdown import/export
CSV import/export
File attachments
Cover image
Bookmarks
Content Type Registry (fondasi plugin, lihat 11A)
Whiteboard page type (Excalidraw)
Mermaid block (inline diagram di document)
```

---

# 53. Phase 3

Fitur advanced:

```text
Relation
Rollup
Formula
Page backlinks
Database views yang lebih fleksibel
Advanced filters
Advanced sorting
Page history
Version restore
Automatic backup
Offline mode
PWA
Diagram page type (React Flow)
Canvas export (PNG/SVG) untuk whiteboard & diagram
```

---

# 54. Phase 4

Desktop-focused improvements:

```text
Tauri desktop
Global shortcut
System tray
Local cache
Offline-first
Native file picker
Auto update
```

---

# 55. Roadmap Development

## Sprint 1 — Foundation

```text
Project setup
Monorepo
Next.js
NestJS
PostgreSQL
Drizzle
Docker
CI
```

## Sprint 2 — Workspace

```text
Workspace
Sidebar
Page hierarchy
Page CRUD
Trash
Favorites
```

## Sprint 3 — Editor

```text
Tiptap
Basic blocks
Slash command
Block menu
Autosave
```

## Sprint 4 — Media

```text
Image upload
Attachment
Object storage
Preview
```

## Sprint 5 — Database

```text
Database
Properties
Rows
Table view
Filter
Sort
```

## Sprint 6 — UX

```text
Command palette
Keyboard shortcuts
Drag & drop
Dark mode
Responsive UI
```

## Sprint 7 — Search + Backup

```text
Search
Export
Import
Backup
```

## Sprint 8 — Advanced database

```text
Board
Calendar
Gallery
Relation
Formula
```

## Sprint 9 — Content Type System & Whiteboard

```text
ContentTypeRegistry (backend + frontend)
Refactor pages agar polymorphic (kolom type)
Whiteboard page type
Excalidraw integration
page_canvases table
```

## Sprint 10 — Diagram

```text
Diagram page type
React Flow integration
Mermaid block (inline)
Canvas export PNG/SVG
```

## Sprint 11 — Offline

```text
IndexedDB
Local cache
PWA
Offline editing
```

## Sprint 12 — Desktop

```text
Tauri
Native packaging
Auto update
```

---

# 56. Hal yang Tidak Perlu Dibangun

Jangan membuat:

```text
Microservices
Kubernetes
GraphQL
Kafka
WebSocket
CRDT
Real-time collaboration
Multi-user permission
Team management
Email invitation
Social feed
```

setidaknya sampai ada alasan nyata untuk membutuhkannya.

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

---

# 60. Error Handling

API harus mengembalikan format error konsisten.

Contoh:

```json
{
  "success": false,
  "error": {
    "code": "PAGE_NOT_FOUND",
    "message": "Page does not exist"
  }
}
```

Frontend harus memiliki:

- toast
- retry
- empty state
- loading state
- error state

---

# 61. Empty States

Jangan membiarkan UI kosong tanpa konteks.

Contoh:

```text
No pages yet.
Create your first page.
```

Database:

```text
No rows yet.
Add your first item.
```

Search:

```text
No results found.
```

---

# 62. Observability

Karena aplikasi personal, observability tidak perlu kompleks.

Minimal:

- server logs
- error logging
- database migration logs
- backup logs

Tahap lanjut dapat menggunakan:

- Sentry
- OpenTelemetry

Tidak wajib pada MVP.

---

# 63. Deployment Options

## Opsi A — Local only

```text
Browser
   |
localhost
   |
Next.js
NestJS
PostgreSQL
MinIO
```

Cocok untuk private personal use.

## Opsi B — Private VPS

```text
Internet
   |
Cloudflare
   |
Nginx
   |
Docker
   |
Next.js + NestJS
   |
PostgreSQL + Object Storage
```

## Opsi C — Cloud-managed

Frontend:

- Vercel atau platform sejenis

Backend:

- VPS / container platform

Database:

- managed PostgreSQL

Storage:

- S3-compatible

---

# 64. Recommended Final Stack

```text
Frontend
-------------------------
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Tiptap
Zustand
TanStack Query
Excalidraw        (whiteboard content type)
React Flow        (diagram content type)
Mermaid           (inline diagram block di dalam document)

Backend
-------------------------
NestJS
TypeScript
REST API
Zod

Database
-------------------------
PostgreSQL
Drizzle ORM

Storage
-------------------------
S3-compatible storage
MinIO for local development

Testing
-------------------------
Vitest
Supertest
Playwright

DevOps
-------------------------
Git
GitHub
Docker
Docker Compose
GitHub Actions

Desktop
-------------------------
Tauri

Optional later
-------------------------
Redis
Meilisearch
Sentry
PWA
IndexedDB / Dexie
```

---

# 65. Recommended Build Order

Urutan yang paling aman:

```text
1. Project setup
2. Database schema (termasuk kolom pages.type sejak awal)
3. Page hierarchy
4. Sidebar
5. Tiptap editor
6. Basic blocks
7. Autosave
8. Slash commands
9. Block menu
10. File upload
11. Database engine
12. Table view
13. Filter/sort
14. Search
15. Templates
16. Import/export
17. Backup
18. Advanced database
19. Content Type Registry (backend + frontend)
20. Whiteboard page type
21. Diagram page type + Mermaid block
22. Offline support
23. Desktop app
```

Jangan mulai dari database view sebelum editor dan page hierarchy stabil.

**Penting:** kolom `pages.type` sebaiknya sudah ada sejak Sprint 1/2, walaupun whiteboard dan diagram baru dikerjakan jauh belakangan. Menambahkan kolom polymorphic di awal jauh lebih murah daripada migrasi besar setelah ratusan page tersimpan dengan asumsi lama.

---

# 66. Definition of Done untuk MVP

MVP dapat dianggap selesai ketika pengguna dapat:

```text
1. Membuka aplikasi
2. Membuat halaman
3. Membuat sub-halaman
4. Menulis dokumen
5. Menggunakan block
6. Menggunakan slash command
7. Mengubah dan memindahkan block
8. Mengunggah gambar
9. Menutup halaman
10. Membuka kembali halaman
11. Melihat data yang tersimpan
12. Mencari halaman
13. Menghapus halaman
14. Memulihkan halaman
15. Membuat database
16. Menambahkan row
17. Mengubah property
18. Melakukan filter
19. Melakukan sorting
20. Mengekspor data
```

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
