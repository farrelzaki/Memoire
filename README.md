# Memoire

Personal knowledge management / productivity app (Notion-inspired), built for a
**single user**. No multi-user, no realtime collaboration.

Full architecture: see [`memoire_technical_plan.md`](./memoire_technical_plan.md)
and [`CLAUDE.md`](./CLAUDE.md).

## Stack

- **Frontend** — Next.js, React, TypeScript, Tailwind CSS
- **Backend** — NestJS, TypeScript, REST + Zod
- **Database** — PostgreSQL + Drizzle ORM
- **Storage** — S3-compatible (MinIO locally)

## Layout

```text
apps/web     Next.js frontend
apps/api     NestJS backend
packages/    shared packages (config, validation, types, ui, editor)
infra/       docker / nginx
```

## Prerequisites

- Node.js >= 20
- pnpm >= 11 (`npm i -g pnpm`)
- Docker + Docker Compose

## Getting started

```bash
pnpm install

# start Postgres + MinIO
pnpm infra:up

# create a local env file for the API
cp apps/api/.env.example apps/api/.env

# push the database schema
pnpm db:migrate

# run web + api together
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001  (health: `GET /health`)
