import { describe, expect, it } from 'vitest';
import { ViewTypeRegistry } from './view-type-registry';

describe('ViewTypeRegistry', () => {
  it('registers every view type the schema currently allows (§21)', () => {
    expect(ViewTypeRegistry.list().map((d) => d.key).sort()).toEqual([
      'board',
      'calendar',
      'gallery',
      'table',
    ]);
  });

  it('every entry has a component and a config schema', () => {
    for (const def of ViewTypeRegistry.list()) {
      expect(def.component).toBeTruthy();
      expect(def.configSchema).toBeTruthy();
    }
  });

  it('calendar requires a date property, table requires none', () => {
    expect(ViewTypeRegistry.get('calendar')!.requiredProperties).toEqual(['date']);
    expect(ViewTypeRegistry.get('table')!.requiredProperties).toEqual([]);
  });

  it('board and table both support grouping (table ber-grup, §21A.1), calendar does not', () => {
    expect(ViewTypeRegistry.get('board')!.supportsGrouping).toBe(true);
    expect(ViewTypeRegistry.get('table')!.supportsGrouping).toBe(true);
    expect(ViewTypeRegistry.get('calendar')!.supportsGrouping).toBe(false);
  });

  it('validates a config against the real per-type schema, not a passthrough', () => {
    const table = ViewTypeRegistry.get('table')!;
    const valid = {
      version: 1,
      filter: null,
      sorts: [],
      properties: [],
      calculations: {},
      pageSize: 50,
      openAs: 'side',
      locked: false,
      search: '',
      rowHeight: 'short',
      wrapCells: false,
      showRowNumbers: false,
    };
    expect(table.configSchema.safeParse(valid).success).toBe(true);
    expect(table.configSchema.safeParse({ ...valid, rowHeight: 'huge' }).success).toBe(false);
  });
});
