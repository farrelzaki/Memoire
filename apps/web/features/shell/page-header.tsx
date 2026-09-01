'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useClickOutside } from '@/hooks/use-click-outside';
import { api, attachmentContentUrl, type UpdatePageInput } from '@/lib/api';
import { COVER_PRESETS, coverStyle, defaultCover } from '@/lib/cover';
import type { Page } from '@/lib/types';
import { EmojiPicker } from './emoji-picker';

/**
 * The page header: cover banner, page icon, and title — the three things that
 * sit above a page's content and identify it everywhere else in the app
 * (sidebar rows, breadcrumbs, search results).
 *
 * "Add icon" / "Add cover" stay hidden until the header is hovered, so a page
 * with neither still opens as a clean title on an empty canvas.
 */
export function PageHeader({
  page,
  onUpdate,
  fullWidth,
}: {
  page: Page;
  onUpdate: (input: UpdatePageInput) => void;
  fullWidth: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [iconOpen, setIconOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);

  useEffect(() => setTitle(page.title), [page.id, page.title]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(page.title); // title is required — snap back rather than clear
      return;
    }
    if (next !== page.title) onUpdate({ title: next });
  };

  const contentWidth = fullWidth ? 'max-w-none px-16' : 'mx-auto max-w-3xl px-8';

  return (
    <header className="group/header">
      {page.coverUrl && (
        <div className="relative h-52 w-full" style={coverStyle(page.coverUrl)}>
          <div className="absolute bottom-3 right-4 flex gap-1 opacity-0 transition group-hover/header:opacity-100">
            <div className="relative">
              <HeaderChip onClick={() => setCoverOpen((v) => !v)}>Change cover</HeaderChip>
              {coverOpen && (
                <CoverPicker
                  pageId={page.id}
                  align="right"
                  onPick={(coverUrl) => {
                    onUpdate({ coverUrl });
                    setCoverOpen(false);
                  }}
                  onClose={() => setCoverOpen(false)}
                />
              )}
            </div>
            <HeaderChip onClick={() => onUpdate({ coverUrl: null })}>Remove</HeaderChip>
          </div>
        </div>
      )}

      <div className={`${contentWidth} ${page.coverUrl ? 'pt-2' : 'pt-16'}`}>
        {/* The icon straddles the cover's lower edge, as in Notion — but only
            pull upward when there is actually an icon to overlap it with,
            otherwise the title gets dragged up against the cover. */}
        <div className={`relative ${page.coverUrl && page.icon ? '-mt-12' : ''}`}>
          {page.icon && (
            <button
              type="button"
              onClick={() => setIconOpen((v) => !v)}
              className="rounded-lg p-1 text-[68px] leading-none transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Change icon"
            >
              {page.icon}
            </button>
          )}
          {iconOpen && (
            <EmojiPicker
              onPick={(icon) => {
                onUpdate({ icon });
                setIconOpen(false);
              }}
              onRemove={() => {
                onUpdate({ icon: null });
                setIconOpen(false);
              }}
              onClose={() => setIconOpen(false)}
            />
          )}
        </div>

        <div className="flex h-7 items-center gap-1 pt-2 opacity-0 transition group-hover/header:opacity-100">
          {!page.icon && (
            <HeaderAction onClick={() => setIconOpen((v) => !v)}>😀 Add icon</HeaderAction>
          )}
          {!page.coverUrl && (
            <div className="relative">
              <HeaderAction onClick={() => setCoverOpen((v) => !v)}>🖼️ Add cover</HeaderAction>
              {coverOpen && (
                <CoverPicker
                  pageId={page.id}
                  onPick={(coverUrl) => {
                    onUpdate({ coverUrl });
                    setCoverOpen(false);
                  }}
                  onClose={() => setCoverOpen(false)}
                  initial={defaultCover(page.id)}
                />
              )}
            </div>
          )}
        </div>

        <TitleInput
          value={title}
          onChange={setTitle}
          onCommit={commitTitle}
          pageId={page.id}
        />
      </div>
    </header>
  );
}

/**
 * Auto-growing title. A textarea rather than an input so long titles wrap the
 * way they do on the page itself instead of scrolling sideways.
 */
function TitleInput({
  value,
  onChange,
  onCommit,
  pageId,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  pageId: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, pageId]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        // Enter commits and moves on; the title is a single field, not a block.
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      placeholder="Untitled"
      spellCheck={false}
      className="mt-1 w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-tight text-zinc-900 outline-none placeholder:text-zinc-300 dark:text-zinc-100 dark:placeholder:text-zinc-700"
    />
  );
}

function CoverPicker({
  pageId,
  onPick,
  onClose,
  align = 'left',
  initial,
}: {
  pageId: string;
  onPick: (coverUrl: string) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  initial?: string;
}) {
  const ref = useClickOutside<HTMLDivElement>(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await api.uploadAttachment(file, pageId);
      onPick(attachmentContentUrl(attachment.id));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {COVER_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            title={preset.name}
            onClick={() => onPick(preset.value)}
            style={{ backgroundImage: preset.value }}
            className={`h-10 rounded ring-offset-1 transition hover:ring-2 hover:ring-zinc-400 dark:ring-offset-zinc-800 ${
              initial === preset.value ? 'ring-2 ring-zinc-400' : ''
            }`}
          />
        ))}
      </div>

      <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          {uploading ? 'Uploading…' : '⬆️ Upload image'}
        </button>
      </div>
    </div>
  );
}

function HeaderAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function HeaderChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded bg-white/90 px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}
