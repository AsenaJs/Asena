import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { PrepareMiddlewareService } from '../../../server/src/services/PrepareMiddlewareService';
import { ComponentConstants } from '../../../ioc/constants';
import type { MiddlewareClass } from '../../../server/web/middleware';
import { AsenaMiddlewareService } from '../../../server/web/middleware';
import { Middleware } from '../../../server/decorators';

@Middleware()
class TestMiddleware extends AsenaMiddlewareService {

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
    service = new PrepareMiddlewareService(mockContainer as any, mockLogger as any);
    middlewareClasses = [TestMiddleware as any];
  });

  test('should return empty array when no middleware classes are provided', async () => {
    const result = await service.prepare([]);

    expect(result).toEqual([]);
  });

  test('should skip middleware when instance is not resolved', async () => {
    mockContainer.resolve.mockImplementation(() => null);

    const getTypedMetadataMock = mock().mockReturnValue('TestMiddleware');

    mock.module('../../../utils/typedMetadata', () => {
      return {
        getTypedMetadata: getTypedMetadataMock,
      };
    });

    const result = await service.prepare(middlewareClasses);

    expect(mockContainer.resolve).toHaveBeenCalledWith('TestMiddleware');
    expect(result).toEqual([]);
  });

  test('should prepare a single middleware instance', async () => {
    const middlewareInstance = new TestMiddleware();
    const handleSpy = mock(middlewareInstance.handle);

    middlewareInstance.handle = handleSpy;

    mockContainer.resolve.mockImplementation(() => middlewareInstance);

    const getTypedMetadataMock = mock()
      .mockImplementationOnce(() => 'TestMiddleware') // For name
      .mockImplementationOnce(() => null); // For override

    mock.module('../../../utils/typedMetadata', () => {
      return {
        getTypedMetadata: getTypedMetadataMock,
      };
    });

    const result = await service.prepare(middlewareClasses);

    expect(mockContainer.resolve).toHaveBeenCalledWith('TestMiddleware');
    expect(getTypedMetadataMock).toHaveBeenCalledWith(ComponentConstants.NameKey, TestMiddleware);
    expect(getTypedMetadataMock).toHaveBeenCalledWith(ComponentConstants.OverrideKey, TestMiddleware);
    expect(result).toHaveLength(1);
    expect(result[0].override).toBe(false);
    expect(typeof result[0].handle).toBe('function');
  });

  test('should handle array of middleware instances', async () => {
    const middlewareInstance1 = new TestMiddleware();
    const middlewareInstance2 = new TestMiddleware();

    mockContainer.resolve.mockImplementation(() => [middlewareInstance1, middlewareInstance2]);

    const getTypedMetadataMock = mock()
      .mockImplementationOnce(() => 'TestMiddleware') // For name
      .mockImplementationOnce(() => null); // For override

    mock.module('../../../utils/typedMetadata', () => {
      return {
        getTypedMetadata: getTypedMetadataMock,
      };
    });

    const result = await service.prepare(middlewareClasses);

    expect(result).toHaveLength(2);
    expect(typeof result[0].handle).toBe('function');
    expect(typeof result[1].handle).toBe('function');
  });

  test('should set override flag when middleware has override metadata', async () => {
    const middlewareInstance = new TestMiddleware();

    mockContainer.resolve.mockImplementation(() => middlewareInstance);

    const getTypedMetadataMock = mock()
      .mockImplementationOnce(() => 'TestMiddleware') // For name
      .mockImplementationOnce(() => ['handle']); // For override with 'handle'

    mock.module('../../../utils/typedMetadata', () => {
      return {
        getTypedMetadata: getTypedMetadataMock,
      };
    });

    const result = await service.prepare(middlewareClasses);

    expect(result).toHaveLength(1);
    expect(result[0].override).toBe(true);
  });
});
