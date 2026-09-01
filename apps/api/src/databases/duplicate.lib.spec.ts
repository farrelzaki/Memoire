import { describe, expect, it } from 'vitest';
import { remapRowValues, remapViewConfig } from './duplicate.lib';

const idMap = new Map([
  ['old-title', 'new-title'],
  ['old-status', 'new-status'],
]);

describe('remapRowValues', () => {
  it('rekeys values onto the copied property ids', () => {
    expect(remapRowValues({ 'old-title': 'Hello', 'old-status': 'Done' }, idMap)).toEqual({
      'new-title': 'Hello',
      'new-status': 'Done',
    });
  });

  it('drops keys with no matching source property', () => {
    expect(remapRowValues({ 'old-title': 'Hello', orphan: 'x' }, idMap)).toEqual({
      'new-title': 'Hello',
    });
  });

  it('treats a null values blob as empty', () => {
    expect(remapRowValues(null, idMap)).toEqual({});
  });
});

describe('remapViewConfig', () => {
  it('rewrites propertyId inside filters and sorts', () => {
    const config = {
      filters: [{ propertyId: 'old-status', operator: 'equals', value: 'Done' }],
      sorts: [{ propertyId: 'old-title', direction: 'asc' }],
    };
    expect(remapViewConfig(config, idMap)).toEqual({
      filters: [{ propertyId: 'new-status', operator: 'equals', value: 'Done' }],
      sorts: [{ propertyId: 'new-title', direction: 'asc' }],
    });
  });

  it('rewrites the board groupBy and calendar dateProperty keys', () => {
    expect(remapViewConfig({ groupBy: 'old-status' }, idMap)).toEqual({
      groupBy: 'new-status',
    });
    expect(remapViewConfig({ dateProperty: 'old-title' }, idMap)).toEqual({
      dateProperty: 'new-title',
    });
  });

  it('passes unknown keys through untouched', () => {
    expect(remapViewConfig({ options: { wrap: true } }, idMap)).toEqual({
      options: { wrap: true },
    });
  });

  it('leaves ids that are not in the map alone', () => {
    expect(remapViewConfig({ groupBy: 'unmapped' }, idMap)).toEqual({ groupBy: 'unmapped' });
  });

  it('returns null config as-is', () => {
    expect(remapViewConfig(null, idMap)).toBeNull();
  });
});
