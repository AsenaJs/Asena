import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { PrepareMiddlewareService } from '../../../lib/server/src/services/PrepareMiddlewareService';
import type { MiddlewareClass } from '../../../lib/server/web/middleware';
import { AsenaMiddlewareService } from '../../../lib/server/web/middleware';
import { Middleware, Override } from '../../../lib/server/decorators';

@Middleware()
class TestMiddleware extends AsenaMiddlewareService {
  @Override()
  public handle(_c: any, next: any): void {
    next();
  }
}

@Middleware()
class TestMiddleware2 extends AsenaMiddlewareService {
  public handle(_c: any, next: any): void {
    next();
  }
}

describe('PrepareMiddlewareService', () => {
  const mockContainer = {
    resolve: mock(() => null),
  };

  const mockLogger = {
    info: mock(() => {}),
  };

  let service: PrepareMiddlewareService;
  let middlewareClasses: MiddlewareClass[];

  beforeEach(() => {
    mockContainer.resolve.mockClear();
    mockLogger.info.mockClear();
    service = new PrepareMiddlewareService();
    // Manually inject dependencies for testing (field injection)
    (service as any)['container'] = mockContainer;
    middlewareClasses = [TestMiddleware, TestMiddleware2];
  });

  test('should return empty array when no middleware classes are provided', async () => {
    const result = await service.prepare([]);

    expect(result).toEqual([]);
  });

  test('should skip middleware when instance is not resolved', async () => {
    mockContainer.resolve.mockImplementation(() => null);

    const result = await service.prepare(middlewareClasses);

    expect(mockContainer.resolve).toHaveBeenCalledWith('TestMiddleware');
    expect(result).toEqual([]);
  });

  test('should prepare a single middleware instance', async () => {
    const middlewareInstance = new TestMiddleware2();
    const handleSpy = mock(middlewareInstance.handle);

    middlewareInstance.handle = handleSpy;

    mockContainer.resolve.mockImplementation(() => middlewareInstance);

    const result = await service.prepare(middlewareClasses);

    expect(mockContainer.resolve).toHaveBeenCalledWith('TestMiddleware2');
    expect(result).toHaveLength(2);
    expect(result[1].override).toBe(false);
    expect(typeof result[1].handle).toBe('function');
  });

  test('should handle array of middleware instances', async () => {
    const middlewareInstance1 = new TestMiddleware();
    const middlewareInstance2 = new TestMiddleware();

    mockContainer.resolve.mockImplementation(() => [middlewareInstance1, middlewareInstance2]);

    const result = await service.prepare(middlewareClasses);

    expect(result).toHaveLength(4);
    expect(typeof result[0].handle).toBe('function');
    expect(typeof result[1].handle).toBe('function');
  });

  test('should set override flag when middleware has override metadata', async () => {
    const middlewareInstance = new TestMiddleware();

    mockContainer.resolve.mockImplementation(() => middlewareInstance);

    const result = await service.prepare(middlewareClasses);

    expect(result).toHaveLength(2);
    expect(result[0].override).toBe(true);
  });
});
