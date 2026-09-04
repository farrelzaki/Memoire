import { z } from 'zod';

/**
 * Version history request shapes (§33A, Sprint 25) — shared between the API
 * controller's validation pipe and the frontend's history panel.
 */

export const manualSnapshotSchema = z.object({
  label: z.string().max(200).optional(),
});
export type ManualSnapshotDto = z.infer<typeof manualSnapshotSchema>;

export const workspaceSettingsSchema = z.object({
  versionRetentionDays: z.number().int().positive().nullable().optional(),
});
export type WorkspaceSettingsDto = z.infer<typeof workspaceSettingsSchema>;
