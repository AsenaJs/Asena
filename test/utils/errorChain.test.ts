import { describe, expect, test } from 'bun:test';
import { describeCauses, describeErrorChain } from '../../lib/utils/errorChain';

describe('describeErrorChain', () => {
  test('joins the message of every cause', () => {
    const error = new Error('outer', { cause: new Error('middle', { cause: new Error('inner') }) });

    expect(describeErrorChain(error)).toBe('outer: middle: inner');
  });

  test('describes non-Error values', () => {
    expect(describeErrorChain('plain')).toBe('plain');
    expect(describeErrorChain(new Error('outer', { cause: { code: 42 } }))).toBe('outer: { code: 42 }');
    expect(describeErrorChain(undefined)).toBe('undefined');
  });

  test('stops on a cause cycle', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });

    (a as any).cause = b;

    expect(describeErrorChain(a)).toBe('a: b');
  });

  test('stops at a fixed depth', () => {
    let error = new Error('0');

    for (let index = 1; index < 50; index++) error = new Error(String(index), { cause: error });

    expect(describeErrorChain(error).split(': ')).toHaveLength(10);
  });
});

describe('describeCauses', () => {
  test('is empty without a cause', () => {
    expect(describeCauses(new Error('alone'))).toBe('');
    expect(describeCauses('not an error')).toBe('');
  });

  test('lists the causes below the error', () => {
    expect(describeCauses(new Error('outer', { cause: new Error('inner') }))).toBe('\nCaused by: inner');
  });
});
