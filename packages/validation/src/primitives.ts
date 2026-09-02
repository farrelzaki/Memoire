import { z } from 'zod';

/**
 * Shared primitive schemas (§39A.2). Kept tiny and dependency-free — these
 * are the building blocks every other schema in this package composes from,
 * so a change here ripples everywhere on purpose.
 */

export const uuid = z.string().uuid();

export const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'Expected an ISO 8601 datetime string',
});

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb hex color');

export const nonEmptyString = z.string().trim().min(1);

/** Position is a float so drag-and-drop can insert between two siblings without renumbering (§19A.4). */
export const positionValue = z.number().finite();

export const iconString = z.string().max(255).nullish();
