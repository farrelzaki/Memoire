import type { ComponentType } from 'react';
import { z } from 'zod';
import type { PropertyType } from '@/lib/types';
import { BoardView, CalendarView, GalleryView, TableView } from './database-views';

/**
 * Sprint 13 (§11D.4): registry contract for database view types. `component`
 * is typed loosely (`ComponentType<any>`) on purpose — each view's props
 * differ, and forcing one shared prop shape now would just be papering over
 * that until per-view config lands in Sprint 21. `requiredProperties` feeds
 * the "add view" menu so an impossible combination (e.g. calendar with no
 * date property) is disabled up front rather than failing after creation.
 */
export interface ViewTypeDefinition {
  key: string;
  label: string;
  icon: string;
  configSchema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  requiredProperties: PropertyType[];
  supportsGrouping: boolean;
}

class ViewTypeRegistryClass {
  private readonly types = new Map<string, ViewTypeDefinition>();

  register(def: ViewTypeDefinition): this {
    this.types.set(def.key, def);
    return this;
  }

  get(key: string): ViewTypeDefinition | undefined {
    return this.types.get(key);
  }

  list(): ViewTypeDefinition[] {
    return [...this.types.values()];
  }
}

export const ViewTypeRegistry = new ViewTypeRegistryClass();

/**
 * Mirrors `@memoire/validation`'s `viewConfigSchema` (§21A.1) — the actual
 * validation and defaulting happens server-side via `migrateViewConfig` on
 * every read/write; this copy exists so the client can validate an edit
 * before it round-trips (e.g. the filter builder), same convention as
 * `property-type-registry.ts`'s hand-mirrored config schemas.
 */
const filterRuleSchema = z.object({ propertyId: z.string(), operator: z.string(), value: z.unknown().optional() });
const filterGroupSchema: z.ZodType = z.lazy(() =>
  z.object({
    conjunction: z.enum(['and', 'or']),
    rules: z.array(z.union([filterRuleSchema, filterGroupSchema])),
  }),
);

const baseViewConfig = z.object({
  version: z.literal(1),
  filter: filterGroupSchema.nullable(),
  sorts: z.array(z.object({ propertyId: z.string(), direction: z.enum(['asc', 'desc']) })),
  properties: z.array(z.object({ propertyId: z.string(), visible: z.boolean(), width: z.number().optional() })),
  calculations: z.record(z.string()),
  pageSize: z.number().min(25).max(500),
  openAs: z.enum(['side', 'center', 'full']),
  locked: z.boolean(),
  search: z.string(),
});

const cardPreviewSchema = z.union([
  z.literal('none'),
  z.literal('cover'),
  z.literal('content'),
  z.object({ propertyId: z.string() }),
]);

const tableConfigSchema = baseViewConfig.extend({
  rowHeight: z.enum(['short', 'medium', 'tall']),
  wrapCells: z.boolean(),
  showRowNumbers: z.boolean(),
  groupBy: z.string().optional(),
});

const boardConfigSchema = baseViewConfig.extend({
  groupBy: z.string().optional(),
  subGroupBy: z.string().optional(),
  cardSize: z.enum(['small', 'medium', 'large']),
  cardPreview: cardPreviewSchema,
  colorByGroup: z.boolean(),
});

const calendarConfigSchema = baseViewConfig.extend({
  dateProperty: z.string().optional(),
  endDateProperty: z.string().optional(),
  showWeekends: z.boolean(),
  span: z.enum(['month', 'week']),
});

const galleryConfigSchema = baseViewConfig.extend({
  cardSize: z.enum(['small', 'medium', 'large']),
  cardPreview: cardPreviewSchema,
  fitImage: z.boolean(),
});

ViewTypeRegistry.register({
  key: 'table',
  label: 'Table',
  icon: '▤',
  configSchema: tableConfigSchema,
  component: TableView,
  requiredProperties: [],
  supportsGrouping: true,
});

ViewTypeRegistry.register({
  key: 'board',
  label: 'Board',
  icon: '▥',
  configSchema: boardConfigSchema,
  component: BoardView,
  requiredProperties: ['select'],
  supportsGrouping: true,
});

ViewTypeRegistry.register({
  key: 'calendar',
  label: 'Calendar',
  icon: '📆',
  configSchema: calendarConfigSchema,
  component: CalendarView,
  requiredProperties: ['date'],
  supportsGrouping: false,
});

ViewTypeRegistry.register({
  key: 'gallery',
  label: 'Gallery',
  icon: '▦',
  configSchema: galleryConfigSchema,
  component: GalleryView,
  requiredProperties: [],
  supportsGrouping: false,
});
