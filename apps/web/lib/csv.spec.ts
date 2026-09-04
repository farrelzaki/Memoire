import { describe, expect, it } from 'vitest';
import { toCsvDocument } from './csv';

describe('toCsvDocument', () => {
  it('joins a header row and data rows with CRLF', () => {
    expect(toCsvDocument(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']])).toBe(
      'Name,Age\r\nAlice,30\r\nBob,25',
    );
  });

  it('escapes a header containing a comma', () => {
    expect(toCsvDocument(['Name, formal'], [])).toBe('"Name, formal"');
  });

  it('escapes a header containing a quote', () => {
    expect(toCsvDocument(['"Nickname"'], [])).toBe('"""Nickname"""');
  });

  it('escapes a header containing a newline', () => {
    expect(toCsvDocument(['Multi\nline'], [])).toBe('"Multi\nline"');
  });

  it('does not re-escape data rows (already escaped by toCsv)', () => {
    expect(toCsvDocument(['Name'], [['"already, escaped"']])).toBe('Name\r\n"already, escaped"');
  });

  it('handles no rows', () => {
    expect(toCsvDocument(['Name'], [])).toBe('Name');
  });
});
