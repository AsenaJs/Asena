import { describe, expect, mock, test } from 'bun:test';
import { AsenaWebsocketAdapter } from '../../lib/adapter';
import type { ServerLogger } from '../../lib/logger';

const createLogger = () => ({
  info: mock(() => {}),
  warn: mock((_message: string, _meta?: any) => {}),
  error: mock(() => {}),
  profile: mock(() => {}),
});

class MinimalWebsocketAdapter extends AsenaWebsocketAdapter {
  public constructor(logger: ServerLogger) {
    super(logger);
  }

  public registerWebSocket(): void {}

  public prepareWebSocket(): void {}

  public startWebsocket(): void {}
}

class ClosingWebsocketAdapter extends MinimalWebsocketAdapter {
  public closedWith: number | undefined;

  public async shutdown(timeoutMs = 5000): Promise<void> {
    this.closedWith = timeoutMs;
  }
}

describe('AsenaWebsocketAdapter.shutdown', () => {
  test('default implementation resolves and warns that no connections were closed', async () => {
    const logger = createLogger();
    const adapter = new MinimalWebsocketAdapter(logger);

    await expect(adapter.shutdown(1000)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('MinimalWebsocketAdapter');
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('is callable through the abstract type and dispatches to the override', async () => {
    const logger = createLogger();
    const concrete = new ClosingWebsocketAdapter(logger);
    const adapter: AsenaWebsocketAdapter = concrete;

    await adapter.shutdown(250);

    expect(concrete.closedWith).toBe(250);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
