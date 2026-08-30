---
description: Membuat Drizzle schema change + migration baru sesuai konvensi Memoire
argument-hint: <deskripsi perubahan> (contoh: "tambah kolom last_opened_at di pages")
---

Buat perubahan skema database untuk: **$ARGUMENTS**

Sebelum menulis kode, jawab dulu secara eksplisit (tulis sebagai bagian dari respons, bukan langsung eksekusi):

1. Apakah data ini butuh kolom/tabel normal, atau cukup masuk ke kolom JSONB yang sudah ada (`content`, `properties`, `values`, `elements`)? Ikuti prinsip: **JSONB untuk konten fleksibel, kolom/tabel normal untuk apa pun yang di-filter/di-sort/di-relasikan.**
2. Apakah perubahan ini butuh backfill data lama? Kalau ya, jelaskan strateginya sebelum menulis migration.
3. Apakah perubahan ini breaking untuk kode yang sudah ada (controller/service yang membaca kolom lama)?

Baru setelah itu:

4. Update schema di package Drizzle yang sesuai.
5. Generate migration file lewat Drizzle Kit — jangan tulis SQL migration secara manual kecuali migration generator tidak bisa menangani kasus ini.
6. Tambahkan index baru jika kolom ini akan sering di-query (lihat Bagian 47 — Database Indexes — untuk pola index yang sudah ada).
7. Jalankan migration di database lokal (docker compose) untuk memastikan tidak error.
8. Update Zod schema terkait di `$ARGUMENTS.schema.ts` modul yang relevan, supaya validasi API konsisten dengan skema baru.

Jangan menghapus kolom lama dalam migration yang sama dengan penambahan kolom baru — pisahkan jadi dua migration supaya rollback lebih aman.
