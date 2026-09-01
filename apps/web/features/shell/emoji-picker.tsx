'use client';

import { useMemo, useState } from 'react';
import { useClickOutside } from '@/hooks/use-click-outside';

/**
 * Page-icon picker. Deliberately a fixed, curated set rather than a full
 * emoji-data dependency — a page icon only needs to be recognisable at 20px
 * in the sidebar, and this keeps the bundle flat.
 */
const EMOJI_GROUPS: Array<{ name: string; emoji: string[] }> = [
  {
    name: 'Documents',
    emoji: ['📄', '📃', '📑', '📝', '🗒️', '📕', '📗', '📘', '📙', '📚', '📖', '🔖'],
  },
  {
    name: 'Work',
    emoji: ['💼', '📊', '📈', '📉', '🗂️', '📁', '📌', '📎', '✅', '🎯', '🚀', '⚙️'],
  },
  {
    name: 'Objects',
    emoji: ['💡', '🔍', '🔑', '🔒', '⏰', '📅', '🗓️', '☕', '🧠', '🛠️', '🧩', '💾'],
  },
  {
    name: 'Symbols',
    emoji: ['⭐', '🔥', '❤️', '⚡', '🌱', '🌍', '🎨', '🎵', '🏆', '❓', '❗', '♻️'],
  },
];

const ALL_EMOJI = EMOJI_GROUPS.flatMap((group) =>
  group.emoji.map((emoji) => ({ emoji, group: group.name })),
);

export function EmojiPicker({
  onPick,
  onRemove,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useClickOutside<HTMLDivElement>(onClose);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return ALL_EMOJI.filter((item) => item.group.toLowerCase().includes(q));
  }, [query]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          className="min-w-0 flex-1 rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-zinc-400 dark:border-zinc-600"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          Remove
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {results ? (
          <EmojiGrid emoji={results.map((r) => r.emoji)} onPick={onPick} />
        ) : (
          EMOJI_GROUPS.map((group) => (
            <div key={group.name} className="mb-2">
              <div className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {group.name}
              </div>
              <EmojiGrid emoji={group.emoji} onPick={onPick} />
            </div>
          ))
        )}
        {results?.length === 0 && (
          <p className="px-1 py-2 text-sm text-zinc-400">No matching group.</p>
        )}
      </div>
    </div>
  );
}

function EmojiGrid({ emoji, onPick }: { emoji: string[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(item)}
          className="rounded p-1 text-lg leading-none hover:bg-zinc-100 dark:hover:bg-zinc-700"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
