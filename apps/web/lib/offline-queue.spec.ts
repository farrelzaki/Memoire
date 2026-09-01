import { describe, expect, it } from 'vitest';
import { coalesceOutbox, isMutatingMethod, sortOutboxByAge } from './offline-queue';
import type { OutboxEntry } from './offline-db';

describe('isMutatingMethod', () => {
  it('flags write methods, not GET', () => {
    expect(isMutatingMethod('POST')).toBe(true);
    expect(isMutatingMethod('PATCH')).toBe(true);
    expect(isMutatingMethod('PUT')).toBe(true);
    expect(isMutatingMethod('DELETE')).toBe(true);
    expect(isMutatingMethod('GET')).toBe(false);
  });
});

describe('coalesceOutbox', () => {
  it('merges repeated PATCHes to the same path, last field wins', () => {
    const entries: OutboxEntry[] = [
      { id: '1', method: 'PATCH', path: '/pages/a', body: { title: 'v1' }, createdAt: 1 },
      { id: '2', method: 'PATCH', path: '/pages/a', body: { title: 'v2' }, createdAt: 2 },
      { id: '3', method: 'PATCH', path: '/pages/a', body: { isFavorite: true }, createdAt: 3 },
    ];
    const result = coalesceOutbox(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1',
      createdAt: 1,
      body: { title: 'v2', isFavorite: true },
    });
  });

  it('keeps PATCHes to different paths separate', () => {
    const entries: OutboxEntry[] = [
      { id: '1', method: 'PATCH', path: '/pages/a', body: { title: 'x' }, createdAt: 1 },
      { id: '2', method: 'PATCH', path: '/pages/b', body: { title: 'y' }, createdAt: 2 },
    ];
    expect(coalesceOutbox(entries)).toHaveLength(2);
  });

  it('never merges POST or DELETE, even to the same path', () => {
    const entries: OutboxEntry[] = [
      { id: '1', method: 'POST', path: '/databases/x/rows', body: { values: {} }, createdAt: 1 },
      { id: '2', method: 'POST', path: '/databases/x/rows', body: { values: {} }, createdAt: 2 },
    ];
    expect(coalesceOutbox(entries)).toHaveLength(2);
  });
});

describe('sortOutboxByAge', () => {
  it('orders entries oldest first without mutating the input', () => {
    const entries: OutboxEntry[] = [
      { id: '1', method: 'PATCH', path: '/pages/a', createdAt: 5 },
      { id: '2', method: 'PATCH', path: '/pages/b', createdAt: 1 },
    ];
    const sorted = sortOutboxByAge(entries);
    expect(sorted.map((e) => e.id)).toEqual(['2', '1']);
    expect(entries.map((e) => e.id)).toEqual(['1', '2']);
  });
});
