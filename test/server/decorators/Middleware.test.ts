import { describe, expect, spyOn, test } from 'bun:test';
import { Middleware } from '../../../lib/server/decorators';
import { VALIDATOR_METHODS } from '../../../lib/adapter';
import { getComponentsDeclaredIn } from '../../../lib/ioc/component';

describe('@Middleware definition errors', () => {
  test('throws naming the class when handle() is missing', () => {
    class NoHandleMiddleware {}

    expect(() => Middleware()(NoHandleMiddleware)).toThrow(
      "Class NoHandleMiddleware must implement a 'handle(context, next)' method.",
    );
  });

  test('throws naming the validator methods when a validator middleware has none', () => {
    class NoValidatorMiddleware {}

    expect(() => Middleware({ validator: true })(NoValidatorMiddleware)).toThrow(
      `Class NoValidatorMiddleware must implement at least one of the validator methods: ${VALIDATOR_METHODS.join(', ')}.`,
    );
  });

  test('does not exit the process or print when the definition is invalid', () => {
    class NoHandleMiddleware {}

    const exit = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit was called');
    }) as never);
    const error = spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(() => Middleware()(NoHandleMiddleware)).toThrow(/must implement a 'handle/);
      expect(exit).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  test('a rejected class is not left in the declared-component registry', () => {
    class NoHandleMiddleware {}

    expect(() => Middleware()(NoHandleMiddleware)).toThrow();
    expect(getComponentsDeclaredIn(new Set([import.meta.path]))).not.toContain(NoHandleMiddleware);
  });

  test('accepts a class with handle()', () => {
    class GoodMiddleware {
      public handle() {}
    }

    expect(() => Middleware()(GoodMiddleware)).not.toThrow();
  });

  test('accepts a validator class with one validator method', () => {
    class GoodValidatorMiddleware {
      public json() {}
    }

    expect(() => Middleware({ validator: true })(GoodValidatorMiddleware)).not.toThrow();
  });
});
