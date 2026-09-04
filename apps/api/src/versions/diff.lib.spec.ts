import { describe, expect, it } from 'vitest';
import type { VersionBlockSnapshot } from '../db/schema';
import { diffBlocks, diffWords } from './diff.lib';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const block = (id: string, text: string, position: number): VersionBlockSnapshot => ({
  id,
  type: 'paragraph',
  content: paragraph(text),
  position,
});

describe('diffBlocks', () => {
  it('classifies a new block as added', () => {
    const entries = diffBlocks([], [block('a', 'hello', 0)]);
    expect(entries).toEqual([{ blockId: 'a', status: 'added', type: 'paragraph', oldPosition: null, newPosition: 0 }]);
  });

  it('classifies a missing block as removed', () => {
    const entries = diffBlocks([block('a', 'hello', 0)], []);
    expect(entries).toEqual([{ blockId: 'a', status: 'removed', type: 'paragraph', oldPosition: 0, newPosition: null }]);
  });

  it('classifies same content, different position as moved (no wordDiff)', () => {
    const entries = diffBlocks([block('a', 'hello', 0)], [block('a', 'hello', 1)]);
    expect(entries).toEqual([{ blockId: 'a', status: 'moved', type: 'paragraph', oldPosition: 0, newPosition: 1 }]);
  });

  it('classifies changed content as changed with a wordDiff, even at the same position', () => {
    const entries = diffBlocks([block('a', 'hello world', 0)], [block('a', 'hello there', 0)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('changed');
    expect(entries[0].wordDiff).toBeDefined();
  });

  it('omits unchanged blocks entirely', () => {
    const entries = diffBlocks([block('a', 'same', 0)], [block('a', 'same', 0)]);
    expect(entries).toEqual([]);
  });

  it('handles a mixed set of added/removed/changed/moved in one diff', () => {
    const oldBlocks = [block('a', 'alpha', 0), block('b', 'beta', 1), block('c', 'gamma', 2)];
    const newBlocks = [block('a', 'alpha', 0), block('c', 'gamma', 1), block('d', 'delta', 2)];
    const entries = diffBlocks(oldBlocks, newBlocks);
    const byId = Object.fromEntries(entries.map((e) => [e.blockId, e.status]));
    expect(byId).toEqual({ b: 'removed', c: 'moved', d: 'added' });
  });
});

describe('diffWords', () => {
  it('produces all-equal tokens for identical text', () => {
    const tokens = diffWords('hello world', 'hello world');
    expect(tokens.every((t) => t.op === 'equal')).toBe(true);
  });

  it('produces insert-only tokens when text is purely appended', () => {
    const tokens = diffWords('hello', 'hello world');
    const ops = tokens.map((t) => t.op);
    expect(ops).toContain('equal');
    expect(ops).toContain('insert');
    expect(ops).not.toContain('delete');
  });

  it('produces delete-only tokens when text is purely removed', () => {
    const tokens = diffWords('hello world', 'hello');
    const ops = tokens.map((t) => t.op);
    expect(ops).toContain('equal');
    expect(ops).toContain('delete');
    expect(ops).not.toContain('insert');
  });

  it('produces both insert and delete tokens for a substitution', () => {
    const tokens = diffWords('hello world', 'hello there');
    const ops = tokens.map((t) => t.op);
    expect(ops).toContain('insert');
    expect(ops).toContain('delete');
  });

  it('reconstructs the new text by concatenating equal+insert tokens', () => {
    const tokens = diffWords('the quick fox', 'the quick brown fox');
    const reconstructed = tokens
      .filter((t) => t.op !== 'delete')
      .map((t) => t.text)
      .join('');
    expect(reconstructed).toBe('the quick brown fox');
  });
});
