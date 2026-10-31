import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { EventService, ExceptionHandler } from '../../../lib/server/decorators';
import { Catch, type ExceptionContext } from '../../../lib/server/exception';
import { On, type EventDispatchService, type EventEmitter } from '../../../lib/server/event';
import { ICoreServiceNames } from '../../../lib/ioc';
import { bootExceptionApp, type BootOptions, createLogger } from './bootHelper';

abstract class DomainError extends Error {}

class QuotaExceeded extends DomainError {}

class Unrelated extends Error {}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('@Catch for @On handlers', () => {
  let consoleError: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleError = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  const boot = async (components: any[], options: BootOptions = {}) => {
    const app = await bootExceptionApp(components, options);
    const emitter = await app.server.resolve<EventEmitter>(ICoreServiceNames.EVENT_EMITTER);
    const dispatcher = await app.server.resolve<EventDispatchService>(ICoreServiceNames.EVENT_DISPATCH_SERVICE);

    return { ...app, emitter, dispatcher };
  };

  test('hands a sync failure to the matching @Catch with the event context', async () => {
    const seen: [unknown, ExceptionContext][] = [];
    const failure = new QuotaExceeded('quota');

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota(error: unknown, ctx: ExceptionContext) {
        seen.push([error, ctx]);
        return true;
      }
    }

    @EventService({ prefix: 'user' })
    class UserEvents {
      @On('created')
      public onCreated() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, UserEvents]);

    expect(emitter.emit('user.created', { id: 1 })).toBe(true);
    await flush();

    expect(seen).toEqual([
      [failure, { scope: 'event', event: 'user.created', data: { id: 1 }, source: 'UserEvents.onCreated' }],
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('hands an async rejection to the matching @Catch', async () => {
    const seen: unknown[] = [];
    const failure = new QuotaExceeded('quota');

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public async quota(error: unknown) {
        seen.push(error);
        return true;
      }
    }

    @EventService()
    class UserEvents {
      @On('user.deleted')
      public async onDeleted() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, UserEvents]);

    emitter.emit('user.deleted');
    await flush();

    expect(seen).toEqual([failure]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('resolves the most specific type along the prototype chain', async () => {
    const calls: string[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(DomainError)
      public domain() {
        calls.push('domain');
        return true;
      }

      @Catch(Error)
      public generic() {
        calls.push('generic');
        return true;
      }
    }

    @EventService()
    class Jobs {
      @On('job.quota')
      public quota() {
        throw new QuotaExceeded();
      }

      @On('job.plain')
      public plain() {
        throw new Unrelated();
      }
    }

    const { emitter } = await boot([Errors, Jobs]);

    emitter.emit('job.quota');
    emitter.emit('job.plain');
    await flush();

    expect(calls).toEqual(['domain', 'generic']);
  });

  test('logs an unmatched sync failure exactly as before, in the same tick', async () => {
    const failure = new Unrelated('nobody catches this');

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota() {
        return true;
      }
    }

    @EventService()
    class Events {
      @On('order.placed')
      public onPlaced() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, Events]);

    emitter.emit('order.placed');

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[EventDispatchService] Sync error in handler for event "order.placed":',
      failure,
    );
  });

  test('logs an unmatched async failure exactly as before', async () => {
    const failure = new Unrelated('async');

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota() {
        return true;
      }
    }

    @EventService()
    class Events {
      @On('order.placed')
      public async onPlaced() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, Events]);

    emitter.emit('order.placed');
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      '[EventDispatchService] Async error in handler for event "order.placed":',
      failure,
    );
  });

  test('a @Catch that returns nothing declines, and the original failure is logged', async () => {
    const failure = new QuotaExceeded('declined');
    let reached = false;

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota() {
        reached = true;
      }
    }

    @EventService()
    class Events {
      @On('quota.hit')
      public onHit() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, Events]);

    emitter.emit('quota.hit');
    await flush();

    expect(reached).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      '[EventDispatchService] Sync error in handler for event "quota.hit":',
      failure,
    );
  });

  test('a @Catch that throws is contained: its error is logged and the original still reaches the default', async () => {
    const failure = new QuotaExceeded('original');
    const handlerFailure = new Error('handler broke');

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public async quota() {
        throw handlerFailure;
      }
    }

    @EventService()
    class Events {
      @On('quota.hit')
      public async onHit() {
        throw failure;
      }
    }

    const { emitter, logger } = await boot([Errors, Events]);

    emitter.emit('quota.hit');
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      '@Catch handler Errors.quota() threw an error, falling back to the framework default:',
      handlerFailure,
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[EventDispatchService] Async error in handler for event "quota.hit":',
      failure,
    );
  });

  test('still logs the original when containing a throwing @Catch fails too', async () => {
    const failure = new QuotaExceeded('original');
    const logger = createLogger();

    logger.error.mockImplementation(() => {
      throw new Error('logger down');
    });

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota() {
        throw new Error('handler broke');
      }
    }

    @EventService()
    class Events {
      @On('quota.hit')
      public onHit() {
        throw failure;
      }
    }

    const { emitter } = await boot([Errors, Events], { logger });

    emitter.emit('quota.hit');
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      '[EventDispatchService] Sync error in handler for event "quota.hit":',
      failure,
    );
  });

  test('keeps the other handlers of the same event running', async () => {
    const calls: string[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota() {
        calls.push('caught');
        return true;
      }
    }

    @EventService()
    class Events {
      @On('quota.hit')
      public first() {
        throw new QuotaExceeded();
      }

      @On('quota.hit')
      public second() {
        calls.push('second');
      }
    }

    const { emitter } = await boot([Errors, Events]);

    emitter.emit('quota.hit');
    await flush();

    expect(calls.sort()).toEqual(['caught', 'second']);
  });

  test('routes handlers registered without @On, with no source', async () => {
    const seen: ExceptionContext[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(QuotaExceeded)
      public quota(_error: unknown, ctx: ExceptionContext) {
        seen.push(ctx);
        return true;
      }
    }

    const { emitter, dispatcher } = await boot([Errors]);

    dispatcher.registerHandler('raw.event', () => {
      throw new QuotaExceeded();
    });

    emitter.emit('raw.event', 7);
    await flush();

    expect(seen).toEqual([{ scope: 'event', event: 'raw.event', data: 7 }]);
    expect('source' in seen[0]).toBe(false);
  });
});
