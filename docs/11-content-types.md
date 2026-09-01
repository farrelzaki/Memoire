> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §11A, §11B, §11C, §11D

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

# 11D. Kontrak Registry v2

§11A memperkenalkan `ContentTypeRegistry` untuk **tipe halaman**. Paritas Notion menambah sekitar
25 tipe blok, 12 tipe properti, dan 3 tipe view — dan masing-masing, kalau ditulis dengan cara
biasa, menyentuh slash menu, block menu, daftar "turn into", input rule, eksportir, dan ekstraktor
teks pencarian.

Itu persis pola yang dilarang Prinsip 3 (§57), hanya satu tingkat lebih rendah. Karena itu pola
registry diturunkan ke tiga tingkat lagi.

## 11D.1 Empat registry

```text
ContentTypeRegistry    tipe halaman     document, database, whiteboard, diagram   (§11A)
BlockTypeRegistry      tipe blok        paragraph, callout, columns, ...          (§12B)
PropertyTypeRegistry   tipe properti    text, select, relation, formula, ...      (§20A)
ViewTypeRegistry       tipe view        table, board, timeline, ...               (§21, §21B)
```

## 11D.2 BlockTypeRegistry

```text
key                nama tipe blok
label, icon        tampilan di menu
group              'basic' | 'media' | 'advanced' | 'database'
keywords           untuk pencarian di slash menu
tiptapExtension    node/mark Tiptap-nya
slashCommand       entri slash menu, opsional
turnIntoTargets    tipe apa saja yang bisa dituju dari blok ini
inputRule          aturan markdown, opsional
toHtml             WAJIB
toMarkdown         WAJIB
toPlainText        WAJIB
```

Ketiga serializer adalah **field wajib pada tipe TypeScript-nya**. Konsekuensinya: sebuah tipe blok
baru tidak bisa dikompilasi sampai jalur ekspornya lengkap. Compiler yang menegakkan paritas ekspor,
bukan review kode — dengan 25 tipe blok, review kode pasti kebobolan cepat atau lambat.

Konsumen yang membaca registry ini: slash menu, block menu, turn-into, paste markdown, eksportir
HTML/Markdown/CSV, route cetak, ekstraktor teks untuk cuplikan pencarian, dan penghitung kata.

## 11D.3 PropertyTypeRegistry

```text
key
label, icon
cellRenderer       tampilan nilai di tabel
editorRenderer     editor nilainya
configSchema       Zod, per tipe (§20A.3)
filterOperators    operator yang masuk akal untuk tipe ini (§22A.3)
calculations       fungsi agregasi yang berlaku (§20B, dipakai ulang oleh rollup §24B)
sortComparator     untuk overlay klien
toCsv              ekspor
toPlainText        untuk pencarian
```

Menambahkan `multi_select` berarti satu entri registry plus satu skema config — bukan penyisiran
`database-views.tsx` yang sekarang sudah 438 baris dan akan tumbuh berkali lipat.

## 11D.4 ViewTypeRegistry

```text
key
label, icon
configSchema       varian dari viewConfigSchema (§21A.1)
component          komponen render
requiredProperties apa yang wajib ada sebelum view bisa dibuat
                   (calendar butuh properti date, timeline butuh date, board butuh
                    select/status) -- dipakai untuk menonaktifkan pilihan yang mustahil
                    di menu "tambah view", bukan menampilkan error setelah dibuat
supportsGrouping   boolean
```

## 11D.5 Batasan yang disengaja

Sama seperti §11A.4: keempat registry adalah **pola internal, compile-time**. Bukan sistem plugin,
tidak bisa dipasang saat runtime, dan menambah tipe baru tetap butuh deploy ulang. Ini keputusan
sadar (§56) — registry di sini untuk mengendalikan penyebaran perubahan di dalam kode, bukan untuk
membuka ekstensibilitas pihak ketiga.
