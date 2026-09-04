import { beforeEach, describe, expect, it } from 'vitest';
import { useNavigationHistoryStore } from './navigation-history';

beforeEach(() => {
  useNavigationHistoryStore.setState({ stack: [], cursor: -1 });
});

describe('useNavigationHistoryStore', () => {
  it('pushes pages onto the stack and tracks the cursor', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('a');
    push('b');
    push('c');
    expect(useNavigationHistoryStore.getState().stack).toEqual(['a', 'b', 'c']);
    expect(useNavigationHistoryStore.getState().canBack()).toBe(true);
    expect(useNavigationHistoryStore.getState().canForward()).toBe(false);
  });

  it('does not push a duplicate re-visit of the current page', () => {
    const { push } = useNavigationHistoryStore.getState();
    push('a');
    push('a');
    expect(useNavigationHistoryStore.getState().stack).toEqual(['a']);
  });

  it('back/forward move the cursor and return the target page id', () => {
    const { push, back, forward } = useNavigationHistoryStore.getState();
    push('a');
    push('b');
    push('c');

    expect(back()).toBe('b');
    expect(back()).toBe('a');
    expect(useNavigationHistoryStore.getState().canBack()).toBe(false);
    expect(back()).toBeNull();

    expect(forward()).toBe('b');
    expect(forward()).toBe('c');
    expect(useNavigationHistoryStore.getState().canForward()).toBe(false);
    expect(forward()).toBeNull();
  });

  it('pushing after going back truncates the forward ("future") tail', () => {
    const { push, back } = useNavigationHistoryStore.getState();
    push('a');
    push('b');
    push('c');
    back(); // cursor now at 'b'

    push('d'); // branches off — 'c' is dropped
    expect(useNavigationHistoryStore.getState().stack).toEqual(['a', 'b', 'd']);
    expect(useNavigationHistoryStore.getState().canForward()).toBe(false);
  });
});
