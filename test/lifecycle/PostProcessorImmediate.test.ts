import { beforeEach, describe, expect, test } from 'bun:test';
import type { ComponentPostProcessor } from '../../lib/ioc';
import { AsenaServerFactory } from '../../lib/server';
import { PostProcessor, Service } from '../../lib/server/decorators';
import { OnStart } from '../../lib/ioc/component';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * The one exception to deferred start hooks, pinned.
 *
 * A post-processor's `postProcess()` reads state its own start hook sets up - the otel
 * processor captures `this.tracer` at wrap time, so a deferred hook would hand every wrapped
 * component an undefined tracer and every traced call would throw. The IoC engine therefore
 * registers post-processors (and their dependency closure) in a first phase that keeps the
 * original timing, and only defers the user components in the second.
 *
 * If this test goes red, every @PostProcessor package breaks in a way unit tests elsewhere
 * will not notice: silently, at the first call into a wrapped component.
 */
const observed: string[] = [];

@PostProcessor({ name: 'CapturingPostProcessor' })
class CapturingPostProcessor implements ComponentPostProcessor {
  private stamp?: string;

  @OnStart()
  public init(): void {
    observed.push('postprocessor:start');
    this.stamp = 'ready';
  }

  public postProcess<T>(instance: T, Class: any): T {
    // The read that matters: whatever the start hook set has to be here already.
    observed.push(`postProcess(${Class.name}):${this.stamp ?? 'UNINITIALISED'}`);

    return instance;
  }
}

@Service()
class Ordinary {
  @OnStart()
  public start(): void {
    observed.push('ordinary:start');
  }
}

describe('post-processor start hooks', () => {
  beforeEach(() => {
    observed.length = 0;
  });

  test('run at construction, before anything they process', async () => {
    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter().adapter as any,
      logger: silentLogger,
      components: [CapturingPostProcessor, Ordinary],
      shutdown: { signals: false },
      keepAlive: false,
    });

    // Already ran during create(): the post-processor is initialised and has wrapped Ordinary,
    // while Ordinary's own hook is still waiting for start(). AsenaServer is in the list too -
    // it is registered last and goes through the same post-processing.
    expect(observed[0]).toBe('postprocessor:start');
    expect(observed).toContain('postProcess(Ordinary):ready');
    expect(observed).not.toContain('ordinary:start');

    await server.start();

    expect(observed.at(-1)).toBe('ordinary:start');

    await server.stop();
  });

  test('never observes an uninitialised processor', async () => {
    const server = await AsenaServerFactory.create({
      adapter: createMockAdapter().adapter as any,
      logger: silentLogger,
      components: [CapturingPostProcessor, Ordinary],
      shutdown: { signals: false },
      keepAlive: false,
    });

    await server.start();

    expect(observed.filter((entry) => entry.includes('UNINITIALISED'))).toEqual([]);

    await server.stop();
  });
});
