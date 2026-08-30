---
description: Review perubahan/diff saat ini terhadap prinsip arsitektur di CLAUDE.md
---

Review perubahan kode yang belum di-commit (`git diff` dan file baru yang belum di-track) terhadap prinsip di `CLAUDE.md` dan `docs/memoire_technical_plan.md`.

Periksa secara spesifik:

1. **Content Type Registry** — apakah ada logic baru yang hardcode nama tipe page (document/database/whiteboard/diagram/dll) di luar modul `content-types/`? Kalau ada, tandai sebagai pelanggaran pola.
2. **Polymorphic pages** — apakah ada kode yang mengasumsikan setiap page selalu punya `blocks`, tanpa mengecek `pages.type` dulu?
3. **Larangan arsitektur** — apakah ada penambahan WebSocket, CRDT, GraphQL, Redis, microservices, atau plugin runtime pihak ketiga? Kalau ada, tandai dan minta konfirmasi eksplisit dari user karena ini bertentangan dengan prinsip proyek.
4. **Transaction safety** — apakah ada operasi yang mengubah beberapa tabel sekaligus (move, delete cascade) tanpa dibungkus transaction?
5. **JSONB vs kolom normal** — apakah ada data yang sebaiknya jadi kolom/tabel normal (karena akan di-filter/sort/relasikan) tapi malah ditaruh di JSONB, atau sebaliknya?
6. **Layer separation** — apakah ada business logic yang nyasar ke controller atau repository, alih-alih di service layer?
7. **Testing** — apakah perubahan di `content-types/`, `blocks/`, atau `databases/` sudah disertai test yang sesuai?

Keluarkan hasil dalam bentuk daftar temuan (kalau ada) dengan format:

```
[PELANGGARAN / SARAN] <file:baris> — <penjelasan singkat> — <rekomendasi perbaikan>
```

Jika tidak ada temuan, katakan secara eksplisit bahwa perubahan sudah konsisten dengan prinsip arsitektur — jangan mengarang temuan kalau memang tidak ada.
