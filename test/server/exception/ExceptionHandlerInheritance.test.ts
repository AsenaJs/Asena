import { describe, expect, test } from 'bun:test';
import { ExceptionHandler } from '../../../lib/server/decorators';
import { Catch } from '../../../lib/server/exception';
import type { AsenaContext } from '../../../lib/adapter';
import { bootExceptionApp, responseContext } from './bootHelper';

class InheritedFailure extends Error {}
class OverriddenFailure extends Error {}
class SiblingFailure extends Error {}

/**
 * `@Catch` follows the same inheritance rule as `@On`, `@MessagePattern` and `@Get`, set in 0.9.0:
 * *what changes the behaviour of a request travels with the route*. The metadata is read with
 * `getChainedTypedMetadata`, so a handler declared on a base class belongs to every subclass, and
 * a subclass overrides an inherited one **by method name**.
 *
 * The consequence worth pinning is the unpleasant one - two subclasses of a shared base each
 * inherit its `@Catch`, which is a duplicate and fails the boot.
 */
describe('@Catch inheritance', () => {
  test('a handler declared on a base class answers for the subclass', async () => {
    class BaseErrors {
      @Catch(InheritedFailure)
      public inherited(_error: Error, ctx: any) {
        return (ctx.context as AsenaContext<any, any>).send({ from: 'base' }, 500);
      }
    }

    @ExceptionHandler()
    class ConcreteErrors extends BaseErrors {}

    const app = await bootExceptionApp([ConcreteErrors]);
    const response = await app.errorHandler!(new InheritedFailure(), responseContext());

    expect(await response!.json()).toEqual({ from: 'base' });
  });

  test('a subclass overrides an inherited handler by method name', async () => {
    class OverridableErrors {
      @Catch(OverriddenFailure)
      public handle(_error: Error, ctx: any) {
        return (ctx.context as AsenaContext<any, any>).send({ from: 'base' }, 500);
      }
    }

    @ExceptionHandler()
    class NarrowedErrors extends OverridableErrors {
      // Same method name, different type. The merged record is keyed by method name, so this
      // *replaces* the inherited entry - OverriddenFailure is no longer caught at all.
      @Catch(TypeError)
      public handle(_error: Error, ctx: any) {
        return (ctx.context as AsenaContext<any, any>).send({ from: 'subclass' }, 500);
      }
    }

    const app = await bootExceptionApp([NarrowedErrors]);

    const overridden = await app.errorHandler!(new TypeError('x'), responseContext());

    expect(await overridden!.json()).toEqual({ from: 'subclass' });

    // The base's type went with the method it was declared on. Nothing catches it now, so the
    // chain declines and the adapter answers - which is the whole meaning of `undefined` here.
    const orphaned = await app.errorHandler!(new OverriddenFailure(), responseContext());

    expect(orphaned).toBeUndefined();
  });

  test('two subclasses of one base collide on the handler they both inherit', async () => {
    // Neither file shows a duplicate. This is exactly why the error names both classes.
    class SharedBase {
      @Catch(SiblingFailure)
      public shared() {}
    }

    @ExceptionHandler()
    class FirstSibling extends SharedBase {}

    @ExceptionHandler()
    class SecondSibling extends SharedBase {}

    const attempt = bootExceptionApp([FirstSibling, SecondSibling]);

    await expect(attempt).rejects.toThrow(/Duplicate @Catch\(SiblingFailure\) detected/);
    await expect(attempt).rejects.toThrow(/FirstSibling\.shared\(\)/);
    await expect(attempt).rejects.toThrow(/SecondSibling\.shared\(\)/);
  });

  test('reports inherited handlers at boot', async () => {
    // An inherited handler is invisible in the source of the class you are reading, and it is the
    // usual reason a duplicate error names a method you cannot find. Mirrors what
    // PrepareEventService already logs for @On.
    class LoggedBase {
      @Catch(RangeError)
      public fromBase() {}
    }

    @ExceptionHandler()
    class LoggedChild extends LoggedBase {
      @Catch(EvalError)
      public ownHandler() {}
    }

    const app = await bootExceptionApp([LoggedChild]);

    const line = app.logger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((message: string) => message.includes('inherits handlers'));

    expect(line).toContain('LoggedChild');
    expect(line).toContain('fromBase');
    expect(line).not.toContain('ownHandler');
  });
});
