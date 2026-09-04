import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import * as schema from '../src/db/schema';
import { databaseProperties, databaseRows, databases, pages } from '../src/db/schema';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { StorageService } from '../src/storage/storage.service';
import { ImportService } from '../src/import/import.service';
import { deletePageTree, getRealWorkspaceId } from './test-helpers';

/**
 * Real-Postgres integration test for CSV -> database import (§30A.1,
 * Sprint 24B) — same precedent as `test/import.e2e-spec.ts`. Requires
 * `pnpm infra:up`.
 *
 * Uses the app's one real workspace (`getRealWorkspaceId`), not a
 * test-inserted throwaway row — `ImportService.confirm()` always resolves
 * "the" workspace via an unordered `.limit(1)`, which in practice is the
 * real, oldest row, never a fresh test insert (see `test-helpers.ts`).
 * Cleanup (`deletePageTree`) deletes each test's own created subtree by the
 * `importParentPageId` `confirm()` actually returned.
 */
describe('Import — CSV to database (real Postgres)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const fakeConfig = { get: (key: string) => process.env[key] } as unknown as ConfigService;
  const storage = new StorageService(fakeConfig);
  const attachmentsService = new AttachmentsService(db as never, storage);
  const service = new ImportService(db as never, attachmentsService);

  let workspaceId: string;

  beforeAll(async () => {
    workspaceId = await getRealWorkspaceId(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('previews a CSV with guessed column types', async () => {
    const csv = 'Name,Age,Active\nAlice,30,true\nBob,25,false';
    const preview = await service.preview(
      { buffer: Buffer.from(csv), originalname: 'People.csv', mimetype: 'text/csv', size: csv.length },
      'csv',
    );
    const summary = preview.summary as { columns: Array<{ name: string; type: string }>; rowCount: number };
    expect(summary.rowCount).toBe(2);
    expect(summary.columns).toEqual([
      { name: 'Name', type: 'title' },
      { name: 'Age', type: 'number' },
      { name: 'Active', type: 'checkbox' },
    ]);
    await service.cancel(preview.stagingId);
  });

  it('accepts a corrected column type via PATCH and honors it on confirm', async () => {
    const csv = 'Name,Code\nAlice,007\nBob,042';
    const preview = await service.preview(
      { buffer: Buffer.from(csv), originalname: 'People.csv', mimetype: 'text/csv', size: csv.length },
      'csv',
    );
    // "007"/"042" guess as number, but leading zeros matter -- correct to text.
    const patched = await service.updateColumnTypes(preview.stagingId, { 1: 'text' });
    const patchedSummary = patched.summary as { columns: Array<{ name: string; type: string }> };
    expect(patchedSummary.columns[1]).toEqual({ name: 'Code', type: 'text' });

    const result = await service.confirm(preview.stagingId);
    expect(result.pageCount).toBe(4); // import parent + database owner page + 2 row pages
    expect(workspaceId).toBeTruthy();

    const ownerPage = (await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId)))[0];
    const [database] = await db.select().from(databases).where(eq(databases.ownerPageId, ownerPage.id));
    expect(database.name).toBe('People');

    const properties = await db.select().from(databaseProperties).where(eq(databaseProperties.databaseId, database.id));
    const codeProperty = properties.find((p) => p.name === 'Code')!;
    expect(codeProperty.type).toBe('text');

    const rows = await db.select().from(databaseRows).where(eq(databaseRows.databaseId, database.id));
    const values = rows.map((r) => (r.values as Record<string, unknown>)[codeProperty.id]).sort();
    expect(values).toEqual(['007', '042']);

    const rowPages = await db.select().from(pages).where(eq(pages.databaseId, database.id));
    expect(rowPages.map((p) => p.title).sort()).toEqual(['Alice', 'Bob']);

    await deletePageTree(db, result.importParentPageId);
  });

  it('rejects a column type PATCH outside the CSV-safe allowlist', async () => {
    const csv = 'Name\nAlice';
    const preview = await service.preview(
      { buffer: Buffer.from(csv), originalname: 'People.csv', mimetype: 'text/csv', size: csv.length },
      'csv',
    );
    await expect(service.updateColumnTypes(preview.stagingId, { 0: 'relation' })).rejects.toThrow();
    await service.cancel(preview.stagingId);
  });

  it('coerces numeric and checkbox cell values to real JS types', async () => {
    const csv = 'Name,Age,Active\nAlice,30,true\nBob,25,false';
    const preview = await service.preview(
      { buffer: Buffer.from(csv), originalname: 'People.csv', mimetype: 'text/csv', size: csv.length },
      'csv',
    );
    const result = await service.confirm(preview.stagingId);

    const ownerPage = (await db.select().from(pages).where(eq(pages.parentPageId, result.importParentPageId)))[0];
    const [database] = await db.select().from(databases).where(eq(databases.ownerPageId, ownerPage.id));
    const properties = await db.select().from(databaseProperties).where(eq(databaseProperties.databaseId, database.id));
    const ageProperty = properties.find((p) => p.name === 'Age')!;
    const activeProperty = properties.find((p) => p.name === 'Active')!;

    const rows = await db.select().from(databaseRows).where(eq(databaseRows.databaseId, database.id));
    const alice = rows.find((r) => (r.values as Record<string, unknown>)[activeProperty.id] === true)!;
    expect(typeof (alice.values as Record<string, unknown>)[ageProperty.id]).toBe('number');
    expect((alice.values as Record<string, unknown>)[ageProperty.id]).toBe(30);

    await deletePageTree(db, result.importParentPageId);
  });
});
