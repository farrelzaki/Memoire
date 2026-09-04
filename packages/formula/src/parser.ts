import type { BinaryOp, FormulaAst } from './ast';
import { FormulaSyntaxError, tokenize, type Token } from './tokenizer';

const COMPARISON_OPS = new Set(['=', '!=', '>', '<', '>=', '<=']);
const ADDITIVE_OPS = new Set(['+', '-']);
const MULTIPLICATIVE_OPS = new Set(['*', '/', '%']);

/**
 * Precedence-climbing (operator-precedence / "Pratt") parser (§24A.1).
 * `resolvePropName` maps a `prop("Name")` argument to a property id — thrown
 * as a `FormulaSyntaxError` if the name doesn't exist on this database, so a
 * typo is caught at save time, not silently evaluated as `null` forever.
 */
export function parseFormula(source: string, resolvePropName: (name: string) => string | undefined): FormulaAst {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token => tokens[pos];
  const advance = (): Token => tokens[pos++];
  const expectPunct = (value: string): void => {
    if (peek().value !== value) {
      throw new FormulaSyntaxError(`Expected '${value}'`, peek().pos);
    }
    advance();
  };

  function parseTernary(): FormulaAst {
    const test = parseOr();
    if (peek().value === '?') {
      advance();
      const consequent = parseTernary();
      expectPunct(':');
      const alternate = parseTernary();
      return { type: 'conditional', test, consequent, alternate };
    }
    return test;
  }

  function parseOr(): FormulaAst {
    let left = parseAnd();
    while (peek().type === 'ident' && peek().value === 'or') {
      advance();
      left = { type: 'binary', op: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): FormulaAst {
    let left = parseNot();
    while (peek().type === 'ident' && peek().value === 'and') {
      advance();
      left = { type: 'binary', op: 'and', left, right: parseNot() };
    }
    return left;
  }

  function parseNot(): FormulaAst {
    if (peek().type === 'ident' && peek().value === 'not') {
      advance();
      return { type: 'unary', op: 'not', operand: parseNot() };
    }
    return parseComparison();
  }

  function parseComparison(): FormulaAst {
    let left = parseAdditive();
    while (peek().type === 'punct' && COMPARISON_OPS.has(peek().value)) {
      const op = advance().value as BinaryOp;
      left = { type: 'binary', op, left, right: parseAdditive() };
    }
    return left;
  }

  function parseAdditive(): FormulaAst {
    let left = parseMultiplicative();
    while (peek().type === 'punct' && ADDITIVE_OPS.has(peek().value)) {
      const op = advance().value as BinaryOp;
      left = { type: 'binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative(): FormulaAst {
    let left = parseUnary();
    while (peek().type === 'punct' && MULTIPLICATIVE_OPS.has(peek().value)) {
      const op = advance().value as BinaryOp;
      left = { type: 'binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): FormulaAst {
    if (peek().type === 'punct' && peek().value === '-') {
      advance();
      return { type: 'unary', op: '-', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): FormulaAst {
    const tok = peek();

    if (tok.type === 'number') {
      advance();
      return { type: 'literal', value: Number(tok.value) };
    }

    if (tok.type === 'string') {
      advance();
      return { type: 'literal', value: tok.value };
    }

    if (tok.type === 'punct' && tok.value === '(') {
      advance();
      const inner = parseTernary();
      expectPunct(')');
      return inner;
    }

    if (tok.type === 'ident') {
      if (tok.value === 'true' || tok.value === 'false') {
        advance();
        return { type: 'literal', value: tok.value === 'true' };
      }
      if (tok.value === 'null') {
        advance();
        return { type: 'literal', value: null };
      }

      advance();
      if (peek().type === 'punct' && peek().value === '(') {
        return parseCall(tok);
      }
      throw new FormulaSyntaxError(`Unexpected identifier '${tok.value}' — did you mean prop("${tok.value}")?`, tok.pos);
    }

    throw new FormulaSyntaxError(`Unexpected token '${tok.value || 'end of formula'}'`, tok.pos);
  }

  function parseCall(nameToken: Token): FormulaAst {
    expectPunct('(');
    const args: FormulaAst[] = [];
    if (!(peek().type === 'punct' && peek().value === ')')) {
      args.push(parseTernary());
      while (peek().type === 'punct' && peek().value === ',') {
        advance();
        args.push(parseTernary());
      }
    }
    expectPunct(')');

    if (nameToken.value === 'prop') {
      const arg = args[0];
      if (args.length !== 1 || arg.type !== 'literal' || typeof arg.value !== 'string') {
        throw new FormulaSyntaxError('prop() takes exactly one string argument', nameToken.pos);
      }
      const propertyId = resolvePropName(arg.value);
      if (!propertyId) {
        throw new FormulaSyntaxError(`No property named "${arg.value}"`, nameToken.pos);
      }
      return { type: 'prop', propertyId, propertyName: arg.value };
    }

    return { type: 'call', name: nameToken.value, args };
  }

  const result = parseTernary();
  if (peek().type !== 'eof') {
    throw new FormulaSyntaxError(`Unexpected token '${peek().value}'`, peek().pos);
  }
  return result;
}
