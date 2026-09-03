'use client';

import { mergeAttributes, Node, type CommandProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useRef, useState } from 'react';

type Align = 'left' | 'center' | 'right';

const MIN_WIDTH_PX = 120;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string }) => ReturnType;
    };
  }
}

/** Image block (§12B.1): resize by dragging a handle, align, caption, full-bleed. */
function ImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const src = (node.attrs.src as string) ?? '';
  const alt = (node.attrs.alt as string) ?? '';
  const width = node.attrs.width as number | null;
  const align: Align = (node.attrs.align as Align) ?? 'center';
  const caption = (node.attrs.caption as string) ?? '';
  const fullBleed = node.attrs.fullBleed === true;

  const [captionDraft, setCaptionDraft] = useState(caption);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const currentWidth = containerRef.current?.querySelector('img')?.getBoundingClientRect().width ?? 400;
    resizing.current = { startX: e.clientX, startWidth: currentWidth };

    const onMove = (moveEvent: PointerEvent) => {
      if (!resizing.current) return;
      const delta = moveEvent.clientX - resizing.current.startX;
      const next = Math.max(MIN_WIDTH_PX, Math.round(resizing.current.startWidth + delta));
      updateAttributes({ width: next });
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const justify = fullBleed ? 'stretch' : align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  return (
    <NodeViewWrapper
      className={`group my-2 ${fullBleed ? '-mx-16' : ''}`}
      contentEditable={false}
    >
      <div ref={containerRef} className="relative flex flex-col" style={{ alignItems: justify }}>
        {selected && (
          <div className="mb-1 flex gap-1 rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            {(['left', 'center', 'right'] as Align[]).map((a) => (
              <button
                key={a}
                onClick={() => updateAttributes({ align: a, fullBleed: false })}
                className={`rounded px-1.5 py-0.5 ${
                  !fullBleed && align === a ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {a === 'left' ? '⇤' : a === 'right' ? '⇥' : '↔'}
              </button>
            ))}
            <button
              onClick={() => updateAttributes({ fullBleed: !fullBleed })}
              className={`rounded px-1.5 py-0.5 ${
                fullBleed ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              Full-bleed
            </button>
          </div>
        )}

        <div className="relative inline-block" style={{ width: fullBleed ? '100%' : (width ?? undefined) }}>
          <img
            src={src}
            alt={alt}
            className={`block rounded ${selected ? 'ring-2 ring-zinc-400 dark:ring-zinc-500' : ''}`}
            style={{ width: '100%', height: 'auto' }}
          />
          {selected && !fullBleed && (
            <div
              onPointerDown={startResize}
              className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
            >
              <div className="absolute right-0 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
            </div>
          )}
        </div>

        <input
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          onBlur={() => updateAttributes({ caption: captionDraft })}
          placeholder="Add a caption…"
          className="mt-1 w-full max-w-full bg-transparent text-center text-sm text-zinc-500 outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
          style={{ width: fullBleed ? '100%' : (width ?? undefined) }}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const ImageBlock = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      width: { default: null },
      align: { default: 'center' },
      caption: { default: '' },
      fullBleed: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  // Kept so existing call sites (`editor.chain().focus().setImage(...)`) don't
  // need to change even though this is now a custom node, not the stock one.
  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string }) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name, attrs: options }),
    };
  },
});
