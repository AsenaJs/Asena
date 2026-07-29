import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServerFactory } from '../../lib/server';
import { Service } from '../../lib/server/decorators';
import { Implements, Inject, PostConstruct } from '../../lib/ioc/component';
import { ICoreServiceNames } from '../../lib/ioc';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';

const lifecycle: string[] = [];

@Service()
class MailService {
  public constructor() {
    lifecycle.push('MailService.constructor');
  }

  @PostConstruct()
  public async connect() {
    lifecycle.push('MailService.connect');
  }

  public async send(_to: string) {
    return 'sent for real';
  }
}

@Service()
class SignupService {
  @Inject(MailService)
  private mailService: MailService;

  public async signup(email: string) {
    return await this.mailService.send(email);
  }
}

@Service({ name: 'PaymentGateway' })
@Implements('IPaymentGateway')
class StripeGateway {
  public charge() {
    return 'stripe';
  }
}

const createServer = (overrides?: Record<string, object>, components: any[] = [MailService, SignupService]) =>
  AsenaServerFactory.create({
    adapter: createMockAdapter().adapter as any,
    logger: silentLogger,
    components,
    overrides,
  });

describe('AsenaServerFactory overrides', () => {
  beforeEach(() => {
    lifecycle.length = 0;
  });

  test('should inject the override into dependents', async () => {
    const double = { send: mock(async () => 'sent by double') };

    const server = await createServer({ MailService: double });
    const signup = await server.coreContainer.container.resolve<SignupService>('SignupService');

    // resolve() is typed `T | T[] | null` - a key can hold several @Implements candidates.
    // Narrowed rather than cast: a plain @Service must come back as exactly one instance, and
    // if that ever stops being true this throws instead of reading `.signup` off an array.
    if (signup === null || Array.isArray(signup)) throw new Error('expected a single SignupService instance');

    expect(await signup.signup('ada@example.com')).toBe('sent by double');
    expect(double.send).toHaveBeenCalledWith('ada@example.com');
  });

  test('should never construct the overridden class or run its @PostConstruct', async () => {
    await createServer({ MailService: { send: mock(async () => 'double') } });

    expect(lifecycle).toEqual([]);
  });

  test('should construct the real class when it is not overridden', async () => {
    const server = await createServer();

    // create() builds the graph; the start hook belongs to start(). Splitting the assertion is
    // the point of the change - a component is constructed during the scan but not initialised
    // until the server actually starts.
    expect(lifecycle).toEqual(['MailService.constructor']);

    await server.start();

    expect(lifecycle).toEqual(['MailService.constructor', 'MailService.connect']);

    await server.stop();
  });

  test('should leave non-overridden components untouched', async () => {
    const server = await createServer({ MailService: { send: mock(async () => 'double') } });

    expect(server.coreContainer.container.isOverridden('MailService')).toBe(true);
    expect(server.coreContainer.container.isOverridden('SignupService')).toBe(false);
  });

  test('should not register an overridden component under its @Implements interface', async () => {
    const server = await createServer({ PaymentGateway: { charge: () => 'double' } }, [StripeGateway]);

    expect(await server.coreContainer.container.resolve<{ charge: () => string }>('PaymentGateway')).toEqual({
      charge: expect.any(Function),
    });
    expect(server.coreContainer.container.has('IPaymentGateway')).toBe(false);
  });

  describe('core service guard', () => {
    test.each([ICoreServiceNames.CONTAINER, ICoreServiceNames.SERVER_LOGGER, ICoreServiceNames.__ULAK__])(
      'should refuse to override %s',
      async (coreName) => {
        await expect(createServer({ [coreName]: { anything: true } })).rejects.toThrow(
          `Cannot override core service '${coreName}'`,
        );
      },
    );

    test('should explain why core services cannot be overridden', async () => {
      await expect(createServer({ [ICoreServiceNames.CONTAINER]: {} })).rejects.toThrow(
        /bootstrap phases 1-5 and have already captured their dependencies/,
      );
    });
  });
});
