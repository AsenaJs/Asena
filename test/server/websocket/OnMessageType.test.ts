import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

const fixture = join(import.meta.dir, '..', '..', 'adapter', 'fixtures', 'strictHandlerTypes.ts');

// Compiled with `strict: true`, as an application's code is: this repo's own `strict: false`
// typecheck would not show a subclass the wider type broke.
describe('AsenaWebSocketService.onMessage', () => {
  test('takes every type a binaryType delivers, and a (ws, message: Buffer | string) override still compiles', () => {
    const result = Bun.spawnSync([process.execPath, fixture, 'websocket-message']);

    expect(result.stderr.toString()).toBe('');
    expect(JSON.parse(result.stdout.toString())).toEqual([]);
  }, 30_000);
});
