/**
 * Sprint 16 (§12A.1): the fixed token palette text-color/highlight marks are
 * allowed to use. Values are `hsl(var(--mark-...))` CSS strings, never a raw
 * hex — that's what lets a color chosen in light mode stay legible after
 * switching to dark (see `app/globals.css`). The UI only ever offers these
 * swatches; there is no free-form color picker.
 */
export interface MarkColor {
  name: string;
  label: string;
  fg: string;
  bg: string;
}

export const MARK_COLORS: MarkColor[] = [
  { name: 'gray', label: 'Gray', fg: 'hsl(var(--mark-fg-gray))', bg: 'hsl(var(--mark-bg-gray))' },
  { name: 'red', label: 'Red', fg: 'hsl(var(--mark-fg-red))', bg: 'hsl(var(--mark-bg-red))' },
  { name: 'orange', label: 'Orange', fg: 'hsl(var(--mark-fg-orange))', bg: 'hsl(var(--mark-bg-orange))' },
  { name: 'yellow', label: 'Yellow', fg: 'hsl(var(--mark-fg-yellow))', bg: 'hsl(var(--mark-bg-yellow))' },
  { name: 'green', label: 'Green', fg: 'hsl(var(--mark-fg-green))', bg: 'hsl(var(--mark-bg-green))' },
  { name: 'blue', label: 'Blue', fg: 'hsl(var(--mark-fg-blue))', bg: 'hsl(var(--mark-bg-blue))' },
  { name: 'purple', label: 'Purple', fg: 'hsl(var(--mark-fg-purple))', bg: 'hsl(var(--mark-bg-purple))' },
  { name: 'pink', label: 'Pink', fg: 'hsl(var(--mark-fg-pink))', bg: 'hsl(var(--mark-bg-pink))' },
];
