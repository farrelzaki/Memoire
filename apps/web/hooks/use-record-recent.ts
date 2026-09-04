import { useEffect } from 'react';
import { useNavigationHistoryStore } from '@/stores/navigation-history';
import { useRecentsStore } from '@/stores/recents';

/**
 * Records a page visit into both Recents and the back/forward stack, called
 * once from the page-detail route (§16A.3/§16A.4, Sprint 22). Keyed only on
 * `page.id` — re-firing on every autosave-driven title/icon edit would
 * reorder-to-top on every keystroke, which isn't "a visit."
 */
export function useRecordRecent(page: { id: string; title: string; icon: string | null } | undefined): void {
  const record = useRecentsStore((s) => s.record);
  const push = useNavigationHistoryStore((s) => s.push);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on page.id only, see doc comment
  useEffect(() => {
    if (!page) return;
    record(page);
    push(page.id);
  }, [page?.id]);
}
