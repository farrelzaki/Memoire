import { describe, expect, it } from 'vitest';
import { guessColumnType, parseCsv } from './csv-parser.lib';

describe('parseCsv', () => {
  it('parses a simple header + rows document', () => {
    expect(parseCsv('Name,Age\nAlice,30\nBob,25')).toEqual([
      ['Name', 'Age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
  });

  it('unquotes a quoted field with an embedded comma', () => {
    expect(parseCsv('Name,Note\nAlice,"hello, world"')).toEqual([
      ['Name', 'Note'],
      ['Alice', 'hello, world'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsv('Name\n"She said ""hi"""')).toEqual([['Name'], ['She said "hi"']]);
  });

  it('preserves an embedded newline inside a quoted field', () => {
    expect(parseCsv('Name,Note\nAlice,"line one\nline two"')).toEqual([
      ['Name', 'Note'],
      ['Alice', 'line one\nline two'],
    ]);
  });

  it('handles a trailing empty field', () => {
    expect(parseCsv('A,B,\n1,2,')).toEqual([
      ['A', 'B', ''],
      ['1', '2', ''],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('A,B\r\n1,2')).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });

  it('returns an empty array for an empty document', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('guessColumnType', () => {
  it('guesses number for all-numeric values', () => {
    expect(guessColumnType(['1', '2.5', '-3'])).toBe('number');
  });

  it('guesses date for ISO-date-like values', () => {
    expect(guessColumnType(['2026-01-01', '2026-12-31'])).toBe('date');
  });

  it('guesses checkbox for true/false values', () => {
    expect(guessColumnType(['true', 'FALSE', 'True'])).toBe('checkbox');
  });

  it('falls back to text for mixed or non-matching values', () => {
    expect(guessColumnType(['hello', 'world'])).toBe('text');
    expect(guessColumnType(['1', 'not a number'])).toBe('text');
  });

  it('ignores empty cells when guessing', () => {
    expect(guessColumnType(['1', '', '2', ''])).toBe('number');
  });

  it('falls back to text when every value is empty', () => {
    expect(guessColumnType(['', '', ''])).toBe('text');
  });

  it('does not treat a plain word as a date', () => {
    expect(guessColumnType(['someday', 'another day'])).toBe('text');
  });
});
