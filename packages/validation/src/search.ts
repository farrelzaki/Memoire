import { z } from 'zod';
import { uuid } from './primitives';

/**
 * Search request/response shapes (§25A, Sprint 23) — shared between the API
 * controller's validation pipe and the frontend's `SearchHit`/query-builder
 * so the two never drift (§10B invariant #11).
 */

export const searchResultTypes = ['page', 'block', 'database', 'row'] as const;
export type SearchResultType = (typeof searchResultTypes)[number];

export const searchPageTypeFilter = ['document', 'database', 'whiteboard', 'diagram'] as const;
export type SearchPageTypeFilter = (typeof searchPageTypeFilter)[number];

export const searchTimeRangeFilter = ['7d', '30d', 'year'] as const;
export type SearchTimeRangeFilter = (typeof searchTimeRangeFilter)[number];

export const searchSortOptions = ['relevance', 'updated'] as const;
export type SearchSortOption = (typeof searchSortOptions)[number];

/**
 * `mode` is explicit rather than inferred from query length: the command
 * palette always wants prefix/quick-find behavior regardless of how many
 * characters have been typed, and the `/search` page always wants full
 * `websearch_to_tsquery` phrase/exclusion semantics even for a short query.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  mode: z.enum(['quick', 'full']).default('full'),
  type: z.enum(searchPageTypeFilter).optional(),
  timeRange: z.enum(searchTimeRangeFilter).optional(),
  locationPageId: uuid.optional(),
  sort: z.enum(searchSortOptions).default('relevance'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z.object({
  type: z.enum(searchResultTypes),
  pageId: uuid,
  blockId: uuid.optional(),
  rowId: uuid.optional(),
  databaseId: uuid.optional(),
  title: z.string(),
  breadcrumb: z.array(z.string()),
  snippet: z.string().nullable(),
  rank: z.number(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;
