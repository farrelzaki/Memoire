import { describe, expect, it } from 'vitest';
import { COVER_PRESETS, coverStyle, defaultCover, isGradientCover } from './cover';

describe('isGradientCover', () => {
  it('recognises a preset gradient', () => {
    expect(isGradientCover(COVER_PRESETS[0].value)).toBe(true);
  });

  it('treats an uploaded attachment URL as an image', () => {
    expect(isGradientCover('http://localhost:3001/api/attachments/abc/content')).toBe(false);
  });

  it('ignores leading whitespace', () => {
    expect(isGradientCover('  linear-gradient(135deg, #fff 0%, #000 100%)')).toBe(true);
  });
});

describe('coverStyle', () => {
  it('uses a gradient verbatim', () => {
    const gradient = COVER_PRESETS[1].value;
    expect(coverStyle(gradient)).toEqual({ backgroundImage: gradient });
  });

  it('wraps an image URL, sizes it to cover, and centers vertically by default', () => {
    expect(coverStyle('https://example.com/a.png')).toEqual({
      backgroundImage: 'url("https://example.com/a.png")',
      backgroundSize: 'cover',
      backgroundPosition: 'center 50%',
    });
  });

  it('uses the stored vertical offset when repositioned', () => {
    expect(coverStyle('https://example.com/a.png', { y: 20 }).backgroundPosition).toBe('center 20%');
  });

  it('clamps an out-of-range offset', () => {
    expect(coverStyle('https://example.com/a.png', { y: 150 }).backgroundPosition).toBe('center 100%');
    expect(coverStyle('https://example.com/a.png', { y: -10 }).backgroundPosition).toBe('center 0%');
  });

  it('escapes quotes so a URL cannot break out of the CSS value', () => {
    const style = coverStyle('https://example.com/a".png');
    expect(style.backgroundImage).toBe('url("https://example.com/a\\".png")');
  });

  it('escapes backslashes too', () => {
    expect(coverStyle('a\\b').backgroundImage).toBe('url("a\\\\b")');
  });
});

describe('defaultCover', () => {
  it('always returns one of the presets', () => {
    const values = COVER_PRESETS.map((p) => p.value);
    expect(values).toContain(defaultCover('page-1'));
    expect(values).toContain(defaultCover(''));
  });

  it('is deterministic for the same seed', () => {
    expect(defaultCover('page-abc')).toBe(defaultCover('page-abc'));
  });
});
