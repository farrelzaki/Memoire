import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mockFetchOnce(body: unknown = { id: 'server-would-echo-this' }) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof mockFetchOnce>) {
  const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    RequestInit,
  ];
  return JSON.parse(init.body as string);
}

describe('api client-generated ids (§10B.5 invariant 14)', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'deadbeef-dead-dead-dead-deaddeadbeef' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createPage mints an id when the caller does not supply one', async () => {
    const fetchMock = mockFetchOnce();
    await api.createPage({ title: 'Notes' });
    expect(sentBody(fetchMock).id).toMatch(UUID_RE);
  });

  it('createPage keeps a caller-supplied id instead of overwriting it', async () => {
    const fetchMock = mockFetchOnce();
    await api.createPage({ title: 'Notes', id: 'caller-id' });
    expect(sentBody(fetchMock).id).toBe('caller-id');
  });

  it('createProperty mints an id when the caller does not supply one', async () => {
    const fetchMock = mockFetchOnce();
    await api.createProperty('db-1', { name: 'Status', type: 'select' });
    expect(sentBody(fetchMock).id).toMatch(UUID_RE);
  });

  it('createRow mints an id when the caller does not supply one', async () => {
    const fetchMock = mockFetchOnce();
    await api.createRow('db-1', { status: 'Todo' });
    expect(sentBody(fetchMock).id).toMatch(UUID_RE);
  });

  it('createRow keeps a caller-supplied id instead of overwriting it', async () => {
    const fetchMock = mockFetchOnce();
    await api.createRow('db-1', { status: 'Todo' }, 'caller-id');
    expect(sentBody(fetchMock).id).toBe('caller-id');
  });

  it('createView mints an id when the caller does not supply one', async () => {
    const fetchMock = mockFetchOnce();
    await api.createView('db-1', { name: 'Table', type: 'table' });
    expect(sentBody(fetchMock).id).toMatch(UUID_RE);
  });
});
