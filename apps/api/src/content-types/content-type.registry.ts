/**
 * Backend content-type registry (§11A). Document and database keep their own
 * dedicated modules (they are core types — §11A.4); whiteboard/diagram share
 * the page_canvases storage via the WhiteboardService. This map is the single
 * source of truth for the known page types, so adding a new type means adding
 * one entry here + one module, not touching pages/sidebar routing.
 */
export const CONTENT_TYPES = {
  document: 'document',
  database: 'database',
  whiteboard: 'whiteboard',
  diagram: 'diagram',
} as const;

export type ContentTypeKey = keyof typeof CONTENT_TYPES;
