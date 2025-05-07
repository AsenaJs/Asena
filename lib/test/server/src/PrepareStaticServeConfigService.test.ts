import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrepareStaticServeConfigService } from '../../../server/src/services/PrepareStaticServeConfigService';
import { Override, StaticServe } from '../../../server/decorators';
import { AsenaStaticServeService } from '../../../server/web/middleware';
import type { AsenaContext } from '../../../adapter';

@StaticServe({ root: './public', name: 'StaticServe' })
export class MockStaticServeMiddleware extends AsenaStaticServeService<any> {

  public extra = { foo: 'bar' };

  public rewriteRequestPath(path: string): string {
    return `/rewritten${path}`;
  }

  public onFound(_path: string, _c: AsenaContext<any, any>): void | Promise<void> {
    console.log('Yes you found the file ');
  }

  @Override()
  public onNotFound(path: string, c: AsenaContext<any, any>): void | Promise<void> {
    console.log(`${path} is not found, you access ${c.req.path}`);
  }

}

describe('PrepareStaticServeConfigService', () => {
  let service: PrepareStaticServeConfigService;
  let mockContainer: any;
  let mockStaticServe: MockStaticServeMiddleware;

  beforeEach(() => {
    mockStaticServe = new MockStaticServeMiddleware();
    mockContainer = {
      resolve: mock(() => mockStaticServe),
    };

    const mockLogger = {
      info: mock(() => {}),
    };

    service = new PrepareStaticServeConfigService(mockContainer as any, mockLogger as any);
  });

  afterEach(() => {
    mock.restore();
  });

  it('should return undefined when staticServeClass is not provided', async () => {
    const result = await service.prepare(null);

    expect(result).toBeUndefined();
  });

  it('should throw error when service is not found', async () => {
    mockContainer.resolve = mock(() => null);

    expect(service.prepare(MockStaticServeMiddleware)).rejects.toThrow('Static Serve service StaticServe not found.');
  });

  it('should throw error when service is an array', async () => {
    mockContainer.resolve = mock(() => []);

    expect(service.prepare({} as any)).rejects.toThrow('Static serve service cannot be array');
  });

  it('should prepare static serve config with all properties', async () => {
    const result = await service.prepare(MockStaticServeMiddleware);

    expect(result).toEqual({
      extra: { foo: 'bar' },
      root: './public',
      rewriteRequestPath: expect.any(Function),
      onFound: {
        handler: expect.any(Function),
        override: false,
      },
      onNotFound: {
        handler: expect.any(Function),
        override: true,
      },
    });
  });

  it('should prepare static serve config without optional properties', async () => {
    mockStaticServe.extra = undefined;
    mockStaticServe.rewriteRequestPath = undefined;
    mockStaticServe.onFound = undefined;
    mockStaticServe.onNotFound = undefined;
    mockContainer.resolve = mock(() => mockStaticServe);

    const result = await service.prepare(MockStaticServeMiddleware);

    expect(result).toEqual({
      extra: undefined,
      root: './public',
      rewriteRequestPath: undefined,
      onFound: undefined,
      onNotFound: undefined,
    });
  });
});
