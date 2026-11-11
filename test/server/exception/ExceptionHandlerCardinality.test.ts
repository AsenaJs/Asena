import { describe, expect, mock, test } from 'bun:test';
import { AsenaServerFactory } from '../../../lib/server';
import { ExceptionHandler } from '../../../lib/server/decorators';
import { Catch, NotFound } from '../../../lib/server/exception';
import { Implements } from '../../../lib/ioc/component/decorators';
import { type AsenaContext, HttpException, type NotFoundRequest } from '../../../lib/adapter';
import { createMockAdapter } from '../../utils/createMockContext';

class OrderFailure extends Error {}
class PaymentFailure extends Error {}

const createLogger = () => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  profile: mock(() => {}),
});

const boot = async (components: any[], logger = createLogger()) => {
  const { adapter } = createMockAdapter();

  // The mock adapter predates both hooks. A real adapter always has onError (it is abstract on
  // AsenaAdapter) and may have onNotFound (it is optional).
  (adapter as any).onError = mock(() => {});
  (adapter as any).onNotFound = mock(() => {});

  const server = await AsenaServerFactory.create({
    adapter: adapter as any,
    logger: logger as any,
    port: 3000,
    components,
  });

  await server.start();

  return { server, adapter, logger };
};

/**
 * Every rule here fails the **boot**, not the request.
 *
 * The alternative is what the framework has been bitten by twice: a misconfiguration whose only
 * symptom is on the first request that happens to reach the feature, in production, long after
 * the deploy that introduced it. An ambiguous exception table has no safe reading, so it is
 * refused while there is still no port bound.
 */
describe('exception handler cardinality', () => {
  test('rejects two classes catching the same exception type', async () => {
    @ExceptionHandler()
    class OrderErrors {
      @Catch(OrderFailure)
      public handle() {}
    }

    @ExceptionHandler()
    class BillingErrors {
      @Catch(OrderFailure)
      public alsoHandle() {}
    }

    const attempt = boot([OrderErrors, BillingErrors]);

    // Both sides named: after 0.9.0's decorator inheritance the other half of a conflict is
    // usually in a file you are not looking at, which is why Duplicate route detected names both.
    await expect(attempt).rejects.toThrow(/Duplicate @Catch\(OrderFailure\) detected/);
    await expect(attempt).rejects.toThrow(/OrderErrors\.handle\(\)/);
    await expect(attempt).rejects.toThrow(/BillingErrors\.alsoHandle\(\)/);
  });

  test('rejects two methods on one class catching the same type', async () => {
    // Intra-class is the same ambiguity as cross-class and gets the same answer; a rule that only
    // looked across classes would leave the easier mistake unguarded.
    @ExceptionHandler()
    class DoubledErrors {
      @Catch(PaymentFailure)
      public first() {}

      @Catch(PaymentFailure)
      public second() {}
    }

    await expect(boot([DoubledErrors])).rejects.toThrow(/Duplicate @Catch\(PaymentFailure\) detected/);
  });

  test('rejects a type listed twice across two multi-type handlers', async () => {
    @ExceptionHandler()
    class MultiA {
      @Catch(OrderFailure, TypeError)
      public handle() {}
    }

    @ExceptionHandler()
    class MultiB {
      @Catch(RangeError, TypeError)
      public handle() {}
    }

    await expect(boot([MultiA, MultiB])).rejects.toThrow(/Duplicate @Catch\(TypeError\) detected/);
  });

  test('rejects two catch-alls', async () => {
    @ExceptionHandler()
    class FallbackA {
      @Catch()
      public fallback() {}
    }

    @ExceptionHandler()
    class FallbackB {
      @Catch()
      public fallback() {}
    }

    const attempt = boot([FallbackA, FallbackB]);

    await expect(attempt).rejects.toThrow(/Duplicate @Catch\(\) catch-all detected/);
    await expect(attempt).rejects.toThrow(/FallbackA\.fallback\(\)/);
    await expect(attempt).rejects.toThrow(/FallbackB\.fallback\(\)/);
  });

  test('rejects two @NotFound handlers', async () => {
    @ExceptionHandler()
    class MissingA {
      @NotFound()
      public missing(context: AsenaContext<any, any>) {
        return context.send({}, 404);
      }
    }

    @ExceptionHandler()
    class MissingB {
      @NotFound()
      public alsoMissing(context: AsenaContext<any, any>, _request: NotFoundRequest) {
        return context.send({}, 404);
      }
    }

    const attempt = boot([MissingA, MissingB]);

    await expect(attempt).rejects.toThrow(/Duplicate @NotFound\(\) detected/);
    await expect(attempt).rejects.toThrow(/MissingA\.missing\(\)/);
    await expect(attempt).rejects.toThrow(/MissingB\.alsoMissing\(\)/);
  });

  test('accepts @Catch(Error) alongside @Catch()', async () => {
    // The two are genuinely different handlers - @Catch(Error) never sees `throw 'boom'` - so
    // treating them as a duplicate would forbid a legitimate and useful pairing.
    @ExceptionHandler()
    class ErrorAndFallback {
      @Catch(Error)
      public errors() {}

      @Catch()
      public everything() {}
    }

    const { server } = await boot([ErrorAndFallback]);

    expect(server).toBeDefined();
  });

  test('accepts a subclass and its base in two different classes', async () => {
    // Distinct types, so no ambiguity: resolution picks the subclass handler for a subclass.
    // Rejecting this would make it impossible to layer a general handler under a specific one.
    class SpecificFailure extends OrderFailure {}

    @ExceptionHandler()
    class GeneralErrors {
      @Catch(OrderFailure)
      public general() {}
    }

    @ExceptionHandler()
    class SpecificErrors {
      @Catch(SpecificFailure)
      public specific() {}
    }

    const { server } = await boot([GeneralErrors, SpecificErrors]);

    expect(server).toBeDefined();
  });

  test('warns about an @ExceptionHandler that declares nothing', async () => {
    // Registered, injectable and unreachable. Silence here costs someone an afternoon.
    @ExceptionHandler()
    class EmptyErrors {}

    const { logger } = await boot([EmptyErrors]);

    const warning = logger.warn.mock.calls.map((call: any[]) => call[0]).find((m: string) => m.includes('EmptyErrors'));

    expect(warning).toContain('declares no @Catch() or @NotFound() methods');
  });

  test('announces a catch-all at boot', async () => {
    // The one registration that silently widens: it also swallows ValidationError and
    // HttpException, so an application that used to get the adapter's 400 envelope stops getting
    // it. The line is the only warning anyone gets before the behaviour changes under them.
    @ExceptionHandler()
    class LoudFallback {
      @Catch()
      public fallback() {}
    }

    const { logger } = await boot([LoudFallback]);

    const notice = logger.info.mock.calls.map((call: any[]) => call[0]).find((m: string) => m.includes('catch-all'));

    expect(notice).toContain('LoudFallback.fallback');
    expect(notice).toContain('ValidationError');
  });

  test('announces a @Catch(Error) at boot, since HttpException, ValidationError and auth 401s reach it too', async () => {
    @ExceptionHandler()
    class BroadErrors {
      @Catch(Error)
      public anyError() {}
    }

    const { logger } = await boot([BroadErrors]);

    const notice = logger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((m: string) => m.includes('BroadErrors.anyError'));

    expect(notice).toContain('HttpException');
    expect(notice).toContain('ValidationError');
    expect(notice).toContain('401');
  });

  test('stays quiet about @Catch(Error) and the catch-all when @Catch(HttpException) keeps them', async () => {
    @ExceptionHandler()
    class SplitErrors {
      @Catch(Error)
      public anyError() {}

      @Catch(HttpException)
      public http() {}

      @Catch()
      public fallback() {}
    }

    const { logger } = await boot([SplitErrors]);

    const notices = logger.info.mock.calls
      .map((call: any[]) => String(call[0]))
      .filter((m: string) => m.includes('HttpException'));

    expect(notices).toEqual([]);
  });

  test('rejects an undefined @Catch argument at decoration time', async () => {
    // A circular import leaves `undefined` here. Recorded rather than rejected, it matches nothing
    // and the handler simply never runs - with a green boot and no log line to explain it.
    const missingImport = undefined as any;

    expect(() => {
      @ExceptionHandler()
      class BrokenImport {
        @Catch(missingImport)
        public handle() {}
      }

      return BrokenImport;
    }).toThrow(/@Catch\(\) on BrokenImport\.handle\(\) received `undefined` at position 0/);
  });

  test('registers an @Implements handler once, not once per container key', async () => {
    @ExceptionHandler()
    @Implements('IErrorPolicy')
    class OrderErrors {
      @Catch(OrderFailure)
      public handle() {}

      @Catch()
      public fallback() {}
    }

    const { server } = await boot([OrderErrors]);

    await server.stop();
  });
});
