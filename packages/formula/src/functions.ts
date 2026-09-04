import { addDays, addHours, addMinutes, differenceInCalendarDays, format, startOfDay } from 'date-fns';

export type FormulaValue = string | number | boolean | null | FormulaValue[];

export interface FunctionContext {
  /** Evaluation-time clock — every `now()`/`today()` call in one evaluation sees the same instant (§24A.3). */
  now: Date;
}

export type FormulaFunction = (args: FormulaValue[], ctx: FunctionContext) => FormulaValue;

function truthy(v: FormulaValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function toStr(v: FormulaValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(toStr).join(', ');
  return String(v);
}

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Cannot convert ${JSON.stringify(v)} to a number`);
  return n;
}

function toDate(v: FormulaValue): Date {
  if (v instanceof Date) return v;
  const d = new Date(toStr(v));
  if (Number.isNaN(d.getTime())) throw new Error(`Cannot convert ${JSON.stringify(v)} to a date`);
  return d;
}

const DATE_UNIT_ADDERS: Record<string, (date: Date, amount: number) => Date> = {
  days: addDays,
  hours: addHours,
  minutes: addMinutes,
};

/** The function library (§24A.2). Every function is pure given `(args, ctx)` — no ambient clock reads. */
export const FUNCTIONS: Record<string, FormulaFunction> = {
  // Logic
  if: ([cond, a, b]) => (truthy(cond) ? (a ?? null) : (b ?? null)),
  and: (args) => args.every(truthy),
  or: (args) => args.some(truthy),
  not: ([a]) => !truthy(a),
  empty: ([a]) => a === null || a === undefined || a === '' || (Array.isArray(a) && a.length === 0),

  // Text
  concat: (args) => args.map(toStr).join(''),
  join: ([sep, ...rest]) => rest.map(toStr).join(toStr(sep)),
  length: ([a]) => toStr(a).length,
  slice: ([a, start, end]) => toStr(a).slice(toNum(start), end == null ? undefined : toNum(end)),
  contains: ([a, b]) => toStr(a).includes(toStr(b)),
  replace: ([a, pattern, replacement]) => toStr(a).replace(toStr(pattern), toStr(replacement)),
  replaceAll: ([a, pattern, replacement]) => toStr(a).split(toStr(pattern)).join(toStr(replacement)),
  test: ([a, pattern]) => new RegExp(toStr(pattern)).test(toStr(a)),
  lower: ([a]) => toStr(a).toLowerCase(),
  upper: ([a]) => toStr(a).toUpperCase(),
  trim: ([a]) => toStr(a).trim(),
  format: ([a]) => toStr(a),

  // Number
  toNumber: ([a]) => toNum(a),
  round: ([a]) => Math.round(toNum(a)),
  floor: ([a]) => Math.floor(toNum(a)),
  ceil: ([a]) => Math.ceil(toNum(a)),
  abs: ([a]) => Math.abs(toNum(a)),
  sqrt: ([a]) => Math.sqrt(toNum(a)),
  pow: ([a, b]) => Math.pow(toNum(a), toNum(b)),
  min: (args) => Math.min(...args.map(toNum)),
  max: (args) => Math.max(...args.map(toNum)),
  mod: ([a, b]) => toNum(a) % toNum(b),

  // Date — `now`/`today` read the evaluation-time clock, never the system clock directly (§24A.3).
  now: (_args, ctx) => ctx.now.toISOString(),
  today: (_args, ctx) => startOfDay(ctx.now).toISOString(),
  dateAdd: ([a, amount, unit]) => {
    const adder = DATE_UNIT_ADDERS[toStr(unit)];
    if (!adder) throw new Error(`Unknown date unit "${toStr(unit)}"`);
    return adder(toDate(a), toNum(amount)).toISOString();
  },
  dateSubtract: ([a, amount, unit]) => {
    const adder = DATE_UNIT_ADDERS[toStr(unit)];
    if (!adder) throw new Error(`Unknown date unit "${toStr(unit)}"`);
    return adder(toDate(a), -toNum(amount)).toISOString();
  },
  dateBetween: ([a, b]) => differenceInCalendarDays(toDate(a), toDate(b)),
  dateRange: ([a, b]) => Math.abs(differenceInCalendarDays(toDate(a), toDate(b))),
  formatDate: ([a, pattern]) => format(toDate(a), toStr(pattern)),
  timestamp: ([a]) => Math.floor(toDate(a).getTime() / 1000),
  year: ([a]) => toDate(a).getFullYear(),
  month: ([a]) => toDate(a).getMonth() + 1,
  day: ([a]) => toDate(a).getDate(),
  hour: ([a]) => toDate(a).getHours(),
  minute: ([a]) => toDate(a).getMinutes(),
};

export { toDate, toNum, toStr, truthy };
