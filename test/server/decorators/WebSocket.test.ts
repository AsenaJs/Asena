import { describe, expect, test } from 'bun:test';
import { WebSocket } from '../../../lib/server/decorators';
import { ComponentConstants } from '../../../lib/ioc';
import { getOwnTypedMetadata } from '../../../lib/utils';

describe('@WebSocket Decorator', () => {
  describe('Missing path', () => {
    test('throws an error naming the class instead of exiting the process', () => {
      class NoPathSocket {}

      expect(() => WebSocket({ middlewares: [] } as any)(NoPathSocket)).toThrow(
        /@WebSocket on NoPathSocket: "path" is required/,
      );
    });

    test('rejects an empty string path', () => {
      class EmptyPathSocket {}

      expect(() => WebSocket('')(EmptyPathSocket)).toThrow(/@WebSocket on EmptyPathSocket: "path" is required/);
    });

    test('rejects a call with no params at all', () => {
      class NoParamsSocket {}

      expect(() => WebSocket(undefined as any)(NoParamsSocket)).toThrow(
        /@WebSocket on NoParamsSocket: "path" is required/,
      );
    });

    test('leaves the class unregistered when it throws', () => {
      class AlsoNoPathSocket {}

      expect(() => WebSocket({} as any)(AlsoNoPathSocket)).toThrow();

      expect(getOwnTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, AlsoNoPathSocket)).toBeUndefined();
    });
  });

  describe('Path metadata', () => {
    test('strips leading slashes', () => {
      @WebSocket('/chat')
      class ChatSocket {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, ChatSocket)).toBe('chat');
    });

    test('reads the path from object params', () => {
      @WebSocket({ path: 'rooms' })
      class RoomsSocket {}

      expect(getOwnTypedMetadata<string>(ComponentConstants.PathKey, RoomsSocket)).toBe('rooms');
    });
  });
});
