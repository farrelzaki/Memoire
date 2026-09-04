/**
 * `\x01`/`\x02` (SOH/STX) mark matched terms in a `GET /search` snippet — the
 * backend's `ts_headline` delimiter choice (`apps/api/src/search/search-query.lib.ts`),
 * picked specifically so the frontend can split on them and render `<mark>`
 * via plain JSX instead of `dangerouslySetInnerHTML`.
 */
export const SNIPPET_MATCH_START = '\x01';
export const SNIPPET_MATCH_END = '\x02';

export interface SnippetSegment {
  text: string;
  matched: boolean;
}

/** Splits a snippet into plain/matched segments for `<mark>`-wrapped rendering. */
export function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let cursor = 0;
  while (cursor < snippet.length) {
    const start = snippet.indexOf(SNIPPET_MATCH_START, cursor);
    if (start === -1) {
      segments.push({ text: snippet.slice(cursor), matched: false });
      break;
    }
    if (start > cursor) segments.push({ text: snippet.slice(cursor, start), matched: false });
    const end = snippet.indexOf(SNIPPET_MATCH_END, start + 1);
    if (end === -1) {
      segments.push({ text: snippet.slice(start + 1), matched: true });
      break;
    }
    segments.push({ text: snippet.slice(start + 1, end), matched: true });
    cursor = end + 1;
  }
  return segments;
}
