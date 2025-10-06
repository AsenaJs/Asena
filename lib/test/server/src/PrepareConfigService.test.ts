import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { PrepareConfigService } from '../../../server/src/services/PrepareConfigService';
import { ComponentType } from '../../../ioc/types';
import type { AsenaConfig } from '../../../server/config';
import { Config } from '../../../server/decorators';
import { yellow } from '../../../logger';

@Config()
class TestConfig implements AsenaConfig {}

describe('PrepareConfigService', () => {
  const mockContainer = {
    resolveAll: mock(() => []),
  };

  const mockLogger = {
    info: mock(() => {}),
  };

  let service: PrepareConfigService;

  beforeEach(() => {
    mockContainer.resolveAll.mockClear();
    mockLogger.info.mockClear();
    service = new PrepareConfigService();
    // Manually inject dependencies for testing (field injection)
    (service as any)['container'] = mockContainer;
    (service as any)['logger'] = mockLogger;
  });

  test('should return undefined when no config is found', async () => {
    mockContainer.resolveAll.mockImplementation(() => []);

    const result = await service.prepare();

    expect(mockContainer.resolveAll).toHaveBeenCalledWith(ComponentType.CONFIG);
    expect(mockLogger.info).toHaveBeenCalledWith('No configs found');
    expect(result).toBeUndefined();
  });

  test('should throw an error when multiple configs are found', async () => {
    mockContainer.resolveAll.mockImplementation(() => [{} satisfies AsenaConfig, {} satisfies AsenaConfig]);

    expect(service.prepare()).rejects.toThrow('Only one config is allowed');
    expect(mockContainer.resolveAll).toHaveBeenCalledWith(ComponentType.CONFIG);
  });

  test('should throw an error when config is an array', async () => {
    mockContainer.resolveAll.mockImplementation(() => [[]] as any);

    expect(service.prepare()).rejects.toThrow('Config cannot be array');
    expect(mockContainer.resolveAll).toHaveBeenCalledWith(ComponentType.CONFIG);
  });

  test('should return a valid config when found', async () => {
    const mockConfig = new TestConfig();

    mockContainer.resolveAll.mockImplementation(() => [mockConfig]);

    const result = await service.prepare();

    expect(mockContainer.resolveAll).toHaveBeenCalledWith(ComponentType.CONFIG);
    expect(mockLogger.info).toHaveBeenCalledWith(`AsenaConfig service found ${yellow('TestConfig')}`);
    expect(result).toBe(mockConfig);
  });

  test('should return when config not found in instance object', async () => {
    mockContainer.resolveAll.mockImplementation(() => [undefined]);

    const result = await service.prepare();

    expect(mockLogger.info).toHaveBeenCalledWith(`Config instance not found`);
    expect(result).toBe(undefined);
  });
});
