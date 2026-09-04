import { strToU8, zipSync } from 'fflate';
import { toCsvDocument } from '@/lib/csv';
import { downloadBlob } from '@/lib/download';
import { BlockTypeRegistry } from '@/features/editor/block-type-registry';
import { PropertyTypeRegistry } from '@/features/database/property-type-registry';
import { api, attachmentContentUrl } from '@/lib/api';
import { buildPageTree, type PageTreeNode } from '@/lib/pages';
import type { PropertyType } from '@/lib/types';

/** Filesystem-safe name for a page/database title used as a zip entry path segment. */
function safeSegment(name: string): string {
  const trimmed = (name || 'Untitled').trim().replace(/[/\\:*?"<>|]/g, '-');
  return trimmed.length > 0 ? trimmed : 'Untitled';
}

async function pageToMarkdown(pageId: string): Promise<string> {
  const blocks = await api.listBlocks(pageId);
  return blocks
    .map((block) => (block.content ? BlockTypeRegistry.get(block.type)?.toMarkdown(block.content) : ''))
    .filter(Boolean)
    .join('\n\n');
}

async function collectPageFiles(
  nodes: PageTreeNode[],
  dir: string,
  files: Record<string, Uint8Array>,
): Promise<void> {
  for (const node of nodes) {
    if (node.type === 'document') {
      const markdown = await pageToMarkdown(node.id);
      files[`pages/${dir}${safeSegment(node.title)}.md`] = strToU8(markdown);
    }
    if (node.children.length > 0) {
      await collectPageFiles(node.children, `${dir}${safeSegment(node.title)}/`, files);
    }
  }
}

/**
 * Builds and downloads the workspace export ZIP (§30B.4) — `pages/*.md`
 * (mirroring the page hierarchy), `databases/*.csv`, `assets/*`
 * (attachments), and `memoire.json` (the lossless restore source, §31's
 * backup content). Renders entirely client-side, reusing
 * `BlockTypeRegistry`/`PropertyTypeRegistry` (frontend-only, ADR-24) — see
 * ADR-25 for why this isn't a backend endpoint. Deliberately reuses the
 * ALREADY-FETCHED `GET /export/json` payload for database properties/rows
 * instead of re-querying each database's live view — a workspace export
 * wants every row unfiltered, and the JSON dump already has them all in
 * one round trip.
 */
export async function exportWorkspaceZip(): Promise<void> {
  const [pages, workspaceJson] = await Promise.all([api.listPages(), api.exportWorkspace()]);
  const activePages = pages.filter((p) => !p.isArchived);
  const tree = buildPageTree(activePages);

  const files: Record<string, Uint8Array> = {
    'memoire.json': strToU8(JSON.stringify(workspaceJson, null, 2)),
  };

  await collectPageFiles(tree, '', files);

  for (const database of workspaceJson.databases) {
    const properties = workspaceJson.properties
      .filter((p) => p.databaseId === database.id)
      .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0));
    const rows = workspaceJson.rows.filter((r) => r.databaseId === database.id);
    const headers = properties.map((p) => p.name);
    const csvRows = rows.map((row) => {
      const values = (row.values ?? {}) as Record<string, unknown>;
      return properties.map(
        (p) => PropertyTypeRegistry.get(p.type as PropertyType)?.toCsv(values[p.id]) ?? '',
      );
    });
    files[`databases/${safeSegment(database.name)}.csv`] = strToU8(toCsvDocument(headers, csvRows));
  }

  for (const attachment of workspaceJson.attachments) {
    const response = await fetch(attachmentContentUrl(attachment.id));
    if (!response.ok) continue; // an attachment missing from storage shouldn't fail the whole export
    const buffer = new Uint8Array(await response.arrayBuffer());
    files[`assets/${attachment.id}-${safeSegment(attachment.filename)}`] = buffer;
  }

  const zipped = zipSync(files, { level: 6 });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`memoire-export-${dateStamp}.zip`, new Blob([zipped.slice()], { type: 'application/zip' }));
}
