import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';
import { SearchService } from '../src/search/search.service';

const mockDb = { execute: async () => ({}) };

describe('Search (e2e)', () => {
  let app: INestApplication;

  const searchService = {
    search: vi.fn(async () => [
      { type: 'page', pageId: '11111111-1111-1111-1111-111111111111', title: 'Notes' },
    ]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(SearchService)
      .useValue(searchService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/search?q= returns results', async () => {
    const res = await request(app.getHttpServer()).get('/api/search?q=not').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ type: 'page', title: 'Notes' });
  });

  it('GET /api/search without q returns empty', async () => {
    const res = await request(app.getHttpServer()).get('/api/search').expect(200);
    expect(res.body).toEqual([]);
  });
});
