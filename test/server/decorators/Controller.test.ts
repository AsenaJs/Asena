import { describe, expect, test } from 'bun:test';
import { Controller } from '../../../lib/server/decorators';
import { ComponentConstants } from '../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../lib/utils';

describe('@Controller Decorator', () => {
  describe('Missing path', () => {
    test('names the controller instead of throwing a raw TypeError', () => {
      class NoPath {}

      expect(() => Controller({ middlewares: [] } as any)(NoPath)).toThrow(/@Controller on NoPath: "path" is required/);
    });

    test('leaves the class unregistered when it throws', () => {
      class AlsoNoPath {}

      expect(() => Controller({} as any)(AlsoNoPath)).toThrow();

      // The registry is module-level and bun runs every test file in one process, so a
      // half-decorated class would leak into the component scan of an unrelated suite.
      expect(getOwnTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, AlsoNoPath)).toBeUndefined();
    });
  });

  describe('Path metadata', () => {
    test('stores the root path when called with no arguments', () => {
      @Controller()
      class NoArgs {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, NoArgs)).toBe('/');
    });

    test('stores the root path for an empty string', () => {
      @Controller('')
      class EmptyString {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, EmptyString)).toBe('/');
    });

    test('stores the root path for a single slash', () => {
      @Controller('/')
      class Slash {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, Slash)).toBe('/');
    });

    test('collapses multiple leading slashes', () => {
      @Controller('//api')
      class DoubleSlash {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, DoubleSlash)).toBe('/api');
    });
  });
});
