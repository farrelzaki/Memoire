---
description: Scaffold modul NestJS baru (controller/service/repository/schema) mengikuti pola Memoire
argument-hint: <nama-modul> (contoh: templates, favorites)
---

Buat modul backend NestJS baru bernama **$ARGUMENTS** di `apps/api/src/$ARGUMENTS/`, mengikuti struktur yang sudah ada di modul `pages/` sebagai referensi pola.

Buat file-file berikut:

- `$ARGUMENTS.module.ts`
- `$ARGUMENTS.controller.ts` — hanya routing dan validasi input, tidak ada business logic
- `$ARGUMENTS.service.ts` — seluruh business logic ada di sini
- `$ARGUMENTS.repository.ts` — hanya akses data (Drizzle query), tidak ada business logic
- `$ARGUMENTS.schema.ts` — Zod schema untuk request/response modul ini

Aturan yang wajib diikuti (lihat `CLAUDE.md`):

- Operasi yang mengubah struktur data lintas tabel (misalnya menghapus parent yang punya banyak child) harus dibungkus database transaction.
- Endpoint yang mengembalikan list panjang harus mendukung pagination.
- Semua input divalidasi dengan Zod sebelum masuk ke service layer.
- Setelah modul dibuat, tulis integration test dengan Supertest untuk setiap endpoint (happy path + minimal satu error case).

Setelah selesai, tunjukkan daftar endpoint yang dibuat dalam format seperti Bagian 44 (API Design) di `docs/memoire_technical_plan.md`, supaya bisa saya tambahkan ke dokumentasi.
