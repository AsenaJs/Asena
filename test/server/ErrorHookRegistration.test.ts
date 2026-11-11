import { describe, expect, mock, test } from 'bun:test';
import type { AsenaContext, NotFoundRequest } from '../../lib/adapter';
import { AsenaServerFactory } from '../../lib/server';
import { Config, ExceptionHandler, Middleware } from '../../lib/server/decorators';
import { Catch } from '../../lib/server/exception';
import { AsenaMiddlewareService } from '../../lib/server/web/middleware';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

@Middleware()
class PassThrough extends AsenaMiddlewareService {
  public handle(_context: any, next: any) {
    return next();
  }
}

const boot = async (components: any[], order: string[] = []) => {
  const { adapter } = createMockAdapter();
  let errorHandler: ((error: unknown, context: any) => Promise<Response | undefined>) | undefined;

  (adapter as any).serveOptions = mock(() => {});
  (adapter as any).registerHTMLRoute = mock(() => {});
  (adapter as any).use = mock(async () => {
    order.push('use');
  });
  (adapter as any).onError = mock((handler: any) => {
    errorHandler = handler;
    order.push('onError');
  });
  (adapter as any).onNotFound = mock(() => {
    order.push('onNotFound');
  });

  const server = await AsenaServerFactory.create({
    adapter: adapter as any,
    logger: silentLogger,
    port: 3000,
    components,
    shutdown: { signals: false },
  });

  await server.start();
  await server.stop();

  return { errorHandler: errorHandler! };
};

// Before 0.13 the config's onError()/onNotFound() reached the adapter ahead of use() and transport().
// An adapter that captures its error handler when a middleware is registered depends on that order.
describe('where the error hooks reach the adapter', () => {
  const configWith = (order: string[]) => {
    @Config()
    class OrderedConfig {
      public onError(_error: Error, context: AsenaContext<any, any>) {
        return context.send('config', 500);
      }

      public onNotFound(context: AsenaContext<any, any>, _request: NotFoundRequest) {
        return context.send('missing', 404);
      }

      public globalMiddlewares() {
        return [PassThrough];
      }

      public transport() {
        order.push('transport');

        return { interceptors: [] };
      }
    }

    return OrderedConfig;
  };

  test('a lone @Config hands its hooks over before use() and transport()', async () => {
    const order: string[] = [];

    await boot([PassThrough, configWith(order)], order);

    expect(order).toEqual(['onError', 'onNotFound', 'use', 'transport']);
  });

  test('the composed @Catch chain is handed over at the same point', async () => {
    const order: string[] = [];

    @ExceptionHandler()
    class Handlers {
      @Catch()
      public everything() {
        return undefined;
      }
    }

    await boot([PassThrough, Handlers, configWith(order)], order);

    expect(order).toEqual(['onError', 'onNotFound', 'use', 'transport']);
  });

  test('without a @Config the @Catch chain is still handed over', async () => {
    const order: string[] = [];

    @ExceptionHandler()
    class Handlers {
      @Catch()
      public everything() {
        return undefined;
      }
    }

    await boot([Handlers], order);

    expect(order).toEqual(['onError']);
  });
});

// Hono forwards only `instanceof Error` to onError today; an adapter that forwards the rest must reach @Catch() intact.
describe('a non-Error thrown on HTTP', () => {
  test('reaches @Catch() as the value that was thrown', async () => {
    const received: unknown[] = [];

    @ExceptionHandler()
    class Handlers {
      @Catch()
      public everything(error: unknown, ctx: any) {
        received.push(error);

        return ctx.context.send('caught', 500);
      }
    }

    const { errorHandler } = await boot([Handlers]);
    const response = await errorHandler('boom', { send: (body: string) => new Response(body) });

    expect(received).toEqual(['boom']);
    expect(await response!.text()).toBe('caught');
  });

  test('is not caught by @Catch(Error), and config.onError still gets it as thrown', async () => {
    const seenByConfig: unknown[] = [];

    @ExceptionHandler()
    class Handlers {
      @Catch(Error)
      public errorsOnly(_error: Error, ctx: any) {
        return ctx.context.send('errors-only', 500);
      }
    }

    @Config()
    class LegacyConfig {
      public onError(error: Error, context: AsenaContext<any, any>) {
        seenByConfig.push(error);

        return context.send('config', 500);
      }
    }

    const { errorHandler } = await boot([Handlers, LegacyConfig]);
    const response = await errorHandler(42, { send: (body: string) => new Response(body) });

    expect(await response!.text()).toBe('config');
    expect(seenByConfig).toEqual([42]);
  });
});
