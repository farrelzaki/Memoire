export type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'punct'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const PUNCT_2 = ['!=', '>=', '<='];
const PUNCT_1 = ['+', '-', '*', '/', '%', '=', '>', '<', '?', ':', '(', ')', ','];

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    public readonly pos: number,
  ) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

/** Tokenizes a formula source string (§24A.1). Throws `FormulaSyntaxError` with a position on bad input. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[a-zA-Z_]/.test(c);
  const isIdentPart = (c: string) => /[a-zA-Z0-9_]/.test(c);

  while (i < source.length) {
    const c = source[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i += 1;
      let value = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
        } else {
          value += source[i];
          i += 1;
        }
      }
      if (i >= source.length) throw new FormulaSyntaxError('Unterminated string', start);
      i += 1; // closing quote
      tokens.push({ type: 'string', value, pos: start });
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i;
      while (i < source.length && isDigit(source[i])) i += 1;
      if (source[i] === '.') {
        i += 1;
        while (i < source.length && isDigit(source[i])) i += 1;
      }
      tokens.push({ type: 'number', value: source.slice(start, i), pos: start });
      continue;
    }

    if (isIdentStart(c)) {
      const start = i;
      while (i < source.length && isIdentPart(source[i])) i += 1;
      tokens.push({ type: 'ident', value: source.slice(start, i), pos: start });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (PUNCT_2.includes(two)) {
      tokens.push({ type: 'punct', value: two, pos: i });
      i += 2;
      continue;
    }

    if (PUNCT_1.includes(c)) {
      tokens.push({ type: 'punct', value: c, pos: i });
      i += 1;
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character '${c}'`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: source.length });
  return tokens;
}
