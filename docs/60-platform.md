> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §14, §34, §35, §35A, §36, §37, §38, §70

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

# 35A. Model Settings

§35 mendaftar kelompok pengaturan. Belum ada satu pun UI-nya. Seksi ini menetapkan bentuk datanya.

## 35A.1 Penyimpanan

```text
settings           tabel key-value, satu pengguna
- key    text primary key
- value  jsonb
```

Tabel key-value, bukan satu baris berkolom banyak: menambah pengaturan baru tidak boleh butuh
migrasi. Bentuk keseluruhannya divalidasi oleh satu skema Zod di `@memoire/validation` (§39A),
jadi kebebasan JSONB tidak berarti kebebasan bentuk.

**Yang tidak masuk ke sini:** preferensi per perangkat — lebar sidebar, seksi yang terbuka, state
lipat toggle, "Recents". Semuanya tetap di localStorage; menyimpannya di server berarti satu tulis
basis data setiap kali sesuatu dibuka-tutup.

Preferensi per halaman (full width, small text) sekarang ada di localStorage lewat
`stores/page-prefs.ts`. Keduanya **pindah** ke `pages.settings` (§10A.1) supaya ikut berpindah
antar perangkat — itu properti halaman, bukan preferensi perangkat.

## 35A.2 Isi

```text
Tampilan
  theme            light | dark | system
  accentColor
  fontFamily       default | serif | mono
  defaultPageWidth normal | full
  smallTextDefault

Regional
  language         id | en
  dateFormat
  timeFormat       12 | 24
  weekStart        senin | minggu
  timezone

Editor
  spellcheck
  autoNumberHeadings

Notifikasi                                    -- §70
  browserNotifications
  reminderDefaultTime
  reminderDefaultOffset

Penyimpanan & data
  storageUsage         (baca saja: jumlah lampiran, total ukuran)
  trashRetentionDays
  versionRetention     -- §33A.3
  backupSchedule       -- lokal saja

Danger zone
  hapus semua data workspace, dengan konfirmasi ketik-untuk-yakin
```

## 35A.3 Yang sengaja tidak ada

```text
Members, guests, permission     -- satu pengguna (§56)
Plan, billing                   -- tidak ada layanan
Connections, integrations       -- ditunda, belum dibutuhkan (§56.3)
Public sites, domain            -- tidak ada penerbitan
Analytics workspace             -- tidak ada yang perlu diukur untuk orang lain
```

Halaman Settings di Notion sebagian besar berisi hal-hal ini. Menghapusnya membuat Settings di
Memoire jauh lebih pendek — dan itu benar, bukan kekurangan.

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

# 70. Reminder & Notifikasi

Untuk perencanaan pribadi, tanggal tanpa pengingat setengah berguna. Ini satu-satunya area di
rencana ini yang menambah infrastruktur baru — dan ia bisa dibangun tanpa Redis, tanpa antrean
eksternal, dan tanpa layanan push.

## 70.1 Tabel

```text
reminders
- id
- source            'date_property' | 'inline_mention' | 'manual'
- page_id           null    -- target yang dibuka saat diklik
- database_row_id   null
- property_id       null
- block_id          null    -- stabil berkat §11E
- remind_at         timestamptz not null
- recurrence        jsonb null   -- { freq, interval, byWeekday[], until, count }
- message           text
- status            'pending' | 'sent' | 'dismissed' | 'cancelled'
- created_at, updated_at
index (status, remind_at)

notifications
- id
- kind              'reminder' | 'system' | 'backup' | 'recompute'
- title, body
- target_page_id null, target_row_id null, target_block_id null
- is_read           boolean default false
- created_at
index (is_read, created_at desc)
```

## 70.2 Dari mana reminder lahir

```text
Properti date dengan config.reminder (§20A.3)
  baris reminders dibuat/diubah/dibatalkan DI TRANSAKSI YANG SAMA dengan penulisan
  nilai barisnya -- sehingga sebuah reminder tidak mungkin bertahan setelah tanggalnya
  dikosongkan

Mention @tanggal inline dengan flag reminder (§12A.3)
  direkonsiliasi saat blok disimpan, dengan menelusuri dokumen
  deterministik karena block_id stabil

Manual
  "Ingatkan saya" dari menu halaman
```

## 70.3 Scheduler

`@nestjs/schedule`, setiap 30 detik:

```sql
select * from reminders
 where status = 'pending' and remind_at <= now()
 order by remind_at
 limit 100
   for update skip locked;
```

Untuk setiap baris: sisipkan `notifications`, tandai `sent`, dan bila ada `recurrence` hitung
kemunculan berikutnya dengan date-fns lalu sisipkan reminder `pending` penerusnya.

`FOR UPDATE SKIP LOCKED` membuatnya aman bahkan bila proses `dev` dan `start` berjalan bersamaan —
tidak perlu lock terdistribusi, tidak perlu Redis.

Recurrence ditulis sendiri (harian/mingguan/bulanan/tahunan + interval + hari dalam minggu), bukan
menarik `rrule`. Permukaan penuh RFC-5545 tidak dibutuhkan aplikasi pribadi.

## 70.4 Pengiriman

```text
In-app
  TanStack Query polling GET /notifications?unread=1 tiap 30 detik selama tab terlihat
  (refetchIntervalInBackground: false)
  Inbox popover di topbar: badge belum dibaca, tandai dibaca, klik untuk membuka target

Notifikasi browser
  saat polling mengembalikan item baru, HALAMAN memanggil
    navigator.serviceWorker.ready.then(r => r.showNotification(...))
  service worker menangani notificationclick untuk fokus/membuka target
  memakai apps/web/public/sw.js yang sudah ada dari Sprint 11
  cukup untuk notifikasi selama aplikasi terbuka, tanpa layanan apa pun
```

## 70.5 Pengiriman latar

Polling di §70.4 hanya bekerja selama ada tab yang terbuka. Untuk reminder yang berbunyi walau
aplikasi tertutup, ada dua jalur, dan keduanya dipakai:

```text
Web Push (VAPID)   service worker berlangganan ke push service browser.
                   Butuh sepasang kunci VAPID dan endpoint push milik vendor browser.
                   Bekerja di web, termasuk saat tab tertutup.

Tauri (§36)        poller lokal di dalam shell desktop memanggil API sendiri lalu
                   memunculkan notifikasi OS asli. Tidak butuh layanan apa pun,
                   dan lebih andal di desktop karena tidak bergantung browser.
```

Urutan pengerjaan: Web Push di Sprint 26, notifikasi OS Tauri di Sprint 29.

Apa pun jalurnya, reminder yang terlewat tetap dikelompokkan sebagai "Terlewat" saat aplikasi
dibuka — pengiriman latar bisa gagal karena izin ditolak, perangkat mati, atau langganan kedaluwarsa,
dan pengguna tidak boleh kehilangan pengingat karena itu.

## 70.6 Tampilan "Upcoming"

Satu halaman yang mengumpulkan properti tanggal dari **semua** database ("apa yang jatuh tempo
minggu ini"), lintas database. Dibangun di atas `POST /databases/:id/query` (§22A) yang dijalankan
per database lalu digabung — tanpa mesin kueri lintas-database baru.
