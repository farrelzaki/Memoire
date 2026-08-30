import { describe, expect, it } from 'vitest';
import { basename, extractExtension, sanitizeFilename } from './filename.util';

describe('filename utils', () => {
  it('basename strips path components', () => {
    expect(basename('C:\\Users\\x\\photo.png')).toBe('photo.png');
    expect(basename('/tmp/notes.md')).toBe('notes.md');
  });

  it('extractExtension lowercases and omits the dot', () => {
    expect(extractExtension('photo.PNG')).toBe('png');
    expect(extractExtension('noext')).toBe('');
    expect(extractExtension('archive.tar.gz')).toBe('gz');
  });

  it('sanitizeFilename removes unsafe characters', () => {
    expect(sanitizeFilename('my report (final).pdf')).toBe('my_report__final_.pdf');
  });
});
