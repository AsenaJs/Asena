import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// This repo compiles with `strict: false`, where `undefined` fits every type, so a declining
// handler is only an error for the strict consumers (adapters, applications) the types are for.
describe('ErrorHandler / NotFoundHandler', () => {
  test('a strict consumer declines by returning nothing, with no cast', () => {
    const result = Bun.spawnSync([process.execPath, join(import.meta.dir, 'fixtures', 'strictHandlerTypes.ts')]);

    expect(result.stderr.toString()).toBe('');
    expect(JSON.parse(result.stdout.toString())).toEqual([]);
  }, 30_000);
});
