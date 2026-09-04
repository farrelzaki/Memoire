import type { FormulaAst } from './ast';

const VOLATILE_FUNCTIONS = new Set(['now', 'today']);

/**
 * True if the formula calls `now()`/`today()` anywhere in its tree (§24A.3).
 * A volatile formula's value depends on the clock, not just row data, so it
 * is never materialized into `database_rows.computed` — it's evaluated at
 * read time instead. Determined once, statically, at parse/save time.
 */
export function isVolatile(ast: FormulaAst): boolean {
  switch (ast.type) {
    case 'literal':
    case 'prop':
      return false;
    case 'call':
      return VOLATILE_FUNCTIONS.has(ast.name) || ast.args.some(isVolatile);
    case 'unary':
      return isVolatile(ast.operand);
    case 'binary':
      return isVolatile(ast.left) || isVolatile(ast.right);
    case 'conditional':
      return isVolatile(ast.test) || isVolatile(ast.consequent) || isVolatile(ast.alternate);
    default: {
      const exhaustive: never = ast;
      throw new Error(`Unhandled node type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Every property id a formula reads — used to build the dependency graph (§24A.4). */
export function referencedPropertyIds(ast: FormulaAst): string[] {
  const ids = new Set<string>();
  const walk = (node: FormulaAst): void => {
    if (node.type === 'prop') {
      ids.add(node.propertyId);
      return;
    }
    if (node.type === 'call') {
      node.args.forEach(walk);
      return;
    }
    if (node.type === 'unary') {
      walk(node.operand);
      return;
    }
    if (node.type === 'binary') {
      walk(node.left);
      walk(node.right);
      return;
    }
    if (node.type === 'conditional') {
      walk(node.test);
      walk(node.consequent);
      walk(node.alternate);
    }
  };
  walk(ast);
  return [...ids];
}
