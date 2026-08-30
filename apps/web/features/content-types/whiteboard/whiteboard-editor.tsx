'use client';

import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { resolveTheme } from '@/lib/theme';
import { useThemeStore } from '@/stores/theme';

// Excalidraw is client-only (canvas APIs) — load it only in the browser.
const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((m) => m.Excalidraw),
  { ssr: false },
);

function extractZoom(zoom: unknown): number {
  if (typeof zoom === 'number') return zoom;
  if (zoom && typeof zoom === 'object' && 'value' in zoom && typeof (zoom as { value: unknown }).value === 'number') {
    return (zoom as { value: number }).value;
  }
  return 1;
}

export function WhiteboardEditor({ pageId }: { pageId: string }) {
  const { data: canvas, isLoading } = useQuery({
    queryKey: ['canvas', pageId],
    queryFn: () => api.getCanvas(pageId),
  });
  const theme = useThemeStore((s) => s.theme);
  const [isDark, setIsDark] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setIsDark(resolveTheme(theme, mq.matches) === 'dark');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (isLoading || !canvas) {
    return <div className="p-10 text-sm text-zinc-400 dark:text-zinc-500">Loading…</div>;
  }

  const elements = (canvas.elements ?? []) as unknown as never[];

  return (
    <div className="h-[70vh] w-full overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
      <Excalidraw
        initialData={{ elements, scrollToContent: true }}
        theme={isDark ? 'dark' : 'light'}
        onChange={(els, appState) => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            void api.updateCanvas(pageId, {
              elements: els as unknown[],
              viewport: {
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
                zoom: extractZoom(appState.zoom),
              },
            });
          }, 800);
        }}
      />
    </div>
  );
}
