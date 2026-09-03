import { describe, expect, it } from 'vitest';
import { parseOpenGraph } from './link-preview.lib';

describe('parseOpenGraph', () => {
  it('reads Open Graph tags when present', () => {
    const html = `<html><head>
      <title>Fallback Title</title>
      <meta property="og:title" content="OG Title" />
      <meta property="og:description" content="OG Description" />
      <meta property="og:image" content="/images/cover.png" />
      <link rel="icon" href="/favicon.ico" />
    </head><body></body></html>`;

    const result = parseOpenGraph(html, 'https://example.com/article');
    expect(result.title).toBe('OG Title');
    expect(result.description).toBe('OG Description');
    expect(result.imageUrl).toBe('https://example.com/images/cover.png');
    expect(result.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('falls back to <title> and default favicon when OG tags are missing', () => {
    const html = `<html><head><title>Plain Title</title></head><body></body></html>`;
    const result = parseOpenGraph(html, 'https://example.com/page');
    expect(result.title).toBe('Plain Title');
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('never throws on malformed HTML', () => {
    expect(() => parseOpenGraph('<not really html', 'https://example.com')).not.toThrow();
  });
});
