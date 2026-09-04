import type { FormulaAst } from './ast';
import { FUNCTIONS, toNum, toStr, truthy, type FormulaValue, type FunctionContext } from './functions';

export interface EvalContext {
  /** Property id → the row's value for that property (already resolved, e.g. option ids for select). */
  values: Record<string, unknown>;
  now: Date;
}

export interface EvalResult {
  value: FormulaValue;
  error: string | null;
}

/**
 * Evaluates a formula AST against one row's values (§24A). Never throws —
 * any runtime failure (bad function args, unknown function, type coercion
 * failure) becomes `{value: null, error}` so one bad formula can't crash the
 * recompute pipeline for the rest of a database's rows.
 */
export function evaluate(ast: FormulaAst, ctx: EvalContext): EvalResult {
  try {
    return { value: evalNode(ast, ctx), error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function evalNode(node: FormulaAst, ctx: EvalContext): FormulaValue {
  switch (node.type) {
    case 'literal':
      return node.value;

    case 'prop':
      return normalizePropValue(ctx.values[node.propertyId]);

    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function "${node.name}"`);
      const args = node.args.map((a) => evalNode(a, ctx));
      const fnCtx: FunctionContext = { now: ctx.now };
      return fn(args, fnCtx);
    }

    case 'unary': {
      const operand = evalNode(node.operand, ctx);
      return node.op === 'not' ? !truthy(operand) : -toNum(operand);
    }

    case 'binary':
      return evalBinary(node.op, evalNode(node.left, ctx), evalNode(node.right, ctx));

    case 'conditional':
      return truthy(evalNode(node.test, ctx)) ? evalNode(node.consequent, ctx) : evalNode(node.alternate, ctx);

    default: {
      const exhaustive: never = node;
      throw new Error(`Unhandled node type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function normalizePropValue(value: unknown): FormulaValue {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => normalizePropValue(v)) as FormulaValue[];
  if (typeof value === 'object' && value !== null) return toStr(value as unknown as FormulaValue);
  return value as FormulaValue;
}

function evalBinary(op: string, left: FormulaValue, right: FormulaValue): FormulaValue {
  switch (op) {
    case '+':
      return toNum(left) + toNum(right);
    case '-':
      return toNum(left) - toNum(right);
    case '*':
      return toNum(left) * toNum(right);
    case '/': {
      const divisor = toNum(right);
      if (divisor === 0) throw new Error('Division by zero');
      return toNum(left) / divisor;
    }
    case '%':
      return toNum(left) % toNum(right);
    case 'and':
      return truthy(left) && truthy(right);
    case 'or':
      return truthy(left) || truthy(right);
    case '=':
      return looseEquals(left, right);
    case '!=':
      return !looseEquals(left, right);
    case '>':
      return compare(left, right) > 0;
    case '<':
      return compare(left, right) < 0;
    case '>=':
      return compare(left, right) >= 0;
    case '<=':
      return compare(left, right) <= 0;
    default:
      throw new Error(`Unknown operator "${op}"`);
  }
}

function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    try {
      return toNum(a) === toNum(b);
    } catch {
      return false;
    }
  }
  return toStr(a) === toStr(b);
}

function compare(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  try {
    return toNum(a) - toNum(b);
  } catch {
    return toStr(a).localeCompare(toStr(b));
  }
}
