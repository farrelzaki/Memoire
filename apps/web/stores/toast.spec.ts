import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, toastWithUndo, useToastStore } from './toast';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe('useToastStore', () => {
  it('show() appends a toast and returns its id', () => {
    const id = useToastStore.getState().show({ title: 'Saved' });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].id).toBe(id);
  });

  it('dismiss() removes only the matching toast', () => {
    const a = useToastStore.getState().show({ title: 'A' });
    const b = useToastStore.getState().show({ title: 'B' });
    useToastStore.getState().dismiss(a);
    const remaining = useToastStore.getState().toasts;
    expect(remaining.map((t) => t.id)).toEqual([b]);
  });

  it('each toast gets a unique id', () => {
    const a = useToastStore.getState().show({ title: 'A' });
    const b = useToastStore.getState().show({ title: 'B' });
    expect(a).not.toBe(b);
  });
});

describe('toast()', () => {
  it('pushes into the store without needing the hook', () => {
    toast({ description: 'Copied link' });
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});

describe('toastWithUndo()', () => {
  it('attaches an "Urungkan" action that calls the undo handler', () => {
    const onUndo = vi.fn();
    toastWithUndo('Page archived', onUndo);

    const entry = useToastStore.getState().toasts[0];
    expect(entry.action?.label).toBe('Urungkan');

    entry.action?.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
