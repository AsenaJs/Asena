import { describe, expect, test } from 'bun:test';
import { Config, ExceptionHandler, Service } from '../../../lib/server/decorators';
import { Catch, NotFound } from '../../../lib/server/exception';
import type { AsenaContext, NotFoundRequest } from '../../../lib/adapter';
import { bootExceptionApp, responseContext } from './bootHelper';

const MISSING: NotFoundRequest = { path: '/nowhere', method: 'GET' };

describe('@NotFound handler', () => {
  test('answers an unmatched route', async () => {
    @ExceptionHandler()
    class RoutingErrors {
      @NotFound()
      public missing(context: AsenaContext<any, any>, request: NotFoundRequest) {
        return context.send({ path: request.path, method: request.method }, 404);
      }
    }

    const app = await bootExceptionApp([RoutingErrors]);
    const response = await app.notFoundHandler!(responseContext(), MISSING);

    expect(response!.status).toBe(404);
    expect(await response!.json()).toEqual({ path: '/nowhere', method: 'GET' });
  });

  /**
   * The decision this pins is from 0.8 and is the reason `@NotFound()` exists at all instead of a
   * `RouteNotFoundException`: **an unmatched route is not a thrown error**. Nothing threw; the
   * router had nowhere to send the request.
   *
   * Keeping them apart is what lets a catch-all be written without asking, on every single error,
   * whether this one is secretly a 404 - and stops a handler meant for exceptions from swallowing
   * routing behaviour it knows nothing about.
   */
  test('is not covered by a @Catch() catch-all', async () => {
    @ExceptionHandler()
    class CatchAllOnly {
      @Catch()
      public everything(_error: unknown, ctx: any) {
        return ctx.context.send({ from: 'catch-all' }, 500);
      }
    }

    const app = await bootExceptionApp([CatchAllOnly]);

    // A catch-all claims every *error*. It claims no 404, so the framework never wires the
    // not-found hook and the adapter keeps answering unmatched routes itself.
    expect(app.onError).toHaveBeenCalled();
    expect(app.onNotFound).not.toHaveBeenCalled();
  });

  test('registers nothing when neither hook is declared', async () => {
    @Service()
    class Unrelated {}

    const app = await bootExceptionApp([Unrelated]);

    expect(app.onNotFound).not.toHaveBeenCalled();
  });

  test('hands a lone config.onNotFound to the adapter unwrapped', async () => {
    @Config()
    class LegacyConfig {
      public onNotFound(context: AsenaContext<any, any>, request: NotFoundRequest) {
        return context.send({ from: 'config', path: request.path }, 404);
      }
    }

    const app = await bootExceptionApp([LegacyConfig]);

    // Unawaited: a Response means the config's own method went over untouched.
    const result = app.notFoundHandler!(responseContext(), MISSING);

    expect(result).toBeInstanceOf(Response);
  });

  test('@NotFound answers before config.onNotFound is consulted', async () => {
    let configCalls = 0;

    @ExceptionHandler()
    class RoutingErrors {
      @NotFound()
      public missing(context: AsenaContext<any, any>) {
        return context.send({ from: 'handler' }, 404);
      }
    }

    @Config()
    class FallbackConfig {
      public onNotFound(context: AsenaContext<any, any>) {
        configCalls++;

        return context.send({ from: 'config' }, 404);
      }
    }

    const app = await bootExceptionApp([RoutingErrors, FallbackConfig]);
    const response = await app.notFoundHandler!(responseContext(), MISSING);

    expect(await response!.json()).toEqual({ from: 'handler' });
    expect(configCalls).toBe(0);
  });

  test('falls through to config.onNotFound when @NotFound declines', async () => {
    @ExceptionHandler()
    class PickyErrors {
      @NotFound()
      public missing(_context: AsenaContext<any, any>, request: NotFoundRequest) {
        // Only claims the API surface; everything else is the config's problem.
        if (!request.path.startsWith('/api')) return;

        return responseContext().send({ from: 'handler' }, 404);
      }
    }

    @Config()
    class FallbackConfig {
      public onNotFound(context: AsenaContext<any, any>) {
        return context.send({ from: 'config' }, 404);
      }
    }

    const app = await bootExceptionApp([PickyErrors, FallbackConfig]);
    const response = await app.notFoundHandler!(responseContext(), MISSING);

    expect(await response!.json()).toEqual({ from: 'config' });
  });

  test('declines when the handler returns nothing and there is no config hook', async () => {
    @ExceptionHandler()
    class DecliningErrors {
      @NotFound()
      public missing() {}
    }

    const app = await bootExceptionApp([DecliningErrors]);

    expect(await app.notFoundHandler!(responseContext(), MISSING)).toBeUndefined();
  });

  test('declines and records when the handler throws', async () => {
    // Deliberately NOT routed into the error chain: onNotFound has never been, because that hook
    // is for errors the application threw itself.
    @ExceptionHandler()
    class BrokenErrors {
      @NotFound()
      public missing(): Response {
        throw new Error('handler is broken');
      }
    }

    const app = await bootExceptionApp([BrokenErrors]);

    expect(await app.notFoundHandler!(responseContext(), MISSING)).toBeUndefined();

    const line = app.logger.error.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('threw an error'));

    expect(line).toContain('BrokenErrors.missing()');
  });

  test('warns instead of silently doing nothing when the adapter has no onNotFound', async () => {
    // `onNotFound` is optional on AsenaAdapter so adapters written before it still compile. The
    // failure to avoid is a declared handler that never runs and never says why.
    @ExceptionHandler()
    class RoutingErrors {
      @NotFound()
      public missing(context: AsenaContext<any, any>) {
        return context.send({}, 404);
      }
    }

    const app = await bootExceptionApp([RoutingErrors], { withoutAdapterNotFound: true });

    const warning = app.logger.warn.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('@NotFound()'));

    expect(warning).toContain('does not support it');
    expect(warning).toContain('MockAdapter');
  });
});
