'use client';

import '@xyflow/react/dist/style.css';

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  getViewportForBounds,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useQuery } from '@tanstack/react-query';
import { toPng, toSvg } from 'html-to-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { canvasToFlow, flowToCanvasPatch, type FlowEdge, type FlowNode } from '@/lib/diagram';

let nodeSeq = 0;
function nextNodeId(): string {
  nodeSeq += 1;
  return `node-${nodeSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function DiagramCanvas({ pageId, initial }: { pageId: string; initial: { nodes: FlowNode[]; edges: FlowEdge[]; viewport?: Record<string, unknown> } }) {
  const [nodes, setNodes] = useState<Node[]>(initial.nodes as unknown as Node[]);
  const [edges, setEdges] = useState<Edge[]>(initial.edges as unknown as Edge[]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { getNodes, getNodesBounds } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const scheduleSave = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const patch = flowToCanvasPatch(
          nextNodes as unknown as FlowNode[],
          nextEdges as unknown as FlowEdge[],
          initial.viewport,
        );
        void api.updateCanvas(pageId, patch);
      }, 800);
    },
    [pageId, initial.viewport],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        scheduleSave(next, edges);
        return next;
      });
    },
    [edges, scheduleSave],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        scheduleSave(nodes, next);
        return next;
      });
    },
    [nodes, scheduleSave],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge(connection, current);
        scheduleSave(nodes, next);
        return next;
      });
    },
    [nodes, scheduleSave],
  );

  const addNode = useCallback(() => {
    setNodes((current) => {
      const next = [
        ...current,
        {
          id: nextNodeId(),
          position: { x: 80 + current.length * 24, y: 80 + current.length * 24 },
          data: { label: 'Node' },
        },
      ];
      scheduleSave(next, edges);
      return next;
    });
  }, [edges, scheduleSave]);

  const renameNode = useCallback(
    (id: string, currentLabel: string) => {
      const label = window.prompt('Node label', currentLabel);
      if (label === null) return;
      setNodes((current) => {
        const next = current.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n));
        scheduleSave(next, edges);
        return next;
      });
    },
    [edges, scheduleSave],
  );

  const exportImage = useCallback(
    async (format: 'png' | 'svg') => {
      const viewportEl = wrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
      if (!viewportEl) return;

      const bounds = getNodesBounds(getNodes());
      const width = Math.max(bounds.width, 1) + 80;
      const height = Math.max(bounds.height, 1) + 80;
      const { x, y, zoom } = getViewportForBounds(bounds, width, height, 0.5, 2, 0.1);

      const options = {
        width,
        height,
        skipFonts: true,
        style: {
          width: `${width}`,
          height: `${height}`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        },
      };

      try {
        const dataUrl = format === 'png' ? await toPng(viewportEl, options) : await toSvg(viewportEl, options);
        downloadDataUrl(dataUrl, `diagram.${format}`);
      } catch (err) {
        console.error('diagram export failed', err);
      }
    },
    [getNodes, getNodesBounds],
  );

  return (
    <div className="flex h-[70vh] w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={addNode}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Node
        </button>
        <button
          onClick={() => void exportImage('png')}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Export PNG
        </button>
        <button
          onClick={() => void exportImage('svg')}
          className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Export SVG
        </button>
      </div>

      <div ref={wrapperRef} className="flex-1 overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => renameNode(node.id, String(node.data.label ?? ''))}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}

export function DiagramEditor({ pageId }: { pageId: string }) {
  const { data: canvas, isLoading } = useQuery({
    queryKey: ['canvas', pageId],
    queryFn: () => api.getCanvas(pageId),
  });

  if (isLoading || !canvas) {
    return <div className="p-10 text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  }

  const { nodes, edges } = canvasToFlow(canvas);

  return (
    <ReactFlowProvider>
      <DiagramCanvas key={pageId} pageId={pageId} initial={{ nodes, edges, viewport: canvas.viewport ?? undefined }} />
    </ReactFlowProvider>
  );
}
