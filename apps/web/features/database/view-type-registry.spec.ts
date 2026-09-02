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

  it('board supports grouping, table does not', () => {
    expect(ViewTypeRegistry.get('board')!.supportsGrouping).toBe(true);
    expect(ViewTypeRegistry.get('table')!.supportsGrouping).toBe(false);
  });
});
