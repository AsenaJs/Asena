import { beforeEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { PostProcessor, Service } from '../../lib/server/decorators';
import { Inject, OnStart, OnStop, PostConstruct } from '../../lib/ioc/component';
import { LifecycleState } from '../../lib/server/lifecycle';
import { ICoreServiceNames } from '../../lib/ioc';
import type { LifecycleService } from '../../lib/server/lifecycle';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

const events: string[] = [];

const createServer = (components: any[]) =>
  AsenaServerFactory.create({
    adapter: createMockAdapter().adapter as any,
    logger: silentLogger,
    components,
    shutdown: { signals: false },
    keepAlive: false,
  });

describe('lifecycle hooks', () => {
  beforeEach(() => {
    events.length = 0;
  });

  describe('ordering', () => {
    @Service()
    class Database {
      @OnStart()
      public async open() {
        events.push('database:start');
      }

      @OnStop()
      public async close() {
        events.push('database:stop');
      }
    }

    @Service()
    class Repository {
      @Inject(Database)
      private database: Database;

      @OnStart()
      public async warm() {
        events.push(`repository:start(${this.database ? 'wired' : 'unwired'})`);
      }

      @OnStop()
      public async flush() {
        events.push('repository:stop');
      }
    }

    test('starts dependencies first and stops them last', async () => {
      // Declared dependent-first on purpose: the order that matters is the topological one the
      // IoC engine computes, not the order the components were handed in.
      const server = await createServer([Repository, Database]);

      await server.start();

      expect(events).toEqual(['database:start', 'repository:start(wired)']);

      await server.stop();

      expect(events).toEqual(['database:start', 'repository:start(wired)', 'repository:stop', 'database:stop']);
    });

    test('runs no hook before start()', async () => {
      await createServer([Repository, Database]);

      expect(events).toEqual([]);
    });
  });

  describe('@PostConstruct alias', () => {
    @Service()
    class Legacy {
      @PostConstruct()
      public async init() {
        events.push('legacy:start');
      }
    }

    test('still runs, on the same schedule as @OnStart', async () => {
      const server = await createServer([Legacy]);

      expect(events).toEqual([]);

      await server.start();

      expect(events).toEqual(['legacy:start']);

      await server.stop();
    });
  });

  describe('a start hook that throws', () => {
    @Service()
    class Healthy {
      @OnStart()
      public async open() {
        events.push('healthy:start');
      }

      @OnStop()
      public async close() {
        events.push('healthy:stop');
      }
    }

    @Service()
    class Broken {
      @Inject(Healthy)
      private healthy: Healthy;

      @OnStart()
      public async open() {
        events.push('broken:start');
        throw new Error('cannot reach the thing');
      }

      @OnStop()
      public async close() {
        events.push('broken:stop');
      }
    }

    test('aborts the boot, naming the hook and keeping the cause', async () => {
      const server = await createServer([Healthy, Broken]);

      const start = server.start();

      await expect(start).rejects.toThrow("@OnStart hook 'Broken.open()' failed");
      await expect(start).rejects.toHaveProperty('cause.message', 'cannot reach the thing');
    });

    test('rolls back the components that already started', async () => {
      const server = await createServer([Healthy, Broken]);

      await expect(server.start()).rejects.toThrow();

      // Healthy started, so it is stopped. Broken's own @OnStop does not run: its start hook
      // threw, so it never counted as started.
      expect(events).toEqual(['healthy:start', 'broken:start', 'healthy:stop']);
    });

    test('leaves the lifecycle in FAILED', async () => {
      const server = await createServer([Healthy, Broken]);

      await expect(server.start()).rejects.toThrow();

      const lifecycle = await server.resolve<LifecycleService>(ICoreServiceNames.LIFECYCLE_SERVICE);

      expect(lifecycle.state).toBe(LifecycleState.FAILED);
    });

    test('does not run a rolled-back hook again on stop()', async () => {
      const server = await createServer([Healthy, Broken]);

      await expect(server.start()).rejects.toThrow();

      events.length = 0;
      await server.stop();

      expect(events).toEqual([]);
    });
  });

  describe('a stop hook that misbehaves', () => {
    @Service()
    class First {
      @OnStop()
      public async close() {
        events.push('first:stop');
      }
    }

    @Service()
    class Exploding {
      @Inject(First)
      private first: First;

      @OnStop()
      public async close() {
        events.push('exploding:stop');
        throw new Error('nope');
      }
    }

    @Service()
    class Hanging {
      @Inject(Exploding)
      private exploding: Exploding;

      @OnStop()
      public async close() {
        events.push('hanging:stop');

        return new Promise<void>(() => {});
      }
    }

    test('does not stop the rest of the shutdown', async () => {
      const server = await createServer([First, Exploding, Hanging]);

      await server.start();
      events.length = 0;

      await server.stop({ hookTimeout: 50 });

      // Every hook was given its turn, in reverse order, despite one throwing and one hanging.
      expect(events).toEqual(['hanging:stop', 'exploding:stop', 'first:stop']);
    });
  });

  describe('stop() without a successful start', () => {
    @Service()
    class NeverStarted {
      @OnStop()
      public async close() {
        events.push('never-started:stop');
      }
    }

    test('runs nothing when start() was never called', async () => {
      const server = await createServer([NeverStarted]);

      await server.stop();

      expect(events).toEqual([]);
    });

    test('still stops a post-processor, which starts at construction', async () => {
      // The rule is per component, not "nothing runs on a server that never started". A
      // post-processor's start hook fires during the scan - it has to, because postProcess()
      // reads what it sets up - so by the time create() returns it has already acquired
      // whatever it acquires. The otel processor builds its tracer and meter providers there.
      // A boot that fails before start() must still release them.
      @PostProcessor({ name: 'AcquiringProcessor' })
      class AcquiringProcessor {
        public postProcess<T>(instance: T): T {
          return instance;
        }

        @OnStop()
        public release() {
          events.push('postprocessor:stop');
        }
      }

      const server = await createServer([AcquiringProcessor, NeverStarted]);

      await server.stop();

      // The ordinary component never started, so it is not stopped. The post-processor did.
      expect(events).toEqual(['postprocessor:stop']);
    });

    test('is idempotent', async () => {
      const server = await createServer([NeverStarted]);

      await server.start();
      events.length = 0;

      await server.stop();
      await server.stop();

      expect(events).toEqual(['never-started:stop']);
    });

    test('does not re-run the framework teardown on a later stop()', async () => {
      const server = await createServer([NeverStarted]);

      await server.start();

      // The component hooks would find nothing to do either way - what this pins is the rest
      // of the sequence. The adapter, the cron runner and the transports are not self-guarding,
      // so a stop() that re-walked them would tear down an already-stopped server a second time.
      const adapter = (server as any)._adapter;
      let adapterStops = 0;
      const original = adapter.stop.bind(adapter);

      adapter.stop = (...args: unknown[]) => {
        adapterStops++;

        return original(...args);
      };

      await server.stop();
      await server.stop();
      await server.stop();

      expect(adapterStops).toBe(1);
    });

    test('runs concurrent stops as one shutdown', async () => {
      const server = await createServer([NeverStarted]);

      await server.start();
      events.length = 0;

      await Promise.all([server.stop(), server.stop(), server.stop()]);

      expect(events).toEqual(['never-started:stop']);
    });
  });

  describe('a teardown step that throws', () => {
    @Service()
    class Releasable {
      @OnStop()
      public async close() {
        events.push('releasable:stop');
      }
    }

    test('does not strand the steps behind it', async () => {
      const server = await createServer([Releasable]);

      await server.start();
      events.length = 0;

      // The adapter is the step most likely to fail for reasons outside the application's
      // control, and everything that releases a real resource sits behind it.
      const adapter = (server as any)._adapter;
      const original = adapter.stop.bind(adapter);

      adapter.stop = () => Promise.reject(new Error('socket refused to close'));

      await expect(server.stop()).rejects.toThrow('shutdown completed with 1 failure');

      // The stop hook ran anyway - that is the whole point.
      expect(events).toEqual(['releasable:stop']);

      adapter.stop = original;
    });
  });

  describe('state', () => {
    @Service()
    class Plain {}

    test('walks NEW -> STARTED -> STOPPED', async () => {
      const server = await createServer([Plain]);
      const lifecycle = await server.resolve<LifecycleService>(ICoreServiceNames.LIFECYCLE_SERVICE);

      expect(lifecycle.state).toBe(LifecycleState.NEW);

      await server.start();
      expect(lifecycle.state).toBe(LifecycleState.STARTED);

      await server.stop();
      expect(lifecycle.state).toBe(LifecycleState.STOPPED);
    });
  });

  describe('server.resolve()', () => {
    @Service()
    class Resolvable {
      public readonly marker = 'resolved';
    }

    test('reaches a component without going through coreContainer', async () => {
      const server = await createServer([Resolvable]);

      await server.start();

      expect(await server.resolve<Resolvable>('Resolvable')).toHaveProperty('marker', 'resolved');

      await server.stop();
    });
  });
});
