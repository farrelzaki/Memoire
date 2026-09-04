import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, lt, sql } from 'drizzle-orm';
import { unzipSync } from 'fflate';
import { memoireExportSchema, propertyTypes, type MemoireExport, type PropertyType } from '@memoire/validation';
import { AttachmentsService } from '../attachments/attachments.service';
import { DRIZZLE_DB, DrizzleDB, DrizzleTx } from '../db/drizzle.provider';
import { blocks, databaseProperties, databaseRows, databases, importStagings, pages, workspaces } from '../db/schema';
import { assertPublicHttpUrl, SsrfBlockedError } from '../link-preview/ssrf-guard';
import { guessColumnType, parseCsv } from './csv-parser.lib';
import { guessTitleFromMarkdown, parseMarkdownToBlocks, type TiptapNode } from './markdown-to-blocks.lib';
import { buildNotionTree, resolveNotionLinks, type NotionCsvDatabase, type NotionParsedNode } from './notion-zip.lib';

export interface ParsedPageNode {
  title: string;
  markdown: string | null;
  children: ParsedPageNode[];
}

/** Property types a CSV column can be guessed as or corrected to (§30A.1) — everything else needs config a CSV can't supply. */
const CSV_ALLOWED_TYPES = new Set<PropertyType>(['title', 'text', 'number', 'date', 'checkbox']);

interface StagedCsv {
  kind: 'csv';
  databaseName: string;
  headers: string[];
  rows: string[][];
  columnTypes: PropertyType[];
}

type StagedParsed =
  | { kind: 'markdown'; tree: ParsedPageNode[] }
  | { kind: 'memoire-json'; data: MemoireExport }
  | { kind: 'notion-zip'; tree: NotionParsedNode[] }
  | StagedCsv;

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? 'http://localhost:3001/api';

function importParentTitle(now: Date = new Date()): string {
  return `Import / ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

function countNodes(nodes: ParsedPageNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function countImageRefs(markdown: string): number {
  return (markdown.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length;
}

function collectMarkdown(nodes: ParsedPageNode[]): string[] {
  return nodes.flatMap((n) => [...(n.markdown ? [n.markdown] : []), ...collectMarkdown(n.children)]);
}

function countNotionNodes(nodes: NotionParsedNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNotionNodes(n.children), 0);
}

function countNotionDatabases(nodes: NotionParsedNode[]): number {
  return nodes.reduce((sum, n) => sum + (n.database ? 1 : 0) + countNotionDatabases(n.children), 0);
}

function collectNotionMarkdown(nodes: NotionParsedNode[]): string[] {
  return nodes.flatMap((n) => [...(n.markdown ? [n.markdown] : []), ...collectNotionMarkdown(n.children)]);
}

/** Builds a `title -> children` page tree from `path -> content` zip entries (folder hierarchy -> page hierarchy, §30A.1). */
function buildTreeFromZipEntries(entries: Record<string, Uint8Array>): ParsedPageNode[] {
  const root: ParsedPageNode[] = [];
  const decoder = new TextDecoder();

  const findOrCreate = (list: ParsedPageNode[], title: string): ParsedPageNode => {
    const existing = list.find((n) => n.title === title);
    if (existing) return existing;
    const created: ParsedPageNode = { title, markdown: null, children: [] };
    list.push(created);
    return created;
  };

  for (const [path, content] of Object.entries(entries)) {
    if (!path.toLowerCase().endsWith('.md')) continue;
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;
    let cursor = root;
    for (const folder of parts) {
      cursor = findOrCreate(cursor, folder).children;
    }
    const title = fileName.replace(/\.md$/i, '');
    const node = findOrCreate(cursor, title);
    node.markdown = decoder.decode(content);
  }
  return root;
}

/**
 * Two-step Markdown / memoire.json import (§30A, Sprint 24). Staged in
 * Postgres (`import_stagings`), not memory — see `schema.ts`'s comment on
 * that table. Always creates a NEW "Import / <date>" parent page (§30A.3);
 * this sprint's two formats never overwrite an existing page, which is what
 * makes the `pre_import` version-snapshot rule (needs `page_versions`,
 * Sprint 25) moot here — see ADR-25.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async preview(
    file: UploadedFile,
    kind: 'markdown' | 'memoire-json' | 'csv' | 'notion-zip',
  ): Promise<{ stagingId: string; summary: Record<string, unknown>; warnings: string[] }> {
    if (!file?.buffer) throw new BadRequestException('file is required');

    if (kind === 'markdown') {
      return this.previewMarkdown(file);
    }
    if (kind === 'csv') {
      return this.previewCsv(file);
    }
    if (kind === 'notion-zip') {
      return this.previewNotionZip(file);
    }
    return this.previewMemoireJson(file);
  }

  private async previewNotionZip(file: UploadedFile) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(file.buffer);
    } catch {
      throw new BadRequestException('Could not read the uploaded .zip file');
    }
    const { tree } = buildNotionTree(entries);
    if (tree.length === 0) {
      throw new BadRequestException('No .md or .csv files found in the archive');
    }

    const pageCount = countNotionNodes(tree);
    const databaseCount = countNotionDatabases(tree);
    const imageCount = collectNotionMarkdown(tree).reduce((sum, md) => sum + countImageRefs(md), 0);
    const summary = { pageCount, databaseCount, imageCount, importParentTitle: importParentTitle() };

    const [staging] = await this.db
      .insert(importStagings)
      .values({ kind: 'notion-zip', summary, parsed: { kind: 'notion-zip', tree } satisfies StagedParsed })
      .returning();

    return { stagingId: staging.id, summary, warnings: [] as string[] };
  }

  private async previewCsv(file: UploadedFile) {
    const rows = parseCsv(file.buffer.toString('utf-8'));
    if (rows.length === 0) throw new BadRequestException('Empty CSV file');

    const [headers, ...dataRows] = rows;
    const columnTypes: PropertyType[] = headers.map((_, colIndex) =>
      colIndex === 0 ? 'title' : guessColumnType(dataRows.map((r) => r[colIndex] ?? '')),
    );
    const databaseName = file.originalname.replace(/\.csv$/i, '');
    const summary = {
      databaseName,
      rowCount: dataRows.length,
      importParentTitle: importParentTitle(),
      columns: headers.map((name, i) => ({ name, type: columnTypes[i] })),
    };

    const staged: StagedCsv = { kind: 'csv', databaseName, headers, rows: dataRows, columnTypes };
    const [staging] = await this.db
      .insert(importStagings)
      .values({ kind: 'csv', summary, parsed: staged satisfies StagedParsed })
      .returning();

    return { stagingId: staging.id, summary, warnings: [] as string[] };
  }

  /**
   * User-corrected column types from the preview step (§30A.2) — only
   * updates the staged `parsed.columnTypes`, no re-parse. Column 0 (title)
   * can't be changed away from `title`, and only the types a CSV cell can
   * actually supply are accepted (see `CSV_ALLOWED_TYPES`).
   */
  async updateColumnTypes(
    stagingId: string,
    overrides: Record<number, string>,
  ): Promise<{ summary: Record<string, unknown> }> {
    const [staging] = await this.db.select().from(importStagings).where(eq(importStagings.id, stagingId));
    if (!staging) throw new NotFoundException(`Import staging ${stagingId} not found`);
    const parsed = staging.parsed as StagedParsed;
    if (parsed.kind !== 'csv') throw new BadRequestException('This staging is not a CSV import');

    const columnTypes = [...parsed.columnTypes];
    for (const [indexStr, type] of Object.entries(overrides)) {
      const index = Number(indexStr);
      if (index < 0 || index >= columnTypes.length) {
        throw new BadRequestException(`Column index ${index} is out of range`);
      }
      if (index === 0) {
        throw new BadRequestException('The title column (index 0) cannot be changed');
      }
      if (!propertyTypes.includes(type as PropertyType) || !CSV_ALLOWED_TYPES.has(type as PropertyType)) {
        throw new BadRequestException(`"${type}" is not a valid CSV column type`);
      }
      columnTypes[index] = type as PropertyType;
    }

    const nextStaged: StagedCsv = { ...parsed, columnTypes };
    const summary = {
      databaseName: parsed.databaseName,
      rowCount: parsed.rows.length,
      importParentTitle: importParentTitle(),
      columns: parsed.headers.map((name, i) => ({ name, type: columnTypes[i] })),
    };
    await this.db
      .update(importStagings)
      .set({ summary, parsed: nextStaged satisfies StagedParsed })
      .where(eq(importStagings.id, stagingId));

    return { summary };
  }

  private async previewMarkdown(file: UploadedFile) {
    const isZip = file.originalname.toLowerCase().endsWith('.zip') || file.mimetype === 'application/zip';
    let tree: ParsedPageNode[];
    const warnings: string[] = [];

    if (isZip) {
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(file.buffer);
      } catch {
        throw new BadRequestException('Could not read the uploaded .zip file');
      }
      tree = buildTreeFromZipEntries(entries);
      if (tree.length === 0) warnings.push('No .md files found in the archive');
    } else {
      const text = file.buffer.toString('utf-8');
      tree = [{ title: guessTitleFromMarkdown(text), markdown: text, children: [] }];
    }

    const pageCount = countNodes(tree);
    const imageCount = collectMarkdown(tree).reduce((sum, md) => sum + countImageRefs(md), 0);
    const summary = { pageCount, imageCount, importParentTitle: importParentTitle() };

    const [staging] = await this.db
      .insert(importStagings)
      .values({ kind: 'markdown', summary, parsed: { kind: 'markdown', tree } satisfies StagedParsed })
      .returning();

    return { stagingId: staging.id, summary, warnings };
  }

  private async previewMemoireJson(file: UploadedFile) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('Not valid JSON');
    }
    const result = memoireExportSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException('Not a recognizable memoire.json export');
    }
    const data = result.data;
    const summary = {
      pageCount: data.pages.length,
      imageCount: data.attachments.length,
      importParentTitle: importParentTitle(),
    };

    const [staging] = await this.db
      .insert(importStagings)
      .values({ kind: 'memoire-json', summary, parsed: { kind: 'memoire-json', data } satisfies StagedParsed })
      .returning();

    return { stagingId: staging.id, summary, warnings: [] as string[] };
  }

  async cancel(stagingId: string): Promise<void> {
    await this.db.delete(importStagings).where(eq(importStagings.id, stagingId));
  }

  /** Piggybacks the backup cron's daily tick (§31) — no second scheduled job just for staging cleanup. */
  async cleanupStale(): Promise<void> {
    await this.db.delete(importStagings).where(lt(importStagings.createdAt, new Date(Date.now() - STAGING_MAX_AGE_MS)));
  }

  async confirm(stagingId: string): Promise<{ importParentPageId: string; pageCount: number; warnings: string[] }> {
    const [staging] = await this.db.select().from(importStagings).where(eq(importStagings.id, stagingId));
    if (!staging) throw new NotFoundException(`Import staging ${stagingId} not found`);

    const parsed = staging.parsed as StagedParsed;
    const [workspace] = await this.db.select().from(workspaces).limit(1);
    if (!workspace) throw new BadRequestException('No workspace exists');

    const warnings: string[] = [];
    let result: { importParentPageId: string; pageCount: number; warnings: string[] };
    if (parsed.kind === 'markdown') {
      result = await this.confirmMarkdown(workspace.id, parsed.tree, warnings);
    } else if (parsed.kind === 'csv') {
      result = await this.confirmCsv(workspace.id, parsed, warnings);
    } else if (parsed.kind === 'notion-zip') {
      result = await this.confirmNotionZip(workspace.id, parsed.tree, warnings);
    } else {
      result = await this.confirmMemoireJson(workspace.id, parsed.data, warnings);
    }

    await this.db.delete(importStagings).where(eq(importStagings.id, stagingId));
    return result;
  }

  private async confirmMarkdown(
    workspaceId: string,
    tree: ParsedPageNode[],
    warnings: string[],
  ): Promise<{ importParentPageId: string; pageCount: number; warnings: string[] }> {
    // Blocks are written with their ORIGINAL (possibly remote) image URLs
    // inside the transaction — `attachments.page_id` is NOT NULL, so an
    // attachment can't be created before the page it belongs to exists, and
    // network I/O has no place inside a DB transaction anyway (keeps it
    // short-lived). Remote images are fetched into storage and each
    // affected block's `src` is rewritten in a follow-up pass AFTER commit
    // — a downgrade to "still points at the original URL" on fetch failure,
    // not a fatal import error (surfaced via `warnings`).
    let pageCount = 0;
    const imageBlocksToLocalize: Array<{ id: string; pageId: string; content: TiptapNode }> = [];

    const importParentPageId = await this.db.transaction(async (tx) => {
      const [parent] = await tx
        .insert(pages)
        .values({ workspaceId, title: importParentTitle(), type: 'document', position: 0 })
        .returning();
      pageCount++;

      const insertNode = async (node: ParsedPageNode, parentPageId: string, position: number) => {
        const [page] = await tx
          .insert(pages)
          .values({ workspaceId, parentPageId, title: node.title, type: 'document', position })
          .returning();
        pageCount++;

        if (node.markdown) {
          const rootNodes = parseMarkdownToBlocks(node.markdown);
          for (let i = 0; i < rootNodes.length; i++) {
            const content = rootNodes[i];
            const [block] = await tx
              .insert(blocks)
              .values({ pageId: page.id, type: content.type, position: i, content })
              .returning();
            if (containsRemoteImage(content)) {
              imageBlocksToLocalize.push({ id: block.id, pageId: page.id, content });
            }
          }
        }

        for (let i = 0; i < node.children.length; i++) {
          await insertNode(node.children[i], page.id, i);
        }
      };

      for (let i = 0; i < tree.length; i++) {
        await insertNode(tree[i], parent.id, i);
      }

      return parent.id;
    });

    if (imageBlocksToLocalize.length > 0) {
      const imageUrlToAttachmentId = await this.downloadRemoteImages(imageBlocksToLocalize, warnings);
      for (const { id, content } of imageBlocksToLocalize) {
        const rewritten = rewriteImageSrcs(content, imageUrlToAttachmentId);
        await this.db.update(blocks).set({ content: rewritten }).where(eq(blocks.id, id));
      }
    }

    return { importParentPageId, pageCount, warnings };
  }

  /**
   * One transaction — a page (§30A.3, always a new "Import / <date>"
   * parent), a database owner page (`pages.type = 'database'`, ADR-08 —
   * NOT `'document'`), the `databases` row, one `database_properties` row
   * per corrected column type, and per data row a `database_rows` row plus
   * its detail page. Raw `tx.insert` throughout, not `DatabasesService`
   * (its public methods each open their own transaction — see ADR-25's
   * precedent from `confirmMarkdown`/`confirmMemoireJson`).
   */
  private async confirmCsv(
    workspaceId: string,
    staged: StagedCsv,
    warnings: string[],
  ): Promise<{ importParentPageId: string; pageCount: number; warnings: string[] }> {
    return this.db.transaction(async (tx) => {
      const [parent] = await tx
        .insert(pages)
        .values({ workspaceId, title: importParentTitle(), type: 'document', position: 0 })
        .returning();

      const [ownerPage] = await tx
        .insert(pages)
        .values({ workspaceId, parentPageId: parent.id, title: staged.databaseName, type: 'database', position: 0 })
        .returning();

      const { rowPageCount } = await this.insertCsvDatabase(tx, workspaceId, ownerPage.id, staged.databaseName, staged);

      return { importParentPageId: parent.id, pageCount: 2 + rowPageCount, warnings };
    });
  }

  /**
   * Given an already-created owner page, inserts the `databases` row, one
   * `database_properties` row per column, and per data row a
   * `database_rows` row plus its detail page. Shared by `confirmCsv` and
   * `confirmNotionZip` (a `.csv` sibling in a Notion export is the same
   * shape, §30A.1).
   */
  private async insertCsvDatabase(
    tx: DrizzleTx,
    workspaceId: string,
    ownerPageId: string,
    databaseName: string,
    csv: { headers: string[]; rows: string[][]; columnTypes: PropertyType[] },
  ): Promise<{ rowPageCount: number }> {
    const [database] = await tx
      .insert(databases)
      .values({ workspaceId, ownerPageId, isInline: false, name: databaseName })
      .returning();

    const properties = await tx
      .insert(databaseProperties)
      .values(csv.headers.map((name, i) => ({ databaseId: database.id, name, type: csv.columnTypes[i], position: i })))
      .returning();

    let rowPageCount = 0;
    for (let rowIndex = 0; rowIndex < csv.rows.length; rowIndex++) {
      const cells = csv.rows[rowIndex];
      const values: Record<string, unknown> = {};
      for (let colIndex = 0; colIndex < properties.length; colIndex++) {
        values[properties[colIndex].id] = coerceCsvCell(cells[colIndex] ?? '', csv.columnTypes[colIndex]);
      }

      const [row] = await tx
        .insert(databaseRows)
        .values({ databaseId: database.id, values, position: rowIndex })
        .returning();

      const titleValue = values[properties[0].id];
      const [rowPage] = await tx
        .insert(pages)
        .values({
          workspaceId,
          parentPageId: ownerPageId,
          databaseId: database.id,
          title: typeof titleValue === 'string' ? titleValue : String(titleValue ?? ''),
          type: 'document',
          position: rowIndex,
        })
        .returning();
      await tx.update(databaseRows).set({ pageId: rowPage.id }).where(eq(databaseRows.id, row.id));
      rowPageCount++;
    }
    return { rowPageCount };
  }

  /**
   * One transaction: pages (document or database-owner, per `node.database`)
   * mirroring the Notion export's folder hierarchy, `.csv` siblings become
   * embedded databases (`insertCsvDatabase`, shared with `confirmCsv`), and
   * — once every page's real id is known — a second pass rewrites internal
   * links whose Notion hash suffix resolves to one of the pages just
   * created (`resolveNotionLinks`). Unlike the Markdown importer's remote-
   * image fetch, this rewrite is pure DB work (no network I/O), so it stays
   * inside the same transaction rather than needing a post-commit pass.
   */
  private async confirmNotionZip(
    workspaceId: string,
    tree: NotionParsedNode[],
    warnings: string[],
  ): Promise<{ importParentPageId: string; pageCount: number; warnings: string[] }> {
    let pageCount = 0;
    const hashToPageId = new Map<string, string>();
    const insertedBlocks: Array<{ id: string; content: TiptapNode }> = [];
    const imageBlocksToLocalize: Array<{ id: string; pageId: string; content: TiptapNode }> = [];

    const importParentPageId = await this.db.transaction(async (tx) => {
      const [parent] = await tx
        .insert(pages)
        .values({ workspaceId, title: importParentTitle(), type: 'document', position: 0 })
        .returning();
      pageCount++;

      const insertNode = async (node: NotionParsedNode, parentPageId: string, position: number) => {
        const [page] = await tx
          .insert(pages)
          .values({
            workspaceId,
            parentPageId,
            title: node.title,
            type: node.database ? 'database' : 'document',
            position,
          })
          .returning();
        pageCount++;
        if (node.hash) hashToPageId.set(node.hash, page.id);

        if (node.database) {
          const { rowPageCount } = await this.insertCsvDatabase(tx, workspaceId, page.id, node.title, node.database);
          pageCount += rowPageCount;
        }

        if (node.markdown) {
          const rootNodes = parseMarkdownToBlocks(node.markdown);
          for (let i = 0; i < rootNodes.length; i++) {
            const content = rootNodes[i];
            const [block] = await tx
              .insert(blocks)
              .values({ pageId: page.id, type: content.type, position: i, content })
              .returning();
            insertedBlocks.push({ id: block.id, content });
            if (containsRemoteImage(content)) {
              imageBlocksToLocalize.push({ id: block.id, pageId: page.id, content });
            }
          }
        }

        for (let i = 0; i < node.children.length; i++) {
          await insertNode(node.children[i], page.id, i);
        }
      };

      for (let i = 0; i < tree.length; i++) {
        await insertNode(tree[i], parent.id, i);
      }

      // Second pass — every hash is known now, so internal links can resolve.
      for (const { id, content } of insertedBlocks) {
        const rewritten = resolveNotionLinks(content, hashToPageId, warnings);
        await tx.update(blocks).set({ content: rewritten }).where(eq(blocks.id, id));
      }

      return parent.id;
    });

    if (imageBlocksToLocalize.length > 0) {
      const imageUrlToAttachmentId = await this.downloadRemoteImages(imageBlocksToLocalize, warnings);
      for (const { id, content } of imageBlocksToLocalize) {
        const rewritten = rewriteImageSrcs(content, imageUrlToAttachmentId);
        await this.db.update(blocks).set({ content: rewritten }).where(eq(blocks.id, id));
      }
    }

    return { importParentPageId, pageCount, warnings };
  }

  private async confirmMemoireJson(
    workspaceId: string,
    data: MemoireExport,
    warnings: string[],
  ): Promise<{ importParentPageId: string; pageCount: number; warnings: string[] }> {
    return this.db.transaction(async (tx) => {
      const [parent] = await tx
        .insert(pages)
        .values({ workspaceId, title: importParentTitle(), type: 'document', position: 0 })
        .returning();

      const idMap = new Map<string, string>();
      const oldRootIds = data.pages.filter((p) => !p.parentPageId).map((p) => p.id);

      // Two passes: insert every page first (so parentPageId FKs always
      // resolve regardless of array order), then patch parentPageId — every
      // former root page reparents under the new import parent.
      for (const page of data.pages) {
        const [inserted] = await tx
          .insert(pages)
          .values({
            workspaceId,
            title: page.title,
            type: page.type,
            position: page.position,
            isArchived: false,
          })
          .returning();
        idMap.set(page.id, inserted.id);
      }
      for (const page of data.pages) {
        const newId = idMap.get(page.id)!;
        const newParentId = page.parentPageId
          ? (idMap.get(page.parentPageId) ?? parent.id)
          : parent.id;
        await tx.update(pages).set({ parentPageId: newParentId }).where(eq(pages.id, newId));
      }
      if (oldRootIds.length === 0) warnings.push('No root pages found in the export');

      for (const block of data.blocks) {
        const newPageId = idMap.get(block.pageId);
        if (!newPageId) continue;
        await tx.insert(blocks).values({
          pageId: newPageId,
          type: block.type,
          position: block.position,
          content: block.content,
        });
      }

      return { importParentPageId: parent.id, pageCount: idMap.size + 1, warnings };
    });
  }

  /**
   * Fetches every distinct remote (http/https) image URL referenced by the
   * given blocks, SSRF-guarded, into attachment storage — each attachment
   * is owned by (one of) the real, already-inserted page(s) that reference
   * it, since `attachments.page_id` is `NOT NULL`.
   */
  private async downloadRemoteImages(
    imageBlocks: Array<{ pageId: string; content: TiptapNode }>,
    warnings: string[],
  ): Promise<Map<string, string>> {
    const urlToPageId = new Map<string, string>();
    for (const { pageId, content } of imageBlocks) {
      for (const url of collectImageUrls(content)) {
        if (!urlToPageId.has(url)) urlToPageId.set(url, pageId);
      }
    }

    const map = new Map<string, string>();
    for (const [url, pageId] of urlToPageId) {
      try {
        await assertPublicHttpUrl(url);
        const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());
        const filename = url.split('/').pop()?.split('?')[0] || 'image';
        const attachment = await this.attachmentsService.upload(
          { buffer, originalname: filename, mimetype: contentType.split(';')[0], size: buffer.length },
          pageId,
        );
        map.set(url, attachment.id);
      } catch (error) {
        if (error instanceof SsrfBlockedError) {
          warnings.push(`Skipped a blocked image URL: ${url}`);
        } else {
          this.logger.warn(`Could not fetch import image ${url}: ${(error as Error).message}`);
          warnings.push(`Could not fetch image: ${url}`);
        }
      }
    }
    return map;
  }
}

function collectImageUrls(node: TiptapNode): string[] {
  const own =
    node.type === 'image' && typeof node.attrs?.src === 'string' && /^https?:\/\//i.test(node.attrs.src)
      ? [node.attrs.src]
      : [];
  return [...own, ...(node.content ?? []).flatMap(collectImageUrls)];
}

function containsRemoteImage(node: TiptapNode): boolean {
  return collectImageUrls(node).length > 0;
}

/** Rewrites `image` node `src` attrs from a remote URL to the freshly-uploaded attachment's content URL. */
function rewriteImageSrcs(node: TiptapNode, urlToAttachmentId: Map<string, string>): TiptapNode {
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    const attachmentId = urlToAttachmentId.get(node.attrs.src);
    if (attachmentId) {
      return { ...node, attrs: { ...node.attrs, src: `${API_PUBLIC_URL}/attachments/${attachmentId}/content` } };
    }
  }
  if (node.content) {
    return { ...node, content: node.content.map((child) => rewriteImageSrcs(child, urlToAttachmentId)) };
  }
  return node;
}

/** Converts a raw CSV cell string to the JS type the property's column type expects. */
function coerceCsvCell(cell: string, type: PropertyType): unknown {
  const trimmed = cell.trim();
  if (trimmed === '') return type === 'checkbox' ? false : type === 'number' ? null : '';
  switch (type) {
    case 'number': {
      const n = Number(trimmed);
      return Number.isNaN(n) ? null : n;
    }
    case 'checkbox':
      return /^true$/i.test(trimmed);
    case 'date':
      return trimmed;
    default:
      return cell;
  }
}
