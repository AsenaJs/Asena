import { describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { silentLogger } from '../../lib/test/harness/silentLogger';

describe('AsenaServer without an HTTP adapter', () => {
  test('requireAdapter() names the missing adapter instead of failing on a property read', async () => {
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [],
      shutdown: { signals: false },
      keepAlive: false,
    });

    expect(() => server['requireAdapter']()).toThrow(new Error('HTTP adapter is not initialised'));
  });
});
