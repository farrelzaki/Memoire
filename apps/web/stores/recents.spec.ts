import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentsStore } from './recents';

beforeEach(() => {
  useRecentsStore.setState({ entries: [] });
});

describe('useRecentsStore', () => {
  it('records a visit at the front of the list', () => {
    useRecentsStore.getState().record({ id: 'a', title: 'Alpha', icon: '📄' });
    const entries = useRecentsStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'a', title: 'Alpha', icon: '📄' });
  });

  it('moves a re-visited page to the front instead of duplicating it', () => {
    const { record } = useRecentsStore.getState();
    record({ id: 'a', title: 'Alpha', icon: null });
    record({ id: 'b', title: 'Beta', icon: null });
    record({ id: 'a', title: 'Alpha (renamed)', icon: null });

    const entries = useRecentsStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'a', title: 'Alpha (renamed)' });
    expect(entries[1]).toMatchObject({ id: 'b' });
  });

  it('caps the list at 15 entries', () => {
    const { record } = useRecentsStore.getState();
    for (let i = 0; i < 20; i++) record({ id: `p${i}`, title: `Page ${i}`, icon: null });

    const entries = useRecentsStore.getState().entries;
    expect(entries).toHaveLength(15);
    expect(entries[0].id).toBe('p19'); // most recent first
    expect(entries[14].id).toBe('p5'); // oldest surviving entry
  });
});
