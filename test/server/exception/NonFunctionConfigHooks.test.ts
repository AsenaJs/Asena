import { describe, expect, test } from 'bun:test';
import { Config, ExceptionHandler } from '../../../lib/server/decorators';
import { Catch, NotFound } from '../../../lib/server/exception';
import type { AsenaContext, NotFoundRequest } from '../../../lib/adapter';
import { bootExceptionApp, responseContext } from './bootHelper';

const MISSING: NotFoundRequest = { path: '/nowhere', method: 'GET' };

/**
 * A @Config member named like a hook but not a function is reported as ignored at boot. The
 * request-time chains must agree: when every handler declines, they return undefined and the
 * adapter default answers, instead of calling the value.
 */
describe('non-function @Config hooks next to declining handlers', () => {
  test('a declined error falls through when config.onError is not a function', async () => {
    @Config()
    class AppConfig {
      public onError = 'not a function';
    }

    @ExceptionHandler()
    class DecliningErrors {
      @Catch(TypeError)
      public typed(_error: Error, ctx: any) {
        return (ctx.context as AsenaContext<any, any>).send({ from: 'catch' }, 500);
      }
    }

    const app = await bootExceptionApp([AppConfig, DecliningErrors]);

    await expect(app.errorHandler!(new RangeError('declined'), responseContext())).resolves.toBeUndefined();
  });

  test('an unmatched route falls through when config.onNotFound is not a function', async () => {
    @Config()
    class AppConfig {
      public onNotFound = {};
    }

    @ExceptionHandler()
    class DecliningRoutes {
      @NotFound()
      public missing(_context: AsenaContext<any, any>, _request: NotFoundRequest) {
        return undefined;
      }
    }

    const app = await bootExceptionApp([AppConfig, DecliningRoutes]);

    await expect(app.notFoundHandler!(responseContext(), MISSING)).resolves.toBeUndefined();
  });
});
