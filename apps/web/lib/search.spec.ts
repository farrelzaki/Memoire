import { describe, expect, it } from 'vitest';
import { parseSnippet, SNIPPET_MATCH_END, SNIPPET_MATCH_START } from './search';

describe('parseSnippet', () => {
  it('returns a single unmatched segment for plain text', () => {
    expect(parseSnippet('hello world')).toEqual([{ text: 'hello world', matched: false }]);
  });

  it('splits a single matched term', () => {
    const snippet = `hello ${SNIPPET_MATCH_START}world${SNIPPET_MATCH_END}`;
    expect(parseSnippet(snippet)).toEqual([
      { text: 'hello ', matched: false },
      { text: 'world', matched: true },
    ]);
  });

  it('splits multiple matched terms', () => {
    const snippet = `${SNIPPET_MATCH_START}quantum${SNIPPET_MATCH_END} entanglement ${SNIPPET_MATCH_START}quantum${SNIPPET_MATCH_END}`;
    expect(parseSnippet(snippet)).toEqual([
      { text: 'quantum', matched: true },
      { text: ' entanglement ', matched: false },
      { text: 'quantum', matched: true },
    ]);
  });

  it('handles an empty string', () => {
    expect(parseSnippet('')).toEqual([]);
  });

  it('handles an unterminated match gracefully', () => {
    const snippet = `hello ${SNIPPET_MATCH_START}world`;
    expect(parseSnippet(snippet)).toEqual([
      { text: 'hello ', matched: false },
      { text: 'world', matched: true },
    ]);
  });
});
