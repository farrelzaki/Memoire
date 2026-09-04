import type { MemoireExport } from '@memoire/validation';
import type { BlockPayload } from './blocks';
import { offlineDb, STORES } from './offline-db';
import { queueMutation } from './offline-sync';
import { isMutatingMethod } from './offline-queue';
import type {
  Attachment,
  Backlink,
  Block,
  CanvasData,
  Database,
  DatabaseAggregate,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseRow,
  DatabaseView,
  LinkPreview,
  Page,
  PageSettings,
  PageType,
  PropertyType,
  RowTemplate,
  SearchHit,
  SearchQueryParams,
  VersionDiffResult,
  VersionFullContent,
  VersionSummary,
  ViewConfig,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** URL the browser can load to stream an attachment's content through the API. */
export function attachmentContentUrl(id: string): string {
  return `${API_BASE}/attachments/${id}/content`;
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * Client-generated id for POST bodies (§10B.5 invariant 14). Minting it here,
 * before the request is even sent, is what keeps offline outbox replay
 * idempotent — the id is fixed at call time, not assigned by the server, so
 * a request that gets queued and retried after reconnect can't create a
 * duplicate row under a different id.
 */
function newClientId(): string {
  return crypto.randomUUID();
}

/**
 * Offline-aware request helper (Sprint 11). GETs are cached in IndexedDB and
 * served from cache when the network is unreachable; mutating requests get
 * queued into the outbox and replayed once back online (see offline-sync.ts).
 * This is client-local caching, not sync — there is still exactly one
 * writer (this browser), so no conflict resolution is needed.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        detail = body.error?.message ?? '';
      } catch {
        // non-JSON error body — ignore
      }
      throw new Error(detail || `Request failed (${res.status})`);
    }

    const data = (await res.json()) as T;
    if (method === 'GET' && offlineDb.isAvailable()) {
      void offlineDb.put(STORES.httpCache, data, path);
    }
    return data;
  } catch (err) {
    if (!isNetworkError(err) || !offlineDb.isAvailable()) throw err;

    if (method === 'GET') {
      const cached = await offlineDb.get<T>(STORES.httpCache, path);
      if (cached !== undefined) return cached;
      throw err;
    }

    if (isMutatingMethod(method)) {
      const body = init?.body ? (JSON.parse(init.body as string) as unknown) : undefined;
      await queueMutation(method as 'POST' | 'PATCH' | 'PUT' | 'DELETE', path, body);
      // Optimistic result: caller's own payload is the best local guess at
      // the post-mutation state until the queued request lands.
      return (body ?? {}) as T;
    }

    throw err;
  }
}

export interface CreatePageInput {
  id?: string;
  title?: string;
  parentPageId?: string | null;
  type?: PageType;
}

export interface UpdatePageInput {
  title?: string;
  icon?: string | null;
  coverUrl?: string | null;
  isFavorite?: boolean;
  settings?: PageSettings;
}

export const api = {
  listPages: () => request<Page[]>('/pages'),
  getPage: (id: string) => request<Page>(`/pages/${id}`),
  createPage: (body: CreatePageInput) =>
    request<Page>('/pages', {
      method: 'POST',
      body: JSON.stringify({ ...body, id: body.id ?? newClientId() }),
    }),
  updatePage: (id: string, body: UpdatePageInput) =>
    request<Page>(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archivePage: (id: string) =>
    request<Page>(`/pages/${id}/archive`, { method: 'POST' }),
  restorePage: (id: string) =>
    request<Page>(`/pages/${id}/restore`, { method: 'POST' }),
  duplicatePage: (id: string) =>
    request<Page>(`/pages/${id}/duplicate`, { method: 'POST' }),
  /** Hard delete — only valid for pages already in Trash. */
  permanentDeletePage: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/pages/${id}/permanent`, {
      method: 'DELETE',
    }),
  /** Drag-drop reorder + reparent (§19A.4, Sprint 22). Omitting beforeId/afterId appends. */
  movePage: (
    id: string,
    body: { parentPageId?: string | null; beforeId?: string | null; afterId?: string | null },
  ) => request<Page>(`/pages/${id}/move`, { method: 'POST', body: JSON.stringify(body) }),
  getBacklinks: (id: string) => request<Backlink[]>(`/pages/${id}/backlinks`),

  getLinkPreview: (url: string) =>
    request<LinkPreview>('/link-preview', { method: 'POST', body: JSON.stringify({ url }) }),

  listBlocks: (pageId: string) => request<Block[]>(`/pages/${pageId}/blocks`),
  /** Resolves a block by id whether top-level or nested (§11E.4) — used by synced blocks. */
  getBlock: (id: string) => request<Block>(`/blocks/${id}`),
  replaceBlocks: (pageId: string, blocks: BlockPayload[]) =>
    request<Block[]>(`/pages/${pageId}/blocks`, {
      method: 'PUT',
      body: JSON.stringify({ blocks }),
    }),

  // Multipart upload (no JSON Content-Type), so it bypasses the `request` helper.
  uploadAttachment: (file: File, pageId: string): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file);
    form.append('pageId', pageId);
    return fetch(`${API_BASE}/attachments/upload`, { method: 'POST', body: form }).then(
      async (res) => {
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        return res.json() as Promise<Attachment>;
      },
    );
  },

  previewImport: (
    file: File,
    kind: 'markdown' | 'memoire-json' | 'csv' | 'notion-zip',
  ): Promise<{ stagingId: string; summary: Record<string, unknown>; warnings: string[] }> => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    return fetch(`${API_BASE}/import/preview`, { method: 'POST', body: form }).then(async (res) => {
      if (!res.ok) throw new Error(`Import preview failed (${res.status})`);
      return res.json();
    });
  },
  /** CSV import only (§30A.1) — corrects one or more guessed column types before confirm. */
  updateImportColumnTypes: (stagingId: string, columnTypes: Record<number, string>) =>
    request<{ summary: Record<string, unknown> }>(`/import/${stagingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ columnTypes }),
    }),
  confirmImport: (stagingId: string) =>
    request<{ importParentPageId: string; pageCount: number; warnings: string[] }>(
      `/import/${stagingId}/confirm`,
      { method: 'POST' },
    ),
  cancelImport: (stagingId: string) =>
    request<{ success: boolean }>(`/import/${stagingId}`, { method: 'DELETE' }),

  runBackup: () => request<{ filename: string; createdAt: string; size: number }>('/backup/run', { method: 'POST' }),
  listBackups: () => request<Array<{ filename: string; createdAt: string; size: number }>>('/backup'),
  backupDownloadUrl: (filename: string) => `${API_BASE}/backup/${filename}/download`,

  getDatabase: (pageId: string) =>
    request<DatabaseAggregate>(`/databases/by-page/${pageId}`),
  /** Addresses a database directly — inline/linked blocks reference a database by id, not its owner page (§20C.3). */
  getDatabaseById: (id: string) => request<DatabaseAggregate>(`/databases/${id}`),
  listDatabases: () => request<Database[]>('/databases'),
  createDatabase: (body: { id?: string; ownerPageId: string; name?: string; isInline: boolean }) =>
    request<Database>('/databases', {
      method: 'POST',
      body: JSON.stringify({ ...body, id: body.id ?? newClientId() }),
    }),
  createProperty: (
    databaseId: string,
    body: { id?: string; name: string; type: PropertyType; config?: Record<string, unknown> },
  ) =>
    request<DatabaseProperty>(`/databases/${databaseId}/properties`, {
      method: 'POST',
      body: JSON.stringify({ ...body, id: body.id ?? newClientId() }),
    }),
  updateProperty: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    request<DatabaseProperty>(`/database-properties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProperty: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-properties/${id}`, { method: 'DELETE' }),
  createRow: (databaseId: string, values: Record<string, unknown> = {}, id?: string, templateId?: string) =>
    request<DatabaseRow>(`/databases/${databaseId}/rows`, {
      method: 'POST',
      body: JSON.stringify({ id: id ?? newClientId(), values, templateId }),
    }),
  updateRow: (id: string, values: Record<string, unknown>) =>
    request<DatabaseRow>(`/database-rows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    }),
  deleteRow: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-rows/${id}`, { method: 'DELETE' }),
  archiveRow: (id: string) => request<DatabaseRow>(`/database-rows/${id}/archive`, { method: 'POST' }),
  restoreRow: (id: string) => request<DatabaseRow>(`/database-rows/${id}/restore`, { method: 'POST' }),
  getRowByPage: (pageId: string) => request<DatabaseRow | null>(`/database-rows/by-page/${pageId}`),
  /** Links two rows via a relation property (§23A). */
  addRelation: (rowId: string, propertyId: string, toRowId: string) =>
    request<{ linked: boolean }>(`/database-rows/${rowId}/relations/${propertyId}`, {
      method: 'POST',
      body: JSON.stringify({ toRowId }),
    }),
  removeRelation: (rowId: string, propertyId: string, toRowId: string) =>
    request<{ linked: boolean }>(`/database-rows/${rowId}/relations/${propertyId}/${toRowId}`, {
      method: 'DELETE',
    }),
  /** Drag-drop reorder (§19A.4, Sprint 21) — either id may be `null` for "at the start"/"at the end". */
  reorderRow: (id: string, beforeId: string | null, afterId: string | null) =>
    request<DatabaseRow>(`/database-rows/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ beforeId, afterId }),
    }),
  /** A board card dragged into a different column — reorder + regroup in one call. */
  reorderRowIntoGroup: (
    id: string,
    groupPropertyId: string,
    groupValue: unknown,
    beforeId: string | null,
    afterId: string | null,
  ) =>
    request<DatabaseRow>(`/database-rows/${id}/reorder-into-group`, {
      method: 'POST',
      body: JSON.stringify({ groupPropertyId, groupValue, beforeId, afterId }),
    }),
  reorderProperty: (id: string, beforeId: string | null, afterId: string | null) =>
    request<DatabaseProperty>(`/database-properties/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ beforeId, afterId }),
    }),
  reorderView: (id: string, beforeId: string | null, afterId: string | null) =>
    request<DatabaseView>(`/database-views/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ beforeId, afterId }),
    }),
  listTemplates: (databaseId: string) => request<RowTemplate[]>(`/databases/${databaseId}/templates`),
  createTemplate: (databaseId: string, body: { name: string; icon?: string | null; content: Record<string, unknown> }) =>
    request<RowTemplate>(`/databases/${databaseId}/templates`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteTemplate: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
  createView: (
    databaseId: string,
    body: { id?: string; name: string; type: string; config?: Record<string, unknown> },
  ) =>
    request<DatabaseView>(`/databases/${databaseId}/views`, {
      method: 'POST',
      body: JSON.stringify({ ...body, id: body.id ?? newClientId() }),
    }),
  updateView: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    request<DatabaseView>(`/database-views/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteView: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-views/${id}`, { method: 'DELETE' }),
  duplicateView: (id: string) => request<DatabaseView>(`/database-views/${id}/duplicate`, { method: 'POST' }),
  moveView: (id: string, direction: 'left' | 'right') =>
    request<DatabaseView[]>(`/database-views/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    }),
  /** The one path that reads rows — filter/sort/group/aggregation all run server-side (§22A). */
  queryDatabase: (
    databaseId: string,
    body: { viewId?: string; overrides?: Partial<ViewConfig>; cursor?: string; limit?: number },
  ) =>
    request<DatabaseQueryResult>(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  search: (q: string, params: SearchQueryParams = {}) => {
    const qs = new URLSearchParams({ q });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) qs.set(key, String(value));
    }
    return request<SearchHit[]>(`/search?${qs.toString()}`);
  },
  exportWorkspace: () => request<MemoireExport>('/export/json'),

  getCanvas: (pageId: string) => request<CanvasData>(`/pages/${pageId}/canvas`),
  updateCanvas: (pageId: string, body: { elements?: unknown[]; viewport?: Record<string, unknown> }) =>
    request<CanvasData>(`/pages/${pageId}/canvas`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Version history (§33A, Sprint 25).
  listVersions: (pageId: string) => request<VersionSummary[]>(`/pages/${pageId}/versions`),
  saveVersion: (pageId: string, label?: string) =>
    request<VersionSummary>(`/pages/${pageId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  getVersion: (id: string) => request<VersionFullContent>(`/versions/${id}`),
  diffVersions: (from: string, to: string) =>
    request<VersionDiffResult>(`/versions/diff?from=${from}&to=${to}`),
  restoreVersion: (id: string) => request<Page>(`/versions/${id}/restore`, { method: 'POST' }),

  getWorkspace: () => request<{ id: string; settings: Record<string, unknown> }>('/workspace'),
  updateWorkspaceSettings: (settings: Record<string, unknown>) =>
    request<{ id: string; settings: Record<string, unknown> }>('/workspace', {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    }),
};
