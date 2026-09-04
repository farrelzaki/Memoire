import { useEffect } from 'react';

const HIGHLIGHT_CLASS = 'block-anchor-highlight';
const HIGHLIGHT_MS = 2000;
const MAX_ATTEMPTS = 20;
const RETRY_MS = 100;

/**
 * Scrolls to `#block-<uuid>` on mount/navigation (§25A.5's "lompat ke blok" —
 * a block-level search hit is only useful if landing on the page actually
 * jumps to it). The editor's blocks render asynchronously after the page
 * shell mounts, so the target node may not exist yet on the first check —
 * retries briefly rather than giving up on one missed frame.
 */
export function useScrollToBlockAnchor(pageId: string | undefined): void {
  useEffect(() => {
    if (!pageId) return;
    const match = /^#block-(.+)$/.exec(window.location.hash);
    if (!match) return;
    const blockId = match[1];

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tryScroll = () => {
      const target = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => target.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(tryScroll, RETRY_MS);
      }
    };
    tryScroll();

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on pageId only, re-checks the hash fresh each navigation
  }, [pageId]);
}
