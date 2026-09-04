import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluator';
import { parseFormula } from './parser';

const NOW = new Date('2026-03-15T12:30:00.000Z');

function run(source: string, values: Record<string, unknown> = {}, resolve: (name: string) => string | undefined = () => undefined) {
  const ast = parseFormula(source, resolve);
  return evaluate(ast, { values, now: NOW });
}

describe('evaluate — arithmetic & comparison', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(run('1 + 2 * 3').value).toBe(7);
  });

  it('evaluates comparisons', () => {
    expect(run('5 > 3').value).toBe(true);
    expect(run('5 = 5').value).toBe(true);
    expect(run('"a" != "b"').value).toBe(true);
  });

  it('errors on division by zero instead of returning Infinity', () => {
    const result = run('1 / 0');
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/division by zero/i);
  });

  it('evaluates a ternary conditional', () => {
    expect(run('true ? "yes" : "no"').value).toBe('yes');
    expect(run('false ? "yes" : "no"').value).toBe('no');
  });
});

describe('evaluate — prop() resolution', () => {
  it('reads a property value by resolved id', () => {
    const resolve = (name: string) => ({ Price: 'p1', Qty: 'p2' })[name];
    const result = run('prop("Price") * prop("Qty")', { p1: 10, p2: 3 }, resolve);
    expect(result.value).toBe(30);
  });

  it('treats a missing property value as null', () => {
    const resolve = () => 'p1';
    const result = run('empty(prop("X"))', {}, resolve);
    expect(result.value).toBe(true);
  });
});

describe('evaluate — logic functions', () => {
  it('if/and/or/not/empty', () => {
    expect(run('if(true, 1, 2)').value).toBe(1);
    expect(run('and(true, false)').value).toBe(false);
    expect(run('or(false, true)').value).toBe(true);
    expect(run('not(false)').value).toBe(true);
    expect(run('empty("")').value).toBe(true);
    expect(run('empty("x")').value).toBe(false);
  });
});

describe('evaluate — text functions', () => {
  it('concat/join/length/slice/contains/replace/replaceAll/test/lower/upper/trim', () => {
    expect(run('concat("a", "b", "c")').value).toBe('abc');
    expect(run('join(", ", "a", "b")').value).toBe('a, b');
    expect(run('length("hello")').value).toBe(5);
    expect(run('slice("hello", 1, 3)').value).toBe('el');
    expect(run('contains("hello", "ell")').value).toBe(true);
    expect(run('replace("hello", "l", "L")').value).toBe('heLlo');
    expect(run('replaceAll("hello", "l", "L")').value).toBe('heLLo');
    expect(run('test("hello", "^h")').value).toBe(true);
    expect(run('lower("HI")').value).toBe('hi');
    expect(run('upper("hi")').value).toBe('HI');
    expect(run('trim("  hi  ")').value).toBe('hi');
  });
});

describe('evaluate — number functions', () => {
  it('toNumber/round/floor/ceil/abs/sqrt/pow/min/max/mod', () => {
    expect(run('toNumber("42")').value).toBe(42);
    expect(run('round(1.5)').value).toBe(2);
    expect(run('floor(1.9)').value).toBe(1);
    expect(run('ceil(1.1)').value).toBe(2);
    expect(run('abs(-5)').value).toBe(5);
    expect(run('sqrt(9)').value).toBe(3);
    expect(run('pow(2, 3)').value).toBe(8);
    expect(run('min(3, 1, 2)').value).toBe(1);
    expect(run('max(3, 1, 2)').value).toBe(3);
    expect(run('mod(7, 3)').value).toBe(1);
  });
});

describe('evaluate — date functions', () => {
  it('now/today read the evaluation clock, not the system clock', () => {
    expect(run('now()').value).toBe(NOW.toISOString());
    expect(run('today()').value).toBe(new Date(2026, 2, 15).toISOString());
  });

  it('dateAdd/dateSubtract/dateBetween/dateRange', () => {
    expect(run('dateAdd("2026-01-01T00:00:00.000Z", 5, "days")').value).toBe('2026-01-06T00:00:00.000Z');
    expect(run('dateSubtract("2026-01-06T00:00:00.000Z", 5, "days")').value).toBe('2026-01-01T00:00:00.000Z');
    expect(run('dateBetween("2026-01-10T00:00:00.000Z", "2026-01-01T00:00:00.000Z")').value).toBe(9);
    expect(run('dateRange("2026-01-01T00:00:00.000Z", "2026-01-10T00:00:00.000Z")').value).toBe(9);
  });

  it('year/month/day/hour/minute extract components', () => {
    const d = '"2026-03-15T12:30:00.000Z"';
    expect(run(`year(${d})`).value).toBe(2026);
    expect(run(`month(${d})`).value).toBe(3);
    expect(run(`day(${d})`).value).toBe(15);
  });
});

describe('evaluate — error handling', () => {
  it('never throws — an unknown function becomes a result error', () => {
    const result = run('bogus(1)');
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/unknown function/i);
  });

  it('a type coercion failure becomes a result error, not a crash', () => {
    const result = run('toNumber("not a number")');
    expect(result.value).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
