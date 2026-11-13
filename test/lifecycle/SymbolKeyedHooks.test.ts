import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Service } from '../../lib/server/decorators';
import { OnStart, OnStop, PostConstruct } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';
import { silentLogger } from '../../lib/test/harness/silentLogger';

const events: string[] = [];

const bootSymbol = Symbol('boot');
const haltSymbol = Symbol('halt');
const aliasSymbol = Symbol('alias');

@Service()
class SymbolHooked {
  @OnStart()
  [bootSymbol]() {
    events.push('start');
  }

  @OnStop()
  [haltSymbol]() {
    events.push('stop');
  }

  @PostConstruct()
  [aliasSymbol]() {
    events.push('alias');
  }
}

const createServer = () =>
  AsenaServerFactory.create({
    adapter: createMockAdapter().adapter as any,
    logger: silentLogger,
    components: [SymbolHooked],
    shutdown: { signals: false },
    keepAlive: false,
  });

describe('symbol-keyed lifecycle hooks', () => {
  beforeEach(() => {
    events.length = 0;
  });

  test('@OnStart, @PostConstruct and @OnStop run for symbol-keyed methods', async () => {
    const server = await createServer();

    await server.start();

    expect(events).toEqual(['start', 'alias']);

    await server.stop();

    expect(events).toEqual(['start', 'alias', 'stop']);
  });
});
