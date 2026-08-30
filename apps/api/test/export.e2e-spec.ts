import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';
import { ExportService } from '../src/export/export.service';

const mockDb = { execute: async () => ({}) };

describe('Export (e2e)', () => {
  let app: INestApplication;

  const exportService = {
    exportWorkspace: vi.fn(async () => ({
      app: 'memoire',
      version: 1,
      pages: [],
      blocks: [],
      databases: [],
      properties: [],
      rows: [],
      attachments: [],
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(ExportService)
      .useValue(exportService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/export/json returns a workspace dump', async () => {
    const res = await request(app.getHttpServer()).get('/api/export/json').expect(200);
    expect(res.body.app).toBe('memoire');
    expect(res.body.pages).toEqual([]);
  });
});
