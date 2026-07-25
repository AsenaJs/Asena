import { describe, expect, test } from 'bun:test';
import { createTestUlakStub } from '../../lib/test';
import type { Ulak } from '../../lib/server/messaging';

describe('createTestUlakStub', () => {
  test('should expose the given path', () => {
    const stub = createTestUlakStub('/chat');

    expect(stub.path).toBe('/chat');
  });

  test('should default to root path', () => {
    const stub = createTestUlakStub();

    expect(stub.path).toBe('/');
  });

  test('should mock all namespace methods', async () => {
    const stub = createTestUlakStub('/chat');

    await stub.broadcast({ text: 'hello' });
    await stub.to('room-1', { text: 'hi' });
    await stub.toSocket('socket-1', { text: 'hey' });
    await stub.toMany(['room-1', 'room-2'], { text: 'all' });

    expect(stub.broadcast).toHaveBeenCalledWith({ text: 'hello' });
    expect(stub.to).toHaveBeenCalledWith('room-1', { text: 'hi' });
    expect(stub.toSocket).toHaveBeenCalledWith('socket-1', { text: 'hey' });
    expect(stub.toMany).toHaveBeenCalledWith(['room-1', 'room-2'], { text: 'all' });
    expect(stub.getSocketCount()).toBe(0);
  });

  test('should allow configuring mocks', () => {
    const stub = createTestUlakStub('/chat');

    stub.getSocketCount.mockReturnValue(3);

    expect(stub.getSocketCount()).toBe(3);
  });

  test('should satisfy the Ulak.NameSpace interface', () => {
    // Compile-time check: assignment fails if the stub drifts from the interface
    const namespace: Ulak.NameSpace<'/chat'> = createTestUlakStub('/chat');

    expect(namespace.path).toBe('/chat');
  });
});
