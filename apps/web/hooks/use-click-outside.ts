'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Close-on-outside-click / Escape for the app's dropdowns and dialogs.
 * Listens on `mousedown` rather than `click` so a menu closes before the
 * element underneath receives the press.
 */
export function useClickOutside<T extends HTMLElement>(
  onClose: () => void,
  enabled = true,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;

    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, enabled]);

  return ref;
}
