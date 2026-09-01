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

# 29A. Sumber Daya Eksternal

Aplikasi ini **boleh** menghubungi internet. Yang tidak ada, dan tidak akan pernah ada, adalah
fitur yang melibatkan orang lain (§56.2). Keduanya sering tertukar; seksi ini memisahkannya.

```text
BOLEH     mengambil metadata untuk pratinjau tautan (blok bookmark)
          embed lewat iframe
          gambar, video, audio dari URL
          font atau aset dari CDN
          push service untuk notifikasi latar
          pemeriksaan pembaruan aplikasi desktop

DITUNDA   integrasi yang butuh akun pihak ketiga:
          Google Drive, Slack, Figma, Notion sync, GitHub, web clipper.
          Bukan dilarang selamanya -- belum dibutuhkan sekarang.

TIDAK     apa pun yang melibatkan pengguna lain (§56.2).
          Ini satu-satunya larangan permanen.
```

## 29A.1 Aturan mengambil data dari luar

Boleh bukan berarti sembarangan. Empat aturan berlaku untuk setiap permintaan keluar:

```text
1. Diambil dari SERVER, bukan dari browser.
   Pratinjau tautan di-fetch oleh NestJS lalu di-cache. Kalau browser yang menembak
   langsung, setiap situs yang pernah ditempel tahu alamat IP dan waktu baca pengguna.
   Ini aplikasi catatan pribadi; kebocoran itu tidak sepadan.

2. Timeout dan batas ukuran.
   5 detik, maksimal 1MB untuk halaman HTML, hanya ambil bagian <head> untuk
   metadata Open Graph. Situs yang lambat tidak boleh menggantung request pengguna.

3. Penjaga SSRF.
   Tolak alamat loopback, IP privat (10.x, 172.16-31.x, 192.168.x, 169.254.x),
   dan skema selain http/https. Tanpa ini, menempel http://localhost:3001/api/export/json
   ke sebuah halaman membuat server mengambil isinya sendiri dan menaruhnya di pratinjau.

4. Hasilnya di-cache dan konten tetap utuh tanpanya.
   Metadata bookmark disimpan di blocks.content. Bila pengambilan gagal atau
   sedang offline, blok tetap merender judul apa adanya sebagai tautan biasa --
   tidak pernah kosong, tidak pernah error.
```

## 29A.2 Embed

```text
iframe dengan sandbox="allow-scripts allow-same-origin allow-popups"
referrerpolicy="no-referrer"
loading="lazy"
daftar rasio aspek per penyedia yang dikenali, fallback 16:9
```

Embed selalu memuat situs pihak ketiga di dalam aplikasi. Sandbox dan `no-referrer` adalah batas
minimum; tanpa keduanya halaman yang di-embed bisa membaca konteks yang tidak seharusnya.

## 29A.3 Media

```text
Upload    melewati attachments dan object storage (§28) -- jalur utama
Dari URL  disimpan sebagai URL di blocks.content, dirender langsung
```

Keduanya didukung. Menyimpan sebagai URL berarti berkasnya bisa hilang sewaktu-waktu di luar
kendali kita, jadi UI menawarkan "simpan salinan" yang mengunduh dan memindahkannya ke object
storage. Untuk catatan yang ingin disimpan lama, upload tetap pilihan yang lebih baik — dan itu
disampaikan sebagai saran, bukan dipaksakan.

## 29A.4 Perilaku saat offline

Ini yang membuat aturan §29A.1 nomor 4 penting. Aplikasi punya dukungan offline (§14), dan sumber
daya eksternal adalah bagian pertama yang gagal saat jaringan hilang:

```text
Bookmark   metadata yang sudah di-cache tetap tampil; kalau belum pernah diambil,
           tampil sebagai tautan biasa
Embed      placeholder dengan judul dan tombol "muat ulang"
Media URL  placeholder; media hasil upload tetap tampil dari cache service worker
```

Tidak ada satu pun yang boleh membuat halaman gagal dirender. Konten pengguna selalu utuh; yang
hilang hanya hiasannya.

## 29A.5 Aset dan build

Self-hosting tetap **dianjurkan** untuk aset yang dipakai di setiap halaman — bukan karena aturan,
tapi karena lebih cepat dan tidak menambah titik gagal:

```text
Font KaTeX     ikut di paket npm; salin ke public/ (satu langkah, hilangkan CDN)
Grammar Shiki  pakai createHighlighterCore dengan ~20 bahasa yang diimpor eksplisit
               + dynamic import; ini soal ukuran bundel (~6MB penuh), bukan jaringan
Font teks      next/font/local bila ingin build yang bisa jalan tanpa jaringan;
               next/font/google boleh, tapi build jadi butuh internet
```
