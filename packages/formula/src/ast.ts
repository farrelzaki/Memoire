/**
 * Formula AST (§24A.1). `prop()` nodes hold the property **id**, resolved
 * from the parsed name at parse time — renaming a property never breaks a
 * formula, only the display source (regenerated from the AST) changes.
 */
export type FormulaAst =
  | { type: 'literal'; value: string | number | boolean | null }
  | { type: 'prop'; propertyId: string; propertyName: string }
  | { type: 'call'; name: string; args: FormulaAst[] }
  | { type: 'binary'; op: BinaryOp; left: FormulaAst; right: FormulaAst }
  | { type: 'unary'; op: UnaryOp; operand: FormulaAst }
  | { type: 'conditional'; test: FormulaAst; consequent: FormulaAst; alternate: FormulaAst };

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'and'
  | 'or';

export type UnaryOp = '-' | 'not';

export type FormulaReturnType = 'number' | 'string' | 'boolean' | 'date' | 'unknown';
