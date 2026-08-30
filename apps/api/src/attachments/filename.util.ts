/** Strip any path components and return the final segment. */
export function basename(filename: string): string {
  return filename.split(/[\\/]/).pop() ?? 'file';
}

/** Lowercased file extension without the dot ('' when absent). */
export function extractExtension(filename: string): string {
  const clean = basename(filename);
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

/** Replace anything that isn't safe in a filename (§28). */
export function sanitizeFilename(filename: string): string {
  const clean = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  return (clean || 'file').slice(0, 200);
}
