import type { CanvasData } from './types';

/** Minimal shape of a React Flow node/edge we persist (avoids depending on @xyflow/react types here). */
export interface FlowNode {
  id: string;
  position: { x: number; y: number };
  data: { label: string };
  type?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

/** Nodes live in `elements` (array), edges live in `viewport.edges` — both columns are already flexible JSONB. */
export function canvasToFlow(canvas: CanvasData): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = (canvas.elements ?? []) as unknown as FlowNode[];
  const edges = (canvas.viewport?.edges ?? []) as unknown as FlowEdge[];
  return { nodes, edges };
}

export function flowToCanvasPatch(
  nodes: FlowNode[],
  edges: FlowEdge[],
  viewport?: Record<string, unknown>,
): { elements: unknown[]; viewport: Record<string, unknown> } {
  return {
    elements: nodes as unknown[],
    viewport: { ...viewport, edges },
  };
}
