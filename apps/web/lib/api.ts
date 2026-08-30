import type { BlockPayload } from './blocks';
import type {
  Attachment,
  Block,
  DatabaseAggregate,
  DatabaseProperty,
  DatabaseRow,
  DatabaseView,
  Page,
  PageType,
  PropertyType,
  SearchHit,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** URL the browser can load to stream an attachment's content through the API. */
export function attachmentContentUrl(id: string): string {
  return `${API_BASE}/attachments/${id}/content`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  return res.json() as Promise<T>;
}

export interface CreatePageInput {
  title?: string;
  parentPageId?: string | null;
  type?: PageType;
}

export interface UpdatePageInput {
  title?: string;
  isFavorite?: boolean;
}

export const api = {
  listPages: () => request<Page[]>('/pages'),
  getPage: (id: string) => request<Page>(`/pages/${id}`),
  createPage: (body: CreatePageInput) =>
    request<Page>('/pages', { method: 'POST', body: JSON.stringify(body) }),
  updatePage: (id: string, body: UpdatePageInput) =>
    request<Page>(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archivePage: (id: string) =>
    request<Page>(`/pages/${id}/archive`, { method: 'POST' }),
  restorePage: (id: string) =>
    request<Page>(`/pages/${id}/restore`, { method: 'POST' }),
  movePage: (
    id: string,
    body: { parentPageId?: string | null; position?: number },
  ) => request<Page>(`/pages/${id}/move`, { method: 'POST', body: JSON.stringify(body) }),

  listBlocks: (pageId: string) => request<Block[]>(`/pages/${pageId}/blocks`),
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

  getDatabase: (pageId: string) =>
    request<DatabaseAggregate>(`/databases/by-page/${pageId}`),
  createProperty: (databaseId: string, body: { name: string; type: PropertyType; config?: Record<string, unknown> }) =>
    request<DatabaseProperty>(`/databases/${databaseId}/properties`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProperty: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    request<DatabaseProperty>(`/database-properties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProperty: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-properties/${id}`, { method: 'DELETE' }),
  createRow: (databaseId: string, values: Record<string, unknown> = {}) =>
    request<DatabaseRow>(`/databases/${databaseId}/rows`, {
      method: 'POST',
      body: JSON.stringify({ values }),
    }),
  updateRow: (id: string, values: Record<string, unknown>) =>
    request<DatabaseRow>(`/database-rows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    }),
  deleteRow: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-rows/${id}`, { method: 'DELETE' }),
  createView: (databaseId: string, body: { name: string; type: string; config?: Record<string, unknown> }) =>
    request<DatabaseView>(`/databases/${databaseId}/views`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateView: (id: string, body: { name?: string; config?: Record<string, unknown> }) =>
    request<DatabaseView>(`/database-views/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteView: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/database-views/${id}`, { method: 'DELETE' }),

  search: (q: string) => request<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
  exportWorkspace: () => request<Record<string, unknown>>('/export/json'),
};
