import { describe, expect, it } from 'vitest';
import { canvasToFlow, flowToCanvasPatch } from './diagram';
import type { CanvasData } from './types';

function makeCanvas(partial: Partial<CanvasData>): CanvasData {
  return {
    id: 'c1',
    pageId: 'p1',
    canvasKind: 'diagram',
    elements: [],
    viewport: {},
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('canvasToFlow / flowToCanvasPatch', () => {
  it('reads nodes from elements and edges from viewport.edges', () => {
    const canvas = makeCanvas({
      elements: [{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
      viewport: { edges: [{ id: 'e1', source: 'n1', target: 'n2' }], zoom: 1 },
    });

    const { nodes, edges } = canvasToFlow(canvas);
    expect(nodes).toEqual([{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'A' } }]);
    expect(edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2' }]);
  });

  it('defaults to empty arrays when elements/viewport are missing', () => {
    const canvas = makeCanvas({ elements: null, viewport: null });
    expect(canvasToFlow(canvas)).toEqual({ nodes: [], edges: [] });
  });

  it('round-trips nodes/edges through a canvas patch', () => {
    const nodes = [{ id: 'n1', position: { x: 5, y: 5 }, data: { label: 'A' } }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const patch = flowToCanvasPatch(nodes, edges, { zoom: 2 });

    expect(patch.elements).toEqual(nodes);
    expect(patch.viewport).toEqual({ zoom: 2, edges });

    const { nodes: roundTrippedNodes, edges: roundTrippedEdges } = canvasToFlow(
      makeCanvas({ elements: patch.elements, viewport: patch.viewport }),
    );
    expect(roundTrippedNodes).toEqual(nodes);
    expect(roundTrippedEdges).toEqual(edges);
  });
});
