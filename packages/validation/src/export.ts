import { z } from 'zod';
import { uuid } from './primitives';

/**
 * Shape of `GET /export/json` (`ExportService.exportWorkspace()`,
 * `apps/api/src/export/export.service.ts`) — the full-workspace JSON dump
 * that is both the human "Export JSON" action AND the machine restore
 * source for backup/import (§30, §31, §30A, Sprint 24). `.passthrough()` on
 * each row shape: this validates "does this look like a memoire export",
 * not a strict 1:1 mirror of every Drizzle column — extra/evolving fields
 * shouldn't break import of an older or newer export.
 */

const workspaceRowSchema = z.object({ id: uuid, name: z.string() }).passthrough();

const pageRowSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    parentPageId: uuid.nullable(),
    title: z.string(),
    type: z.string(),
    isArchived: z.boolean(),
    position: z.number(),
  })
  .passthrough();

const blockRowSchema = z
  .object({
    id: uuid,
    pageId: uuid,
    type: z.string(),
    position: z.number(),
    content: z.unknown().nullable(),
  })
  .passthrough();

const databaseRowSchemaTable = z
  .object({ id: uuid, workspaceId: uuid, ownerPageId: uuid, name: z.string() })
  .passthrough();

const databasePropertyRowSchema = z
  .object({ id: uuid, databaseId: uuid, name: z.string(), type: z.string() })
  .passthrough();

const databaseRowRowSchema = z
  .object({ id: uuid, databaseId: uuid, pageId: uuid.nullable(), values: z.unknown().nullable() })
  .passthrough();

const attachmentRowSchema = z
  .object({
    id: uuid,
    pageId: uuid.nullable(),
    filename: z.string(),
    mimeType: z.string(),
    storageKey: z.string(),
  })
  .passthrough();

export const memoireExportSchema = z.object({
  app: z.literal('memoire'),
  version: z.number(),
  exportedAt: z.string(),
  workspaces: z.array(workspaceRowSchema),
  pages: z.array(pageRowSchema),
  blocks: z.array(blockRowSchema),
  databases: z.array(databaseRowSchemaTable),
  properties: z.array(databasePropertyRowSchema),
  rows: z.array(databaseRowRowSchema),
  attachments: z.array(attachmentRowSchema),
});
export type MemoireExport = z.infer<typeof memoireExportSchema>;
