---
description: Membuat/memperluas Playwright test untuk sebuah user flow kritis di Memoire
argument-hint: <deskripsi flow> (contoh: "buat whiteboard, gambar shape, reload, shape masih ada")
---

Buat Playwright end-to-end test untuk flow berikut: **$ARGUMENTS**

Ikuti pola test yang sudah ada di Bagian 40 (`docs/memoire_technical_plan.md`) sebagai referensi gaya penulisan, misalnya:

```text
Login (jika ada auth lokal)
→ create page
→ type content
→ reload
→ content remains
```

Langkah kerja:

1. Cek apakah sudah ada test file yang relevan di folder e2e — kalau ada flow serupa, tambahkan test case baru di file yang sama, jangan buat file terpisah yang duplikatif.
2. Tulis test dengan assertion yang konkret terhadap state akhir (bukan cuma "tidak error"), termasuk verifikasi setelah reload/refresh untuk memastikan data benar-benar persisten di backend, bukan cuma di state React.
3. Kalau flow ini melibatkan Content Type tertentu (whiteboard/diagram), pastikan test menunggu library terkait (Excalidraw/React Flow) selesai mounting sebelum melakukan interaksi — hindari flaky test karena race condition rendering canvas.
4. Jalankan test ini secara lokal dan laporkan hasilnya sebelum menganggap task selesai.
