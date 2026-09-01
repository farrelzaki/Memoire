# @memoire/desktop

Tauri shell around the Memoire web frontend (Sprint 12). It does not bundle a
copy of the app or a backend — it just opens a native window pointed at the
running Next.js frontend, which talks to the same NestJS API the browser
version uses. This keeps the "modular monolith, single writer" architecture
intact: the desktop app is packaging, not a second implementation.

## One-time setup

Requires the Rust toolchain (`rustup`) in addition to the repo's normal
Node/pnpm setup — Tauri compiles a small native shell per platform.

```bash
pnpm --filter @memoire/desktop install
# Generate app icons from the shared web icon (writes into src-tauri/icons/):
pnpm --filter @memoire/desktop tauri icon ../web/public/icon.svg
```

Auto-update is wired to `tauri-plugin-updater` but disabled in practice until
a real update manifest is hosted: replace the `plugins.updater.endpoints` URL
and `pubkey` in `src-tauri/tauri.conf.json` with your own
(`tauri signer generate` produces the keypair) before shipping a release
build with `bundle.active: true`.

## Dev

```bash
pnpm --filter @memoire/desktop dev
```

This runs `next dev` (via `beforeDevCommand`) and opens a Tauri window at
`http://localhost:3000`.

## Production

`tauri.conf.json`'s window `url` defaults to `http://localhost:3000`, i.e. it
assumes the user already runs the Memoire web app locally (`pnpm dev` / the
Docker Compose setup in `infra/`). For a packaged build that points at a
different host (e.g. a self-hosted deployment), edit that URL before
building:

```bash
pnpm --filter @memoire/desktop build
```

Produces platform installers (`.msi`/`.exe` on Windows, `.dmg` on macOS,
`.deb`/AppImage on Linux) in `src-tauri/target/release/bundle/`.
