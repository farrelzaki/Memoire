import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';
import { PagesService } from '../src/pages/pages.service';

const mockDb = { execute: async () => ({}) };

const pageFixture = {
  id: '11111111-1111-1111-1111-111111111111',
  workspaceId: '22222222-2222-2222-2222-222222222222',
  parentPageId: null,
  title: 'Untitled',
  icon: null,
  coverUrl: null,
  type: 'document',
  isFavorite: false,
  isArchived: false,
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Pages (e2e)', () => {
  let app: INestApplication;

  const pagesService = {
    findAll: vi.fn(async () => [pageFixture]),
    findOne: vi.fn(async () => pageFixture),
    create: vi.fn(async () => pageFixture),
    update: vi.fn(async () => pageFixture),
    archive: vi.fn(async () => ({ ...pageFixture, isArchived: true })),
    restore: vi.fn(async () => ({ ...pageFixture, isArchived: false })),
    move: vi.fn(async () => pageFixture),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(PagesService)
      .useValue(pagesService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/pages returns the page list', async () => {
    await request(app.getHttpServer()).get('/api/pages').expect(200);
    expect(pagesService.findAll).toHaveBeenCalled();
  });

  it('POST /api/pages creates a page', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pages')
      .send({ title: 'Notes' })
      .expect(201);
    expect(res.body).toMatchObject({ id: pageFixture.id });
  });

  it('POST /api/pages with an invalid type returns the error shape (§60)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pages')
      .send({ type: 'nope' })
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBeTruthy();
  });

  it('POST /api/pages/:id/archive soft-deletes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pages/${pageFixture.id}/archive`)
      .expect(201);
    expect(res.body).toMatchObject({ isArchived: true });
  });

  it('POST /api/pages/:id/restore un-archives', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/pages/${pageFixture.id}/restore`)
      .expect(201);
    expect(res.body).toMatchObject({ isArchived: false });
  });
});
