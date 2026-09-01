> Bagian dari **Memoire Technical Planning**. Indeks: [`memoire_technical_plan.md`](./memoire_technical_plan.md)
> Seksi di file ini: §40, §41, §42, §43, §46, §48, §49, §50, §60, §61, §62, §63

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
