import { describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Service } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { CircularDependencyError } from '../../lib/ioc';
import { createMockAdapter } from '../utils/createMockContext';

/**
 * The boot-time cycle error used to name one component. The DFS only pushed the node where a
 * back edge closed, so an A <-> B cycle printed "Circular dependency detected: A". The message is
 * the only thing a developer reads to find the loop, so the exact text is asserted.
 */
const bootWith = (components: any[]) => {
  const mock: any = createMockAdapter();

  return AsenaServerFactory.create({
    adapter: mock.adapter,
    logger: mock.logger,
    port: 10000 + Math.floor(Math.random() * 22000),
    components,
  });
};

describe('boot-time circular dependency message', () => {
  test('two-node cycle names both components and closes the loop', async () => {
    @Service()
    class PingService {
      @Inject('PongService')
      public pong: unknown;
    }

    @Service()
    class PongService {
      @Inject('PingService')
      public ping: unknown;
    }

    const boot = bootWith([PingService, PongService]);

    await expect(boot).rejects.toBeInstanceOf(CircularDependencyError);
    await expect(boot).rejects.toMatchObject({
      message: 'Circular dependency detected: PingService -> PongService -> PingService',
    });
  });

  test('three-node cycle names every component in order', async () => {
    @Service()
    class RingAlpha {
      @Inject('RingBeta')
      public next: unknown;
    }

    @Service()
    class RingBeta {
      @Inject('RingGamma')
      public next: unknown;
    }

    @Service()
    class RingGamma {
      @Inject('RingAlpha')
      public next: unknown;
    }

    await expect(bootWith([RingAlpha, RingBeta, RingGamma])).rejects.toMatchObject({
      message: 'Circular dependency detected: RingAlpha -> RingBeta -> RingGamma -> RingAlpha',
    });
  });

  test('self-dependency is reported as a one-step loop', async () => {
    @Service()
    class SelfLoopService {
      @Inject('SelfLoopService')
      public self: unknown;
    }

    await expect(bootWith([SelfLoopService])).rejects.toMatchObject({
      message: 'Circular dependency detected: SelfLoopService -> SelfLoopService',
    });
  });

  test('a cycle entered from outside prints only the loop, not the component leading into it', async () => {
    @Service()
    class EntryService {
      @Inject('LoopLeft')
      public left: unknown;
    }

    @Service()
    class LoopLeft {
      @Inject('LoopRight')
      public right: unknown;
    }

    @Service()
    class LoopRight {
      @Inject('LoopLeft')
      public left: unknown;
    }

    await expect(bootWith([EntryService, LoopLeft, LoopRight])).rejects.toMatchObject({
      message: 'Circular dependency detected: LoopLeft -> LoopRight -> LoopLeft',
    });
  });
});
