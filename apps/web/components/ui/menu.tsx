'use client';

import type { ReactNode } from 'react';
import { useClickOutside } from '@/hooks/use-click-outside';

/**
 * The dropdown shell shared by the sidebar row menu, the page `⋯` menu, and
 * the "New page" type picker, so every menu in the app has the same framing,
 * dismissal behaviour, and dark-mode treatment.
 */
export function Menu({
  onClose,
  children,
  align = 'left',
  className = '',
}: {
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const ref = useClickOutside<HTMLDivElement>(onClose);

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 mt-1 min-w-52 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm disabled:opacity-40 ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700'
      }`}
    >
      {icon && <span className="w-4 shrink-0 text-center text-zinc-400">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-xs text-zinc-400">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-zinc-200 dark:border-zinc-700" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
      {children}
    </div>
  );
}
