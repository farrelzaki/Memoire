import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

const mockDb = { execute: async () => ({}) };

const attachmentFixture = {
  id: '11111111-1111-1111-1111-111111111111',
  pageId: '22222222-2222-2222-2222-222222222222',
  blockId: null,
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 123,
  storageKey: 'attachments/abc.png',
  metadata: null,
  createdAt: new Date(),
};

describe('Attachments (e2e)', () => {
  let app: INestApplication;

  const attachmentsService = {
    upload: vi.fn(async () => attachmentFixture),
    findOne: vi.fn(async () => attachmentFixture),
    getContent: vi.fn(async () => ({ stream: null, contentType: 'image/png' })),
    remove: vi.fn(async () => ({ id: attachmentFixture.id, deleted: true })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(AttachmentsService)
      .useValue(attachmentsService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/attachments/upload accepts a file', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attachments/upload')
      .field('pageId', attachmentFixture.pageId)
      .attach('file', Buffer.from('fakepngdata'), 'photo.png')
      .expect(201);
    expect(res.body).toMatchObject({ id: attachmentFixture.id, filename: 'photo.png' });
  });

  it('POST /api/attachments/upload requires pageId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/attachments/upload')
      .attach('file', Buffer.from('fakepngdata'), 'photo.png')
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/attachments/:id returns metadata', async () => {
    await request(app.getHttpServer())
      .get(`/api/attachments/${attachmentFixture.id}`)
      .expect(200);
  });

  it('DELETE /api/attachments/:id removes', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/attachments/${attachmentFixture.id}`)
      .expect(200);
    expect(res.body).toMatchObject({ deleted: true });
  });
});
