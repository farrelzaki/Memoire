import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabaseQueryService } from '../src/databases/database-query.service';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

const mockDb = { execute: async () => ({}) };

const queryResult = {
  rows: [],
  groups: null,
  calculations: {},
  total: 0,
  nextCursor: null,
  computedAt: new Date().toISOString(),
};

describe('Databases query (e2e)', () => {
  let app: INestApplication;

  const databaseQueryService = { query: vi.fn(async () => queryResult) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(DatabaseQueryService)
      .useValue(databaseQueryService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const databaseId = '11111111-1111-1111-1111-111111111111';

  it('POST /api/databases/:id/query forwards a minimal body', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/databases/${databaseId}/query`)
      .send({})
      .expect(201);
    expect(res.body).toEqual(queryResult);
    expect(databaseQueryService.query).toHaveBeenCalledWith(databaseId, {});
  });

  it('POST /api/databases/:id/query forwards viewId, cursor, and limit', async () => {
    const body = { viewId: '22222222-2222-2222-2222-222222222222', cursor: 'abc', limit: 100 };
    await request(app.getHttpServer()).post(`/api/databases/${databaseId}/query`).send(body).expect(201);
    expect(databaseQueryService.query).toHaveBeenCalledWith(databaseId, body);
  });

  it('POST /api/databases/:id/query rejects a limit above 500', async () => {
    await request(app.getHttpServer())
      .post(`/api/databases/${databaseId}/query`)
      .send({ limit: 5000 })
      .expect(400);
  });

  it('POST /api/databases/:id/query rejects a non-UUID database id', async () => {
    await request(app.getHttpServer()).post('/api/databases/not-a-uuid/query').send({}).expect(400);
  });
});
