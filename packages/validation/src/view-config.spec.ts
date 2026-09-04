import { describe, expect, it } from 'vitest';
import { migrateViewConfig } from './view-config';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const GHOST = '99999999-9999-9999-9999-999999999999';

describe('migrateViewConfig', () => {
  it('fills every base default from an empty/unknown raw config', () => {
    const config = migrateViewConfig(undefined, 'table', [{ id: P1 }]);
    expect(config.version).toBe(1);
    expect(config.filter).toBeNull();
    expect(config.sorts).toEqual([]);
    expect(config.pageSize).toBe(50);
    expect(config.openAs).toBe('side');
    expect(config).toMatchObject({ rowHeight: 'short', wrapCells: false, showRowNumbers: false });
  });

  it('round-trips a valid version-1 config unchanged', () => {
    const raw = {
      version: 1,
      filter: null,
      sorts: [{ propertyId: P1, direction: 'desc' }],
      properties: [{ propertyId: P1, visible: true, width: 200 }],
      calculations: { [P1]: 'sum' },
      pageSize: 100,
      openAs: 'full',
      locked: true,
      search: 'foo',
      rowHeight: 'tall',
      wrapCells: true,
      showRowNumbers: true,
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }]);
    expect(config.sorts).toEqual([{ propertyId: P1, direction: 'desc' }]);
    expect(config.pageSize).toBe(100);
    expect(config.rowHeight).toBe('tall');
  });

  it('maps legacy equals/not_equals operators to is/is_not', () => {
    const raw = {
      version: 1,
      filter: { conjunction: 'and', rules: [{ propertyId: P1, operator: 'equals', value: 'x' }] },
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }]);
    expect(config.filter).toEqual({
      conjunction: 'and',
      rules: [{ propertyId: P1, operator: 'is', value: 'x' }],
    });
  });

  it('maps legacy operators inside a nested filter group', () => {
    const raw = {
      version: 1,
      filter: {
        conjunction: 'and',
        rules: [
          { propertyId: P1, operator: 'not_equals', value: 'x' },
          { conjunction: 'or', rules: [{ propertyId: P2, operator: 'equals', value: 'y' }] },
        ],
      },
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }, { id: P2 }]);
    const rules = (config.filter as { rules: unknown[] }).rules;
    expect(rules[0]).toEqual({ propertyId: P1, operator: 'is_not', value: 'x' });
    expect(rules[1]).toEqual({ conjunction: 'or', rules: [{ propertyId: P2, operator: 'is', value: 'y' }] });
  });

  it('strips a filter rule referencing a deleted property', () => {
    const raw = {
      version: 1,
      filter: { conjunction: 'and', rules: [{ propertyId: GHOST, operator: 'is', value: 'x' }] },
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }]);
    expect(config.filter).toBeNull();
  });

  it('drops an empty nested group left behind after pruning', () => {
    const raw = {
      version: 1,
      filter: {
        conjunction: 'and',
        rules: [
          { propertyId: P1, operator: 'is', value: 'x' },
          { conjunction: 'or', rules: [{ propertyId: GHOST, operator: 'is', value: 'y' }] },
        ],
      },
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }]);
    expect(config.filter).toEqual({ conjunction: 'and', rules: [{ propertyId: P1, operator: 'is', value: 'x' }] });
  });

  it('drops sorts, properties, and calculations referencing deleted properties', () => {
    const raw = {
      version: 1,
      sorts: [{ propertyId: P1, direction: 'asc' }, { propertyId: GHOST, direction: 'asc' }],
      properties: [{ propertyId: P1, visible: true }, { propertyId: GHOST, visible: true }],
      calculations: { [P1]: 'sum', [GHOST]: 'sum' },
    };
    const config = migrateViewConfig(raw, 'table', [{ id: P1 }]);
    expect(config.sorts).toEqual([{ propertyId: P1, direction: 'asc' }]);
    expect(config.properties).toEqual([{ propertyId: P1, visible: true }]);
    expect(config.calculations).toEqual({ [P1]: 'sum' });
  });

  it('drops table groupBy when it references a deleted property', () => {
    const config = migrateViewConfig({ version: 1, groupBy: GHOST }, 'table', [{ id: P1 }]);
    expect('groupBy' in config).toBe(false);
  });

  it('produces the board-specific shape for a board view', () => {
    const config = migrateViewConfig({ version: 1, groupBy: P1 }, 'board', [{ id: P1 }]);
    expect(config).toMatchObject({ groupBy: P1, cardSize: 'medium', colorByGroup: true });
  });

  it('produces the calendar-specific shape for a calendar view', () => {
    const config = migrateViewConfig({ version: 1, dateProperty: P1 }, 'calendar', [{ id: P1 }]);
    expect(config).toMatchObject({ dateProperty: P1, span: 'month', showWeekends: true });
  });

  it('produces the list-specific shape (base only, §21B.1)', () => {
    const config = migrateViewConfig({ version: 1 }, 'list', [{ id: P1 }]);
    expect(config.version).toBe(1);
    expect(config).not.toHaveProperty('groupBy');
    expect(config).not.toHaveProperty('startProperty');
  });

  it('produces the timeline-specific shape and defaults zoom/showTable', () => {
    const config = migrateViewConfig({ version: 1, startProperty: P1 }, 'timeline', [{ id: P1 }]);
    expect(config).toMatchObject({ startProperty: P1, zoom: 'week', showTable: true });
  });

  it('drops a timeline startProperty/endProperty referencing a deleted property', () => {
    const config = migrateViewConfig({ version: 1, startProperty: GHOST, endProperty: GHOST }, 'timeline', [{ id: P1 }]);
    expect('startProperty' in config).toBe(false);
    expect('endProperty' in config).toBe(false);
  });

  it('board collapsedGroups defaults to an empty array and survives migration', () => {
    const config = migrateViewConfig({ version: 1, groupBy: P1 }, 'board', [{ id: P1 }]);
    expect(config).toMatchObject({ collapsedGroups: [] });

    const withCollapsed = migrateViewConfig({ version: 1, groupBy: P1, collapsedGroups: ['opt-a'] }, 'board', [{ id: P1 }]);
    expect(withCollapsed.collapsedGroups).toEqual(['opt-a']);
  });
});
