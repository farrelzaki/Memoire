import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { BlocksService } from '../src/blocks/blocks.service';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

const mockDb = { execute: async () => ({}) };

const blockFixture = {
  id: '11111111-1111-1111-1111-111111111111',
  pageId: '22222222-2222-2222-2222-222222222222',
  parentBlockId: null,
  type: 'paragraph',
  position: 0,
  content: { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
  properties: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Blocks (e2e)', () => {
  let app: INestApplication;

  const blocksService = {
    getByPage: vi.fn(async () => [blockFixture]),
    replace: vi.fn(async () => [blockFixture]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(BlocksService)
      .useValue(blocksService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/pages/:id/blocks lists blocks', async () => {
    await request(app.getHttpServer())
      .get(`/api/pages/${blockFixture.pageId}/blocks`)
      .expect(200);
    expect(blocksService.getByPage).toHaveBeenCalled();
  });

  it('PUT /api/pages/:id/blocks replaces blocks', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/pages/${blockFixture.pageId}/blocks`)
      .send({ blocks: [{ type: 'paragraph', content: { type: 'paragraph' } }] })
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ type: 'paragraph', pageId: blockFixture.pageId });
  });

  it('PUT /api/pages/:id/blocks rejects a missing blocks array', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/pages/${blockFixture.pageId}/blocks`)
      .send({})
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});
