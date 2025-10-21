import { describe, expect, test } from 'bun:test';
import { UlakError, UlakErrorCode } from '../../../server/messaging/types';

describe('UlakError', () => {
  describe('constructor', () => {
    test('should create error with message and code', () => {
      const error = new UlakError('Test error', UlakErrorCode.NAMESPACE_NOT_FOUND);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UlakError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
      expect(error.name).toBe('UlakError');
    });

    test('should include namespace when provided', () => {
      const error = new UlakError('Namespace not found', UlakErrorCode.NAMESPACE_NOT_FOUND, '/test');

      expect(error.namespace).toBe('/test');
    });

    test('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new UlakError('Wrapped error', UlakErrorCode.SEND_FAILED, '/test', cause);

      expect(error.cause).toBe(cause);
    });

    test('should work without optional parameters', () => {
      const error = new UlakError('Simple error', UlakErrorCode.BROADCAST_FAILED);

      expect(error.namespace).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });
  });

  describe('error codes', () => {
    test('should have all expected error codes', () => {
      expect(UlakErrorCode.NAMESPACE_NOT_FOUND).toBe('NAMESPACE_NOT_FOUND');
      expect(UlakErrorCode.SOCKET_NOT_FOUND).toBe('SOCKET_NOT_FOUND');
      expect(UlakErrorCode.BROADCAST_FAILED).toBe('BROADCAST_FAILED');
      expect(UlakErrorCode.SEND_FAILED).toBe('SEND_FAILED');
      expect(UlakErrorCode.INVALID_NAMESPACE).toBe('INVALID_NAMESPACE');
      expect(UlakErrorCode.SERVICE_NOT_INITIALIZED).toBe('SERVICE_NOT_INITIALIZED');
    });

    test('should use correct error codes for different scenarios', () => {
      const namespaceError = new UlakError('Namespace not found', UlakErrorCode.NAMESPACE_NOT_FOUND);
      const socketError = new UlakError('Socket not found', UlakErrorCode.SOCKET_NOT_FOUND);
      const broadcastError = new UlakError('Broadcast failed', UlakErrorCode.BROADCAST_FAILED);
      const sendError = new UlakError('Send failed', UlakErrorCode.SEND_FAILED);

      expect(namespaceError.code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
      expect(socketError.code).toBe(UlakErrorCode.SOCKET_NOT_FOUND);
      expect(broadcastError.code).toBe(UlakErrorCode.BROADCAST_FAILED);
      expect(sendError.code).toBe(UlakErrorCode.SEND_FAILED);
    });
  });

  describe('error inheritance', () => {
    test('should be catchable as Error', () => {
      const throwError = () => {
        throw new UlakError('Test error', UlakErrorCode.BROADCAST_FAILED);
      };

      try {
        throwError();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(UlakError);
      }
    });

    test('should preserve stack trace', () => {
      const error = new UlakError('Test error', UlakErrorCode.SEND_FAILED);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('UlakError');
    });
  });

  describe('error properties', () => {
    test('should be enumerable', () => {
      const error = new UlakError('Test error', UlakErrorCode.NAMESPACE_NOT_FOUND, '/test', new Error('cause'));

      const keys = Object.keys(error);

      // message is inherited from Error
      expect(keys).toContain('code');
      expect(error.code).toBe(UlakErrorCode.NAMESPACE_NOT_FOUND);
      expect(error.namespace).toBe('/test');
      expect(error.cause).toBeInstanceOf(Error);
    });

    test('should convert to string correctly', () => {
      const error = new UlakError('Test error message', UlakErrorCode.BROADCAST_FAILED);

      expect(error.toString()).toContain('UlakError');
      expect(error.toString()).toContain('Test error message');
    });
  });

  describe('error context', () => {
    test('should provide useful context for debugging', () => {
      const originalError = new Error('Connection timeout');
      const error = new UlakError(
        'Failed to send message to socket "socket-123"',
        UlakErrorCode.SEND_FAILED,
        '/chat',
        originalError,
      );

      // Should have all context needed for debugging
      expect(error.message).toContain('socket-123');
      expect(error.code).toBe(UlakErrorCode.SEND_FAILED);
      expect(error.namespace).toBe('/chat');
      expect(error.cause).toBe(originalError);
      expect(error.cause?.message).toBe('Connection timeout');
    });

    test('should support error chaining', () => {
      const level3 = new Error('Network error');
      const level2 = new UlakError('Socket send failed', UlakErrorCode.SEND_FAILED, '/test', level3);
      const level1 = new UlakError('Message delivery failed', UlakErrorCode.BROADCAST_FAILED, '/test', level2);

      expect(level1.cause).toBe(level2);
      expect((level1.cause as UlakError).cause).toBe(level3);
    });
  });
});
