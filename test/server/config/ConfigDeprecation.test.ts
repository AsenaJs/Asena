import { describe, expect, test } from 'bun:test';
import { Config, Service } from '../../../lib/server/decorators';
import type { AsenaContext, NotFoundRequest } from '../../../lib/adapter';
import { bootExceptionApp } from '../exception/bootHelper';

const deprecationLines = (app: Awaited<ReturnType<typeof bootExceptionApp>>) =>
  app.logger.warn.mock.calls.map((call: any[]) => call[0]).filter((message: string) => message.includes('deprecated'));

/**
 * `onError` and `onNotFound` still work in 0.13 - they are the last link of the chain - but they
 * are on their way out in 1.0, and a deprecation nobody sees is not a deprecation.
 *
 * The warnings are emitted **after** the wiring diagnostics on purpose. Those say something is
 * broken now; this says something will break later, and a reader scanning the boot log for the
 * first line mentioning `onNotFound` should land on the actionable one.
 */
describe('@Config error hook deprecations', () => {
  test('warns once for onError', async () => {
    @Config()
    class ErrorConfig {
      public onError(_error: Error, context: AsenaContext<any, any>) {
        return context.send({}, 500);
      }
    }

    const lines = deprecationLines(await bootExceptionApp([ErrorConfig]));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Config.onError() is deprecated');
    expect(lines[0]).toContain('@ExceptionHandler');
    // Says what still happens, so nobody reads it as "this stopped working".
    expect(lines[0]).toContain('still runs in 0.13');
  });

  test('warns once for onNotFound', async () => {
    @Config()
    class NotFoundConfig {
      public onNotFound(context: AsenaContext<any, any>, _request: NotFoundRequest) {
        return context.send({}, 404);
      }
    }

    const lines = deprecationLines(await bootExceptionApp([NotFoundConfig]));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Config.onNotFound() is deprecated');
    expect(lines[0]).toContain('@NotFound()');
    expect(lines[0]).toContain('still runs in 0.13');
  });

  test('warns once per hook when both are declared', async () => {
    @Config()
    class BothConfig {
      public onError(_error: Error, context: AsenaContext<any, any>) {
        return context.send({}, 500);
      }

      public onNotFound(context: AsenaContext<any, any>) {
        return context.send({}, 404);
      }
    }

    expect(deprecationLines(await bootExceptionApp([BothConfig]))).toHaveLength(2);
  });

  test('stays quiet for a config that declares neither', async () => {
    // Most applications have a @Config for serveOptions alone. Warning them about hooks they do
    // not use is how a deprecation notice becomes noise people learn to scroll past.
    @Config()
    class ServeOnlyConfig {
      public serveOptions() {
        return {};
      }
    }

    expect(deprecationLines(await bootExceptionApp([ServeOnlyConfig]))).toHaveLength(0);
  });

  test('stays quiet when there is no config at all', async () => {
    @Service()
    class Unrelated {}

    expect(deprecationLines(await bootExceptionApp([Unrelated]))).toHaveLength(0);
  });
});
