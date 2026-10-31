import { describe, expect, test } from 'bun:test';
import { Config, ExceptionHandler, Service } from '../../../lib/server/decorators';
import { Catch } from '../../../lib/server/exception';
import { Inject } from '../../../lib/ioc/component';
import type { AsenaContext } from '../../../lib/adapter';
import { HttpException, NotFoundException } from '../../../lib/adapter';
import { bootExceptionApp, responseContext } from './bootHelper';

class BusinessFailure extends Error {}

@Service()
class AuditService {
  public readonly recorded: string[] = [];
}

describe('the HTTP exception chain', () => {
  /**
   * The invariant the whole design rests on: an application that declared nothing must follow the
   * code path it followed before any of this existed. Both adapters decide what to log from
   * whether *they* answered, so a chain registered for nothing would quietly take that decision
   * away from them.
   */
  test('registers nothing when nothing is declared', async () => {
    @Service()
    class Unrelated {}

    const app = await bootExceptionApp([Unrelated]);

    expect(app.onError).not.toHaveBeenCalled();
    expect(app.onNotFound).not.toHaveBeenCalled();
  });

  test('hands a lone config.onError to the adapter unwrapped', async () => {
    // Not merely an optimisation. A wrapper makes the handler async, and an async handler that
    // declines is a shape adapters have historically mishandled. With nothing to put in front of
    // it there is no reason to introduce one.
    @Config()
    class LegacyConfig {
      public onError(_error: Error, context: AsenaContext<any, any>) {
        return context.send({ from: 'config' }, 500);
      }
    }

    const app = await bootExceptionApp([LegacyConfig]);

    // Called without awaiting: a Response back means the framework passed the config's own method
    // straight through, a Promise would mean it wrapped it.
    const result = app.errorHandler!(new Error('boom'), responseContext());

    expect(result).toBeInstanceOf(Response);
  });

  test('lets a @Catch handler answer', async () => {
    @ExceptionHandler()
    class BusinessErrors {
      @Catch(BusinessFailure)
      public handle(error: Error, ctx: any) {
        return ctx.context.send({ error: error.message }, 422);
      }
    }

    const app = await bootExceptionApp([BusinessErrors]);
    const response = await app.errorHandler!(new BusinessFailure('rejected'), responseContext());

    expect(response!.status).toBe(422);
    expect(await response!.json()).toEqual({ error: 'rejected' });
  });

  test('declines when no handler matches, so the adapter answers and logs', async () => {
    @ExceptionHandler()
    class NarrowErrors {
      @Catch(BusinessFailure)
      public handle(_error: Error, ctx: any) {
        return ctx.context.send({}, 422);
      }
    }

    const app = await bootExceptionApp([NarrowErrors]);

    expect(await app.errorHandler!(new TypeError('unrelated'), responseContext())).toBeUndefined();
  });

  test('declines when the matched handler returns nothing', async () => {
    // Returning nothing is how a handler says "not mine" - the same contract the config hook has
    // had since 0.9.0, so a handler can inspect an error, log it, and still leave the answering
    // to the framework.
    @ExceptionHandler()
    class ObservingErrors {
      @Catch(BusinessFailure)
      public handle() {}
    }

    const app = await bootExceptionApp([ObservingErrors]);

    expect(await app.errorHandler!(new BusinessFailure(), responseContext())).toBeUndefined();
  });

  test('declines and complains when the matched handler returns a non-Response', async () => {
    // Silent otherwise: the request answers from the framework default exactly as if no handler
    // existed, and the author has no way to tell their handler ran at all.
    @ExceptionHandler()
    class ConfusedErrors {
      @Catch(BusinessFailure)
      public handle() {
        return { error: 'I forgot to call context.send' };
      }
    }

    const app = await bootExceptionApp([ConfusedErrors]);

    expect(await app.errorHandler!(new BusinessFailure(), responseContext())).toBeUndefined();

    const complaint = app.logger.error.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('non-Response'));

    expect(complaint).toContain('treated as a decline');
  });

  test('declines and records when the matched handler throws', async () => {
    // A broken handler must not be able to make the request disappear: the framework still
    // answers, and still records the original failure.
    @ExceptionHandler()
    class BrokenErrors {
      @Catch(BusinessFailure)
      public handle(): Response {
        throw new Error('handler itself is broken');
      }
    }

    const app = await bootExceptionApp([BrokenErrors]);

    expect(await app.errorHandler!(new BusinessFailure(), responseContext())).toBeUndefined();

    const line = app.logger.error.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('threw an error'));

    expect(line).toContain('BrokenErrors.handle()');
  });

  describe('ordering against the deprecated config hook', () => {
    test('a matching @Catch answers before config.onError is consulted', async () => {
      let configCalls = 0;

      @ExceptionHandler()
      class WinningErrors {
        @Catch(BusinessFailure)
        public handle(_error: Error, ctx: any) {
          return ctx.context.send({ from: 'catch' }, 422);
        }
      }

      @Config()
      class FallbackConfig {
        public onError(_error: Error, context: AsenaContext<any, any>) {
          configCalls++;
          return context.send({ from: 'config' }, 500);
        }
      }

      const app = await bootExceptionApp([WinningErrors, FallbackConfig]);
      const response = await app.errorHandler!(new BusinessFailure(), responseContext());

      expect(await response!.json()).toEqual({ from: 'catch' });
      expect(configCalls).toBe(0);
    });

    test('config.onError still answers what no @Catch matched', async () => {
      // Migration has to be incremental. If adding one narrow @Catch silently disabled the
      // existing global handler for everything else, nobody could adopt this a piece at a time.
      @ExceptionHandler()
      class NarrowErrors {
        @Catch(BusinessFailure)
        public handle(_error: Error, ctx: any) {
          return ctx.context.send({ from: 'catch' }, 422);
        }
      }

      @Config()
      class StillUsefulConfig {
        public onError(_error: Error, context: AsenaContext<any, any>) {
          return context.send({ from: 'config' }, 500);
        }
      }

      const app = await bootExceptionApp([NarrowErrors, StillUsefulConfig]);
      const response = await app.errorHandler!(new TypeError('unrelated'), responseContext());

      expect(await response!.json()).toEqual({ from: 'config' });
    });

    test('declines when both the handler and the config decline', async () => {
      @ExceptionHandler()
      class SilentErrors {
        @Catch(BusinessFailure)
        public handle() {}
      }

      @Config()
      class SilentConfig {
        public onError() {
          return undefined as any;
        }
      }

      const app = await bootExceptionApp([SilentErrors, SilentConfig]);

      expect(await app.errorHandler!(new BusinessFailure(), responseContext())).toBeUndefined();
    });
  });

  test('a @Catch handler can use its injected dependencies', async () => {
    // The reason these are IoC components rather than plain classes: a real handler reaches an
    // audit service, a logger or a metrics client. Binding must keep `this` intact.
    @ExceptionHandler()
    class AuditingErrors {
      @Inject(AuditService)
      private audit: AuditService;

      @Catch(BusinessFailure)
      public handle(error: Error, ctx: any) {
        this.audit.recorded.push(error.message);

        return ctx.context.send({ recorded: this.audit.recorded.length }, 500);
      }
    }

    const app = await bootExceptionApp([AuditService, AuditingErrors]);
    const response = await app.errorHandler!(new BusinessFailure('audited'), responseContext());

    expect(await response!.json()).toEqual({ recorded: 1 });
  });

  test('@Catch(HttpException) also receives the built-in subclasses', async () => {
    // The 20 status classes are only worth having if a broad handler still catches them, which
    // rests on nothing more than them extending HttpException.
    @ExceptionHandler()
    class HttpErrors {
      @Catch(HttpException)
      public handle(error: any, ctx: any) {
        return ctx.context.send({ status: error.status }, error.status);
      }
    }

    const app = await bootExceptionApp([HttpErrors]);
    const response = await app.errorHandler!(new NotFoundException('gone'), responseContext());

    expect(response!.status).toBe(404);
  });
});
