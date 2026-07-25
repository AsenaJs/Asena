import { describe, expect, test } from 'bun:test';

/**
 * Guards the "./test" entry in the package export map.
 *
 * Every other file under test/test imports from lib/ directly so a stale build cannot hide a
 * regression. This one deliberately goes through the public specifier instead, which resolves
 * to dist/. It therefore also fails when the export map drifts or the build is missing - which
 * is exactly what a consumer would hit.
 */
describe('@asenajs/asena/test public exports', () => {
  test('exposes the documented test utilities', async () => {
    const publicApi = await import('@asenajs/asena/test');

    expect(typeof publicApi.mockComponent).toBe('function');
    expect(typeof publicApi.mockComponentAsync).toBe('function');
    expect(typeof publicApi.createMockFromClass).toBe('function');
    expect(typeof publicApi.createDeepMock).toBe('function');
    expect(typeof publicApi.createTestUlakStub).toBe('function');
    expect(typeof publicApi.discoverInjectedFields).toBe('function');
    expect(typeof publicApi.discoverInjectedFieldsFromClass).toBe('function');
  });

  test('exposes the integration test harness', async () => {
    const publicApi = await import('@asenajs/asena/test');

    expect(typeof publicApi.createTestApp).toBe('function');
    expect(typeof publicApi.createWebTest).toBe('function');
    expect(typeof publicApi.createCapturingLogger).toBe('function');
    expect(typeof publicApi.TestHttpCall).toBe('function');
    expect(typeof publicApi.TestHttpResponse).toBe('function');
    expect(publicApi.silentLogger).toMatchObject({
      info: expect.any(Function),
      warn: expect.any(Function),
      error: expect.any(Function),
      profile: expect.any(Function),
    });
  });
});
