import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { unzipSync } from 'fflate';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { pages, workspaces } from '../src/db/schema';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { BackupService } from '../src/backup/backup.service';
import { ExportService } from '../src/export/export.service';
import { ImportService } from '../src/import/import.service';
import { StorageService } from '../src/storage/storage.service';

/**
 * Real-Postgres integration test for `BackupService` (§31, Sprint 24) —
 * same precedent as `test/search-fts.e2e-spec.ts`/`test/import.e2e-spec.ts`.
 * Requires `pnpm infra:up`.
 */
describe('Backup (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const fakeConfig = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const storage = new StorageService(fakeConfig);
  const attachmentsService = new AttachmentsService(db as never, storage);
  const importService = new ImportService(db as never, attachmentsService);
  const exportService = new ExportService(db as never);

  let backupDir: string;
  let service: BackupService;
  let workspaceId: string;

  beforeAll(async () => {
    backupDir = await mkdtemp(join(tmpdir(), 'memoire-backup-test-'));
    process.env.BACKUP_DIR = backupDir;
    service = new BackupService(exportService, storage, importService);

    const [ws] = await db.insert(workspaces).values({ name: 'Backup test workspace' }).returning();
    workspaceId = ws.id;
    await db.insert(pages).values({ workspaceId, title: 'Backup Fixture', type: 'document', position: 0 });
  });

  afterAll(async () => {
    await db.delete(pages).where(eq(pages.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await rm(backupDir, { recursive: true, force: true });
    await pool.end();
  });

  it('produces a zip containing a valid memoire.json', async () => {
    const info = await service.runBackup();
    expect(info.filename).toMatch(/^memoire-backup-.*\.zip$/);
    expect(info.size).toBeGreaterThan(0);

    const files = await readdir(backupDir);
    expect(files).toContain(info.filename);

    const archive = unzipSync(await readFile(join(backupDir, info.filename)));
    expect(archive['memoire.json']).toBeDefined();
    const parsed = JSON.parse(new TextDecoder().decode(archive['memoire.json']));
    expect(parsed.app).toBe('memoire');
    expect(parsed.pages.some((p: { title: string }) => p.title === 'Backup Fixture')).toBe(true);
  });

  it('lists backups newest-first', async () => {
    await service.runBackup();
    const list = await service.listBackups();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].createdAt >= list[1].createdAt).toBe(true);
  });

  it('prunes backups beyond the retention count', async () => {
    // Seed extra fake backup files directly (skip re-running exportWorkspace() repeatedly).
    for (let i = 0; i < 10; i++) {
      await writeFile(join(backupDir, `memoire-backup-fake-${i}.zip`), Buffer.from('x'));
    }
    await service.runBackup();
    const list = await service.listBackups();
    expect(list.length).toBeLessThanOrEqual(7);
  });
});
