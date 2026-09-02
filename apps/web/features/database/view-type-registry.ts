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

const baseViewConfig = z.object({}).passthrough();

ViewTypeRegistry.register({
  key: 'table',
  label: 'Table',
  icon: '▤',
  configSchema: baseViewConfig,
  component: TableView,
  requiredProperties: [],
  supportsGrouping: false,
});

ViewTypeRegistry.register({
  key: 'board',
  label: 'Board',
  icon: '▥',
  configSchema: baseViewConfig,
  component: BoardView,
  requiredProperties: ['select'],
  supportsGrouping: true,
});

ViewTypeRegistry.register({
  key: 'calendar',
  label: 'Calendar',
  icon: '📆',
  configSchema: baseViewConfig,
  component: CalendarView,
  requiredProperties: ['date'],
  supportsGrouping: false,
});

ViewTypeRegistry.register({
  key: 'gallery',
  label: 'Gallery',
  icon: '▦',
  configSchema: baseViewConfig,
  component: GalleryView,
  requiredProperties: [],
  supportsGrouping: false,
});
