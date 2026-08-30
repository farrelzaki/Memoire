import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { WhiteboardService } from '../src/content-types/whiteboard/whiteboard.service';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

const mockDb = { execute: async () => ({}) };

const canvasFixture = {
  id: '11111111-1111-1111-1111-111111111111',
  pageId: '22222222-2222-2222-2222-222222222222',
  canvasKind: 'whiteboard',
  elements: [],
  viewport: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Canvas (e2e)', () => {
  let app: INestApplication;

  const whiteboardService = {
    getOrCreate: vi.fn(async () => canvasFixture),
    update: vi.fn(async () => canvasFixture),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(WhiteboardService)
      .useValue(whiteboardService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/pages/:id/canvas returns the canvas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/pages/${canvasFixture.pageId}/canvas`)
      .expect(200);
    expect(res.body).toMatchObject({ canvasKind: 'whiteboard', pageId: canvasFixture.pageId });
  });

  it('PATCH /api/pages/:id/canvas updates elements', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/pages/${canvasFixture.pageId}/canvas`)
      .send({ elements: [{ type: 'rectangle' }], viewport: { scrollX: 10 } })
      .expect(200);
    expect(res.body.id).toBe(canvasFixture.id);
  });
});
