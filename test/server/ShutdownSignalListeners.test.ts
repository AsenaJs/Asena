import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { constants } from 'node:os';
import { OnStop } from '../../lib/ioc/component';
import { AsenaServerFactory } from '../../lib/server';
import { Service } from '../../lib/server/decorators';
import { silentLogger } from '../../lib/test/harness/silentLogger';

// A signal no runtime or test runner listens to, so the counts below are the server's alone.
const SIGNAL = 'SIGUSR2';

let releaseStop: (() => void) | undefined;

@Service()
class HeldOnStop {
  @OnStop()
  public stop(): Promise<void> {
    return new Promise((resolve) => (releaseStop = resolve));
  }
}

const settle = async (server: { stop: () => Promise<void> }) => {
  for (let waited = 0; !releaseStop && waited < 2000; waited += 5) {
    await Bun.sleep(5);
  }

  releaseStop?.();
  await server.stop();
  await Bun.sleep(0);
};

describe('the second-signal listener of a signal stop', () => {
  afterEach(() => {
    releaseStop?.();
    releaseStop = undefined;
  });

  test('is armed during the drain and ends the process with 128 + the signal number', async () => {
    const exit = spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [HeldOnStop],
      shutdown: { signals: [SIGNAL] },
    });

    try {
      await server.start();
      process.emit(SIGNAL, SIGNAL);
      await Bun.sleep(0);

      expect(process.listenerCount(SIGNAL)).toBe(1);
      expect(exit).not.toHaveBeenCalled();

      process.emit(SIGNAL, SIGNAL);

      expect(exit).toHaveBeenCalledWith(128 + constants.signals[SIGNAL]);
    } finally {
      await settle(server);
      exit.mockRestore();
    }
  });

  test('is removed once the drain is over, so no listener outlives the server', async () => {
    const server = await AsenaServerFactory.create({
      headless: true,
      logger: silentLogger,
      components: [HeldOnStop],
      shutdown: { signals: [SIGNAL] },
    });

    await server.start();
    process.emit(SIGNAL, SIGNAL);
    await settle(server);

    expect(process.listenerCount(SIGNAL)).toBe(0);
  });
});
