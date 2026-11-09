import { describe, expect, test } from 'bun:test';
import * as exceptionEntry from '../../../lib/server/exception';

describe('@asenajs/asena/exception entry point', () => {
  test('exports the decorators and nothing that can change the resolution table at runtime', () => {
    expect(Object.keys(exceptionEntry).sort()).toEqual(['Catch', 'NotFound']);
  });
});
