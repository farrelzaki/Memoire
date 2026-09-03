import { describe, expect, it } from 'vitest';
import { formatUniqueId } from './unique-id.lib';

describe('formatUniqueId', () => {
  it('prefixes the sequence number', () => {
    expect(formatUniqueId('TASK-', 14)).toBe('TASK-14');
  });

  it('renders the bare number when there is no prefix', () => {
    expect(formatUniqueId(undefined, 3)).toBe('3');
  });
});
