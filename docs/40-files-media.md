> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §6, §28, §29, §29A

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

# 29A. Kebijakan Media Self-Hosted

Aturan tunggal yang membentuk banyak keputusan lain di dokumen ini:

> **Aplikasi ini tidak pernah membuat permintaan jaringan ke host mana pun selain API-nya sendiri.**

## 29A.1 Cakupan

Berlaku untuk kode frontend maupun backend, saat runtime maupun saat build.

```text
Dilarang
  fetch/XHR ke host pihak ketiga, dari browser maupun dari NestJS
  iframe apa pun
  <img>, <video>, <audio> yang src-nya menunjuk ke luar
  font, script, atau CSS dari CDN
  pengambilan metadata Open Graph untuk pratinjau tautan
  push service / VAPID
  unduhan aset saat build (termasuk next/font/google)

Diizinkan
  permintaan ke API Memoire sendiri
  berkas dari object storage sendiri (MinIO/S3), disalurkan lewat API
  aset yang di-bundle atau ada di public/
```

## 29A.2 Konsekuensi yang sudah diterima

```text
Tidak ada blok bookmark / pratinjau tautan   -- alamat luar tetap teks yang bisa diklik
Tidak ada blok embed (YouTube, Figma, dll)
Tidak ada gambar/video dari URL              -- upload saja
Tidak ada notifikasi latar saat aplikasi tertutup  -- §70.5
Tidak ada galeri template daring             -- template lokal saja
Tidak ada auto-update yang mengunduh sendiri -- §36
```

Semuanya punya padanan berbasis upload atau lokal, kecuali notifikasi latar, yang memang tidak bisa
didapat tanpa melanggar aturan ini (§70.5, §72).

## 29A.3 Aset yang mudah bocor tanpa disadari

Tiga hal berikut secara default mengambil dari internet, dan ketiganya ada di rencana:

```text
KaTeX    font-nya ikut di paket npm; SALIN ke public/, jangan pakai contoh dokumentasi
         resminya yang menunjuk cdn.jsdelivr.net
Shiki    bundel penuhnya ~6MB grammar; pakai createHighlighterCore dengan sekitar 20
         bahasa yang diimpor eksplisit, dan dynamic import saat blok kode pertama dirender
Font     self-host di public/fonts lewat next/font/local.
         next/font/google MENGUNDUH SAAT BUILD -- build jadi tidak bisa offline
```

## 29A.4 Cara menjaganya tetap benar

Aturan seperti ini pelan-pelan bocor kalau hanya ditulis. Karena itu §40 menambahkan satu tes
Playwright yang **gagal bila ada permintaan ke origin non-lokal** selama penelusuran penuh
aplikasi. Itu satu-satunya mekanisme yang benar-benar menahan aturan ini seiring waktu; sisanya
adalah niat baik.
