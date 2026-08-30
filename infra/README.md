# infra/

Deployment / operations assets (technical plan §41).

- `docker/` — Dockerfiles and container-specific config (added with the
  deployment sprint).
- `nginx/` — reverse-proxy config for the private-VPS deployment option (§63B).

Local development dependencies (PostgreSQL + MinIO) are defined in the root
[`docker-compose.yml`](../docker-compose.yml) and started with
`pnpm infra:up`.
