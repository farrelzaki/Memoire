'use client';

import type { Content } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { blocksToDoc, docToBlocks, type TiptapDocument } from '@/lib/blocks';
import type { Block } from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SlashState {
  from: number;
  to: number;
  query: string;
}

interface BlockHandleState {
  pos: number;
  top: number;
  left: number;
}

function detectSlash(editor: Editor): SlashState | null {
  const { $from, empty } = editor.state.selection;
  if (!empty) return null;
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\n');
  const match = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
  if (!match) return null;

  const slashIndex = textBefore.lastIndexOf('/');
  const from = $from.pos - $from.parentOffset + slashIndex;
  return { from, to: $from.pos, query: match[1] };
}

function getBlockHandle(editor: Editor): BlockHandleState | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;

  const pos = $from.before(1);
  try {
    const coords = editor.view.coordsAtPos(pos);
    return { pos, top: coords.top, left: coords.left };
  } catch {
    return null;
  }
}

function DocumentEditor({ pageId }: { pageId: string }) {
  const { data: blocks, isLoading } = useQuery({
    queryKey: ['blocks', pageId],
    queryFn: () => api.listBlocks(pageId),
  });

  if (isLoading || !blocks) {
    return <div className="p-10 text-sm text-zinc-400">Loading…</div>;
  }
  return <EditorInstance key={pageId} pageId={pageId} initialBlocks={blocks} />;
}

function EditorInstance({
  pageId,
  initialBlocks,
}: {
  pageId: string;
  initialBlocks: Block[];
}) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [blockHandle, setBlockHandle] = useState<BlockHandleState | null>(null);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Type '/' for commands" }),
      Image.configure({ allowBase64: true }),
    ],
    content: blocksToDoc(initialBlocks) as unknown as Content,
    onUpdate: ({ editor }) => {
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await api.replaceBlocks(pageId, docToBlocks(editor.getJSON() as unknown as TiptapDocument));
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      }, 800);
    },
    onSelectionUpdate: ({ editor }) => {
      setSlash(detectSlash(editor));
      setBlockHandle(getBlockHandle(editor));
      setBlockMenuOpen(false);
    },
  });

  // Flush pending save on unmount (avoids losing the last keystroke).
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const items = useMemo(
    () => [
      { title: 'Text', hint: 'Paragraph', run: () => editor?.chain().focus().setParagraph().run() },
      { title: 'Heading 1', hint: 'Large', run: () => editor?.chain().focus().setHeading({ level: 1 }).run() },
      { title: 'Heading 2', hint: 'Medium', run: () => editor?.chain().focus().setHeading({ level: 2 }).run() },
      { title: 'Heading 3', hint: 'Small', run: () => editor?.chain().focus().setHeading({ level: 3 }).run() },
      { title: 'Bulleted list', hint: '•', run: () => editor?.chain().focus().toggleBulletList().run() },
      { title: 'Numbered list', hint: '1.', run: () => editor?.chain().focus().toggleOrderedList().run() },
      { title: 'To-do', hint: '☑', run: () => editor?.chain().focus().toggleTaskList().run() },
      { title: 'Quote', hint: '"', run: () => editor?.chain().focus().toggleBlockquote().run() },
      { title: 'Code', hint: '</>', run: () => editor?.chain().focus().toggleCodeBlock().run() },
      { title: 'Divider', hint: '—', run: () => editor?.chain().focus().setHorizontalRule().run() },
      {
        title: 'Image',
        hint: 'URL',
        run: () => {
          const url = window.prompt('Image URL');
          if (url) editor?.chain().focus().setImage({ src: url }).run();
        },
      },
    ],
    [editor],
  );

  const filteredItems = slash
    ? items.filter((item) => item.title.toLowerCase().includes(slash.query.toLowerCase()))
    : [];

  const selectItem = useCallback(
    (run: () => void) => {
      if (!editor || !slash) return;
      editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
      run();
      setSlash(null);
    },
    [editor, slash],
  );

  const duplicateBlock = useCallback(() => {
    if (!editor || !blockHandle) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(blockHandle.pos);
        if (!node) return false;
        tr.insert(blockHandle.pos + node.nodeSize, node.copy());
        return true;
      })
      .run();
    setBlockMenuOpen(false);
  }, [editor, blockHandle]);

  const deleteBlock = useCallback(() => {
    if (!editor || !blockHandle) return;
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(blockHandle.pos);
        if (!node) return false;
        tr.delete(blockHandle.pos, blockHandle.pos + node.nodeSize);
        return true;
      })
      .run();
    setBlockMenuOpen(false);
  }, [editor, blockHandle]);

  if (!editor) return null;

  return (
    <div className="relative">
      <SaveStatus state={saveState} />

      <EditorContent editor={editor} />

      {slash && filteredItems.length > 0 && (
        <SlashMenu items={filteredItems} slash={slash} editor={editor} onSelect={selectItem} onClose={() => setSlash(null)} />
      )}

      {blockHandle && (
        <BlockHandle
          handle={blockHandle}
          open={blockMenuOpen}
          onToggle={() => setBlockMenuOpen((v) => !v)}
          onDelete={deleteBlock}
          onDuplicate={duplicateBlock}
          onTurnInto={selectItem}
          items={items}
        />
      )}
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Failed to save';
  const color =
    state === 'error' ? 'text-red-500' : 'text-zinc-400';
  return <div className={`absolute -top-6 right-0 text-xs ${color}`}>{label}</div>;
}

function SlashMenu({
  items,
  slash,
  editor,
  onSelect,
  onClose,
}: {
  items: Array<{ title: string; hint: string; run: () => void }>;
  slash: SlashState;
  editor: Editor;
  onSelect: (run: () => void) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);

  const coords = (() => {
    try {
      return editor.view.coordsAtPos(slash.from);
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(items[index]?.run ?? (() => {}));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, index, onSelect, onClose]);

  return (
    <div
      className="fixed z-50 max-h-72 w-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
      style={coords ? { top: coords.top + 20, left: coords.left } : { top: 0, left: 0 }}
    >
      {items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(item.run)}
          onMouseEnter={() => setIndex(i)}
          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
            i === index ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600'
          }`}
        >
          <span>{item.title}</span>
          <span className="text-xs text-zinc-400">{item.hint}</span>
        </button>
      ))}
    </div>
  );
}

function BlockHandle({
  handle,
  open,
  onToggle,
  onDelete,
  onDuplicate,
  onTurnInto,
  items,
}: {
  handle: BlockHandleState;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTurnInto: (run: () => void) => void;
  items: Array<{ title: string; hint: string; run: () => void }>;
}) {
  return (
    <>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className="absolute z-40 -ml-8 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
        style={{ top: handle.top - 60, left: handle.left - 28 }}
        title="Block menu"
      >
        ⋮⋮
      </button>

      {open && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
          style={{ top: handle.top - 20, left: handle.left - 24 }}
        >
          {items.slice(0, 5).map((item) => (
            <button
              key={item.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onTurnInto(item.run)}
              className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100"
            >
              {item.title}
            </button>
          ))}
          <div className="my-1 border-t border-zinc-200" />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDuplicate}
            className="block w-full rounded px-2 py-1 text-left text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Duplicate
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            className="block w-full rounded px-2 py-1 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

export { DocumentEditor };
