import { describe, expect, test } from 'bun:test';
import { normalizeTransportConfig } from '../../../lib/server/config/AsenaConfig';
import { InMemoryTransport, DEFAULT_TRANSPORT_NAME } from '../../../lib/server/microservice';
import type { WebSocketTransport } from '../../../lib/server/web/websocket';

const fakeWsTransport: WebSocketTransport = {
  publish: () => {},
};

describe('normalizeTransportConfig', () => {
  test('should treat bare WebSocketTransport as legacy form', async () => {
    const normalized = await normalizeTransportConfig(fakeWsTransport);

    expect(normalized.websocket).toBe(fakeWsTransport);
    expect(normalized.microservices.size).toBe(0);
    expect(normalized.interceptors).toEqual([]);
  });

  test('should register single microservice transport under default name', async () => {
    const transport = new InMemoryTransport();

    const normalized = await normalizeTransportConfig({ microservice: transport });

    expect(normalized.microservices.get(DEFAULT_TRANSPORT_NAME)).toBe(transport);
    expect(normalized.websocket).toBeUndefined();
  });

  test('should accept a named transport map', async () => {
    const primary = new InMemoryTransport();
    const analytics = new InMemoryTransport();

    const normalized = await normalizeTransportConfig({
      microservice: { default: primary, analytics },
    });

    expect(normalized.microservices.size).toBe(2);
    expect(normalized.microservices.get('default')).toBe(primary);
    expect(normalized.microservices.get('analytics')).toBe(analytics);
  });

  test('should accept object form with both websocket and microservice', async () => {
    const transport = new InMemoryTransport();

    const normalized = await normalizeTransportConfig({
      websocket: fakeWsTransport,
      microservice: transport,
    });

    expect(normalized.websocket).toBe(fakeWsTransport);
    expect(normalized.microservices.get(DEFAULT_TRANSPORT_NAME)).toBe(transport);
  });

  test('should await promised values', async () => {
    const transport = new InMemoryTransport();

    const normalized = await normalizeTransportConfig({
      websocket: Promise.resolve(fakeWsTransport),
      microservice: Promise.resolve(transport),
    });

    expect(normalized.websocket).toBe(fakeWsTransport);
    expect(normalized.microservices.get(DEFAULT_TRANSPORT_NAME)).toBe(transport);
  });

  test('should carry interceptors through', async () => {
    const interceptor = { onSend: async (_ctx: any, next: () => Promise<any>) => next() };

    const normalized = await normalizeTransportConfig({
      microservice: new InMemoryTransport(),
      interceptors: [interceptor],
    });

    expect(normalized.interceptors).toEqual([interceptor]);
  });

  test('should throw for an object without any known field', async () => {
    // e.g. accidentally returning a bare MicroserviceTransport (no publish function)
    expect(normalizeTransportConfig({ foo: 'bar' } as any)).rejects.toThrow(/websocket\/microservice\/interceptors/);
  });
});
