import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DatabasesService } from '../src/databases/databases.service';
import { DRIZZLE_DB } from '../src/db/drizzle.provider';

const mockDb = { execute: async () => ({}) };

const databaseFixture = {
  id: '11111111-1111-1111-1111-111111111111',
  pageId: '22222222-2222-2222-2222-222222222222',
  name: 'Tasks',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const propertyFixture = {
  id: '33333333-3333-3333-3333-333333333333',
  databaseId: databaseFixture.id,
  name: 'Status',
  type: 'select',
  config: null,
  position: 0,
};

const rowFixture = {
  id: '44444444-4444-4444-4444-444444444444',
  databaseId: databaseFixture.id,
  pageId: null,
  values: {},
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Databases (e2e)', () => {
  let app: INestApplication;

  const viewFixture = {
    id: '66666666-6666-6666-6666-666666666666',
    databaseId: databaseFixture.id,
    name: 'Table',
    type: 'table',
    config: null,
    position: 0,
  };

  const databasesService = {
    getByPage: vi.fn(async () => ({
      database: databaseFixture,
      properties: [propertyFixture],
      rows: [rowFixture],
      views: [],
    })),
    getById: vi.fn(async () => ({
      database: databaseFixture,
      properties: [propertyFixture],
      rows: [rowFixture],
      views: [],
    })),
    listAll: vi.fn(async () => [databaseFixture]),
    create: vi.fn(async () => databaseFixture),
    createProperty: vi.fn(async () => propertyFixture),
    updateProperty: vi.fn(async () => propertyFixture),
    deleteProperty: vi.fn(async () => ({ id: propertyFixture.id, deleted: true })),
    createRow: vi.fn(async () => rowFixture),
    updateRow: vi.fn(async () => rowFixture),
    deleteRow: vi.fn(async () => ({ id: rowFixture.id, deleted: true })),
    archiveRow: vi.fn(async () => ({ ...rowFixture, isArchived: true })),
    restoreRow: vi.fn(async () => ({ ...rowFixture, isArchived: false })),
    addRelation: vi.fn(async () => ({ linked: true })),
    removeRelation: vi.fn(async () => ({ linked: false })),
    findRowByPageId: vi.fn(async () => rowFixture),
    createView: vi.fn(async () => viewFixture),
    duplicateView: vi.fn(async () => ({ ...viewFixture, id: '55555555-5555-5555-5555-555555555555', name: 'Table (copy)' })),
    moveView: vi.fn(async () => [viewFixture]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DRIZZLE_DB)
      .useValue(mockDb)
      .overrideProvider(DatabasesService)
      .useValue(databasesService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/databases/by-page/:id returns the aggregate', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/databases/by-page/${databaseFixture.pageId}`)
      .expect(200);
    expect(res.body.database.id).toBe(databaseFixture.id);
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.rows).toHaveLength(1);
  });

  it('POST /api/databases/:id/properties creates a property', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/databases/${databaseFixture.id}/properties`)
      .send({ name: 'Status', type: 'select' })
      .expect(201);
    expect(res.body).toMatchObject({ id: propertyFixture.id, type: 'select' });
  });

  it('POST /api/databases/:id/properties rejects a bad type', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/databases/${databaseFixture.id}/properties`)
      .send({ name: 'X', type: 'not_a_real_type' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/databases/:id/properties accepts a client-supplied id (§10B.5 invariant 14)', async () => {
    const clientId = '77777777-7777-7777-7777-777777777777';
    await request(app.getHttpServer())
      .post(`/api/databases/${databaseFixture.id}/properties`)
      .send({ id: clientId, name: 'Status', type: 'select' })
      .expect(201);
    expect(databasesService.createProperty).toHaveBeenCalledWith(
      databaseFixture.id,
      expect.objectContaining({ id: clientId }),
    );
  });

  it('POST /api/databases/:id/rows accepts a client-supplied id (§10B.5 invariant 14)', async () => {
    const clientId = '88888888-8888-8888-8888-888888888888';
    await request(app.getHttpServer())
      .post(`/api/databases/${databaseFixture.id}/rows`)
      .send({ id: clientId, values: { status: 'Todo' } })
      .expect(201);
    expect(databasesService.createRow).toHaveBeenCalledWith(
      databaseFixture.id,
      { status: 'Todo' },
      clientId,
      undefined,
    );
  });

  it('POST /api/databases/:id/views accepts a client-supplied id (§10B.5 invariant 14)', async () => {
    const clientId = '99999999-9999-9999-9999-999999999999';
    await request(app.getHttpServer())
      .post(`/api/databases/${databaseFixture.id}/views`)
      .send({ id: clientId, name: 'Table', type: 'table' })
      .expect(201);
    expect(databasesService.createView).toHaveBeenCalledWith(
      databaseFixture.id,
      expect.objectContaining({ id: clientId }),
    );
  });

  it('PATCH /api/database-rows/:id updates values', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/database-rows/${rowFixture.id}`)
      .send({ values: { status: 'Done' } })
      .expect(200);
    expect(res.body.id).toBe(rowFixture.id);
  });

  it('DELETE /api/database-rows/:id removes a row', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/database-rows/${rowFixture.id}`)
      .expect(200);
    expect(res.body).toMatchObject({ deleted: true });
  });

  it('GET /api/databases lists databases', async () => {
    const res = await request(app.getHttpServer()).get('/api/databases').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(databaseFixture.id);
  });

  it('POST /api/databases creates a database (§20C)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/databases')
      .send({ ownerPageId: databaseFixture.pageId, name: 'Inline', isInline: true })
      .expect(201);
    expect(res.body.id).toBe(databaseFixture.id);
    expect(databasesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPageId: databaseFixture.pageId, isInline: true }),
    );
  });

  it('GET /api/databases/:id returns the aggregate by database id (§20C.3)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/databases/${databaseFixture.id}`)
      .expect(200);
    expect(res.body.database.id).toBe(databaseFixture.id);
  });

  it('GET /api/database-rows/by-page/:pageId finds the row behind a row page (§20D)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/database-rows/by-page/${rowFixture.id}`)
      .expect(200);
    expect(res.body.id).toBe(rowFixture.id);
  });

  it('POST /api/database-rows/:id/archive soft-deletes a row (§20D.5)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/database-rows/${rowFixture.id}/archive`)
      .expect(201);
    expect(res.body.isArchived).toBe(true);
  });

  it('POST /api/database-rows/:id/restore un-archives a row', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/database-rows/${rowFixture.id}/restore`)
      .expect(201);
    expect(res.body.isArchived).toBe(false);
  });

  it('POST /api/database-rows/:id/relations/:propertyId links a row (§23A)', async () => {
    const toRowId = '11111111-2222-3333-4444-555555555555';
    await request(app.getHttpServer())
      .post(`/api/database-rows/${rowFixture.id}/relations/${propertyFixture.id}`)
      .send({ toRowId })
      .expect(201);
    expect(databasesService.addRelation).toHaveBeenCalledWith(rowFixture.id, propertyFixture.id, toRowId);
  });

  it('POST /api/database-rows/:id/relations/:propertyId rejects a non-UUID toRowId', async () => {
    await request(app.getHttpServer())
      .post(`/api/database-rows/${rowFixture.id}/relations/${propertyFixture.id}`)
      .send({ toRowId: 'not-a-uuid' })
      .expect(400);
  });

  it('DELETE /api/database-rows/:id/relations/:propertyId/:toRowId unlinks a row', async () => {
    const toRowId = '11111111-2222-3333-4444-555555555555';
    await request(app.getHttpServer())
      .delete(`/api/database-rows/${rowFixture.id}/relations/${propertyFixture.id}/${toRowId}`)
      .expect(200);
    expect(databasesService.removeRelation).toHaveBeenCalledWith(rowFixture.id, propertyFixture.id, toRowId);
  });

  it('POST /api/database-views/:id/duplicate copies a view', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/database-views/${viewFixture.id}/duplicate`)
      .expect(201);
    expect(res.body.name).toBe('Table (copy)');
  });

  it('POST /api/database-views/:id/move reorders tabs', async () => {
    await request(app.getHttpServer())
      .post(`/api/database-views/${viewFixture.id}/move`)
      .send({ direction: 'left' })
      .expect(201);
    expect(databasesService.moveView).toHaveBeenCalledWith(viewFixture.id, 'left');
  });

  it('POST /api/database-views/:id/move rejects an invalid direction', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/database-views/${viewFixture.id}/move`)
      .send({ direction: 'up' })
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});
