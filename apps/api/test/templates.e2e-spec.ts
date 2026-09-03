import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';
import { TemplatesService } from '../src/templates/templates.service';

const mockDb = { execute: async () => ({}) };

const databaseId = '11111111-1111-1111-1111-111111111111';
const templateFixture = {
  id: '22222222-2222-2222-2222-222222222222',
  databaseId,
  name: 'Bug report',
  icon: null,
  description: null,
  content: { status: 'todo' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Templates (e2e)', () => {
  let app: INestApplication;

  const templatesService = {
    listForDatabase: vi.fn(async () => [templateFixture]),
    create: vi.fn(async () => templateFixture),
    delete: vi.fn(async () => ({ id: templateFixture.id, deleted: true })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(TemplatesService)
      .useValue(templatesService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/databases/:id/templates lists templates', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/databases/${databaseId}/templates`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Bug report');
  });

  it('POST /api/databases/:id/templates creates a template scoped to the URL database id', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/databases/${databaseId}/templates`)
      .send({ name: 'Bug report', content: { status: 'todo' } })
      .expect(201);
    expect(res.body.databaseId).toBe(databaseId);
    expect(templatesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ databaseId, name: 'Bug report' }),
    );
  });

  it('POST /api/databases/:id/templates rejects a body with no content', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/databases/${databaseId}/templates`)
      .send({ name: 'Bug report' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('DELETE /api/templates/:id removes a template', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/templates/${templateFixture.id}`)
      .expect(200);
    expect(res.body).toMatchObject({ deleted: true });
  });
});
