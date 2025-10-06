import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { PrepareValidatorService } from '../../../server/src/services/PrepareValidatorService';
import type { BaseValidator } from '../../../adapter';
import { Middleware, Override } from '../../../server/decorators';
import type { AsenaValidationService } from '../../../server/web/middleware';

@Middleware({ validator: true })
export class TestValidator implements AsenaValidationService<any> {

  public asenaIsGoodFrameWork = true;

  public json(): boolean {
    return true;
  }

  @Override()
  public header(): any {
    return 'hello';
  }

  public shouldNotBeHere(): boolean {
    return false;
  }

}

describe('PrepareValidatorService', () => {
  let service: PrepareValidatorService;
  let mockContainer: any;
  let mockValidator: TestValidator;

  beforeEach(() => {
    mockValidator = new TestValidator();

    mockContainer = {
      resolve: mock(() => mockValidator),
    };

    service = new PrepareValidatorService();
    // Manually inject dependencies for testing (field injection)
    (service as any)['container'] = mockContainer;
  });

  it('should return undefined when validator is not provided', async () => {
    const result = await service.prepare(null);

    expect(result).toBeUndefined();
  });

  it('should throw error when validator is not found', async () => {
    mockContainer.resolve = mock(() => null);

    expect(service.prepare(TestValidator)).rejects.toThrow('Validator not found:TestValidator');
  });

  it('should throw error when validator is an array', async () => {
    mockContainer.resolve = mock(() => []);

    expect(service.prepare({} as any)).rejects.toThrow('Validator cannot be array');
  });

  it('should prepare validator with all method handlers', async () => {
    const result: BaseValidator<any> = await service.prepare({} as any);

    expect(result).toEqual({
      json: {
        handle: expect.any(Function),
        override: false,
      },
      header: {
        handle: expect.any(Function),
        override: true,
      },
    });

    expect(result.json.handle.name).toBe('bound json');
    expect(result.header.handle.name).toBe('bound header');
  });

  it('should only include methods that exist on validator', async () => {
    // Create validator with only one method

    mockContainer.resolve = mock(() => mockValidator);

    const result = await service.prepare({} as any);

    expect(result).toHaveProperty('json');
    expect(result).not.toHaveProperty('shouldNotBeHere');
  });

  it('should not include non-function properties', async () => {
    mockContainer.resolve = mock(() => mockValidator);

    const result = await service.prepare({} as any);

    expect(result).toHaveProperty('json');
    expect(result).not.toHaveProperty('asenaIsGoodFrameWork');
  });
});
