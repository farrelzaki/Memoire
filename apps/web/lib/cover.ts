/**
 * Page cover handling.
 *
 * `pages.cover_url` is a plain text column, so it holds either an uploaded
 * attachment URL or a CSS gradient string. Keeping gradients inline means the
 * built-in cover choices need no image hosting, no external requests, and no
 * extra column — and they stay crisp at any window width.
 */

export interface CoverPreset {
  name: string;
  value: string;
}

export const COVER_PRESETS: CoverPreset[] = [
  { name: 'Slate', value: 'linear-gradient(135deg, #64748b 0%, #334155 100%)' },
  { name: 'Ember', value: 'linear-gradient(135deg, #fb923c 0%, #b91c1c 100%)' },
  { name: 'Meadow', value: 'linear-gradient(135deg, #4ade80 0%, #15803d 100%)' },
  { name: 'Tide', value: 'linear-gradient(135deg, #38bdf8 0%, #1e3a8a 100%)' },
  { name: 'Orchid', value: 'linear-gradient(135deg, #c084fc 0%, #6d28d9 100%)' },
  { name: 'Sand', value: 'linear-gradient(135deg, #fde68a 0%, #b45309 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #fda4af 0%, #9f1239 100%)' },
  { name: 'Ink', value: 'linear-gradient(135deg, #52525b 0%, #18181b 100%)' },
];

/** True when the stored cover is a CSS gradient rather than an image URL. */
export function isGradientCover(coverUrl: string): boolean {
  return coverUrl.trimStart().startsWith('linear-gradient(');
}

/**
 * Inline style for the cover banner. Gradients are used verbatim; anything
 * else is treated as an image URL and wrapped in `url(...)`, with quotes
 * escaped so a URL can't break out of the CSS value.
 */
export function coverStyle(coverUrl: string): { backgroundImage: string; backgroundSize?: string; backgroundPosition?: string } {
  if (isGradientCover(coverUrl)) {
    return { backgroundImage: coverUrl };
  }
  const safe = coverUrl.replace(/["\\]/g, '\\$&');
  return {
    backgroundImage: `url("${safe}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/** A deterministic preset for "Add cover", so a new cover is never a blank bar. */
export function defaultCover(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return COVER_PRESETS[hash % COVER_PRESETS.length].value;
}
