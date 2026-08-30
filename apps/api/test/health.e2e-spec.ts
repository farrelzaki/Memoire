import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

// The e2e test must not require a live Postgres instance, so the Drizzle
// provider is stubbed at the module boundary. Connectivity itself is exercised
// by `pnpm db:migrate` against a real container during development/CI.
const mockDb = { execute: async () => ({}) };

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns 200 with an ok status', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
