import { describe, expect, it } from 'vitest';
import { memoireExportSchema } from './export';

function validExport() {
  return {
    app: 'memoire' as const,
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    workspaces: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Home' }],
    pages: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        workspaceId: '11111111-1111-1111-1111-111111111111',
        parentPageId: null,
        title: 'Untitled',
        type: 'document',
        isArchived: false,
        position: 0,
      },
    ],
    blocks: [],
    databases: [],
    properties: [],
    rows: [],
    attachments: [],
  };
}

describe('memoireExportSchema', () => {
  it('accepts a well-formed export', () => {
    expect(() => memoireExportSchema.parse(validExport())).not.toThrow();
  });

  it('rejects app !== "memoire"', () => {
    expect(() => memoireExportSchema.parse({ ...validExport(), app: 'other' })).toThrow();
  });

  it('tolerates extra/unknown fields on row shapes (passthrough)', () => {
    const withExtra = validExport();
    withExtra.pages[0] = { ...withExtra.pages[0], settings: { fullWidth: true } } as (typeof withExtra.pages)[0];
    expect(() => memoireExportSchema.parse(withExtra)).not.toThrow();
  });

  it('rejects a page with a non-uuid id', () => {
    const bad = validExport();
    bad.pages[0].id = 'not-a-uuid';
    expect(() => memoireExportSchema.parse(bad)).toThrow();
  });

  it('rejects a missing top-level array', () => {
    const { attachments: _attachments, ...missing } = validExport();
    expect(() => memoireExportSchema.parse(missing)).toThrow();
  });
});
