import { afterEach, describe, expect, mock, test } from 'bun:test';
import { AsenaServer, AsenaServerFactory } from '../../lib/server';
import { Controller, EventService, Service } from '../../lib/server/decorators';
import { Get } from '../../lib/server/web/decorators';
import { On } from '../../lib/server/event';
import type { EventEmitter } from '../../lib/server/event';
import { Container, ComponentType, ICoreServiceNames, IocEngine } from '../../lib/ioc';
import { Implements, Inject, OnStart, OnStop, Strategy } from '../../lib/ioc/component/decorators';
import { Scope } from '../../lib/ioc/component';
import { createMockAdapter } from '../utils/createMockContext';

const createLogger = (warnings: string[] = []) => ({
  info: mock(() => {}),
  error: mock(() => {}),
  warn: mock((message: string) => {
    warnings.push(String(message));
  }),
  profile: mock(() => {}),
});

const engineWithContainer = () => {
  const engine = new IocEngine();

  // IocEngine is a core service - its container normally arrives via DI
  (engine as any)['_container'] = new Container();

  return engine;
};

/**
 * `@Implements` registers a component under its name and its interface key. Both keys used to get
 * their own `Container.register()` call, and each call constructs a singleton - so the component
 * was built twice, its @OnStart and @OnStop ran twice, `@Inject` and `@Strategy` held different
 * objects, and every component scan (`resolveAll`) found it twice. The interface key is now an
 * alias of the name's entry: one instance, one lifecycle, one scan hit.
 */
describe('@Implements singleton', () => {
  let server: AsenaServer<any> | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  const boot = async (components: any[], logger = createLogger()) => {
    const { adapter } = createMockAdapter();

    (adapter as any).onError = mock(() => {});

    server = await AsenaServerFactory.create({
      adapter: adapter as any,
      logger: logger as any,
      port: 3000,
      components,
    });

    await server.start();

    return server;
  };

  test('is constructed once and shared by its name and its interface key', async () => {
    let constructed = 0;
    let started = 0;
    let stopped = 0;

    @Service()
    @Implements('IMailer')
    class SmtpMailer {
      public constructor() {
        constructed++;
      }

      @OnStart()
      public start() {
        started++;
      }

      @OnStop()
      public stop() {
        stopped++;
      }
    }

    @Service()
    class Notifier {
      @Inject(SmtpMailer)
      public byName: SmtpMailer;

      @Inject('IMailer')
      public byInterface: SmtpMailer;

      @Strategy('IMailer')
      public all: SmtpMailer[];
    }

    const app = await boot([SmtpMailer, Notifier]);
    const notifier = await app.resolve<Notifier>('Notifier');

    expect(constructed).toBe(1);
    expect(started).toBe(1);
    expect(notifier.byInterface).toBe(notifier.byName);
    expect(notifier.all).toHaveLength(1);
    expect(notifier.all[0]).toBe(notifier.byName);

    await app.stop();
    server = undefined;

    expect(stopped).toBe(1);
  });

  test('keeps one instance per implementation when several share an interface key', async () => {
    const constructed: string[] = [];

    @Service()
    @Implements('IChannel')
    class EmailChannel {
      public constructor() {
        constructed.push('email');
      }
    }

    @Service()
    @Implements('IChannel')
    class SmsChannel {
      public constructor() {
        constructed.push('sms');
      }
    }

    @Service()
    class Broadcaster {
      @Inject(EmailChannel)
      public email: EmailChannel;

      @Inject(SmsChannel)
      public sms: SmsChannel;

      @Strategy('IChannel')
      public channels: unknown[];
    }

    const app = await boot([EmailChannel, SmsChannel, Broadcaster]);
    const broadcaster = await app.resolve<Broadcaster>('Broadcaster');

    expect(constructed.sort()).toEqual(['email', 'sms']);
    expect(broadcaster.channels).toHaveLength(2);
    expect(broadcaster.channels).toContain(broadcaster.email);
    expect(broadcaster.channels).toContain(broadcaster.sms);
  });

  test('stays transient under both keys', async () => {
    @Service({ scope: Scope.PROTOTYPE })
    @Implements('IRequestScratch')
    class RequestScratch {}

    const engine = engineWithContainer();

    await engine.searchAndRegister([{ Class: RequestScratch, interface: 'IRequestScratch' }]);

    const first = await engine.container.resolve('RequestScratch');
    const second = await engine.container.resolve('RequestScratch');
    const viaInterface = await engine.container.resolve('IRequestScratch');

    expect(first).toBeInstanceOf(RequestScratch);
    expect(viaInterface).toBeInstanceOf(RequestScratch);
    expect(first).not.toBe(second);
    expect(viaInterface).not.toBe(first);
    expect(viaInterface).not.toBe(second);
  });

  test('is found once by a component scan', async () => {
    @Service()
    @Implements('IClock')
    class SystemClock {}

    @Service()
    @Implements('IClock')
    class FrozenClock {}

    const engine = engineWithContainer();

    await engine.searchAndRegister([
      { Class: SystemClock, interface: 'IClock' },
      { Class: FrozenClock, interface: 'IClock' },
    ]);

    const scanned = ((await engine.container.resolveAll<object>(ComponentType.SERVICE)) ?? []).flat();

    expect(scanned).toHaveLength(2);
    expect(new Set(scanned.map((instance) => instance.constructor))).toEqual(new Set([SystemClock, FrozenClock]));
  });

  test('runs an @On handler once per event', async () => {
    let calls = 0;

    @EventService()
    @Implements('IAuditTrail')
    class AuditTrail {
      @On('order.placed')
      public record() {
        calls++;
      }
    }

    const app = await boot([AuditTrail]);
    const emitter = await app.coreContainer.resolve<EventEmitter>(ICoreServiceNames.EVENT_EMITTER);

    emitter.emit('order.placed', { id: 1 });

    expect(calls).toBe(1);
  });

  test('is named once in the headless HTTP-only warning', async () => {
    const warnings: string[] = [];

    @Controller('/reports')
    @Implements('IReportApi')
    class ReportController {
      @Get({ path: '/' })
      public list() {}
    }

    server = await AsenaServerFactory.create({
      headless: true,
      logger: createLogger(warnings) as any,
      components: [ReportController],
    });

    await server.start();

    const warning = warnings.find((message) => message.includes('require an HTTP adapter'));

    expect(warning).toBeDefined();
    expect(warning!.match(/ReportController/g)).toHaveLength(1);
  });

  test('gives the interface key a test double without constructing the real class there', async () => {
    let constructed = 0;

    @Service()
    @Implements('IPaymentGateway')
    class StripeGateway {
      public constructor() {
        constructed++;
      }
    }

    const engine = engineWithContainer();
    const double = { charge: () => 'double' };

    engine.container.overrideInstance('IPaymentGateway', double);

    await engine.searchAndRegister([{ Class: StripeGateway, interface: 'IPaymentGateway' }]);

    expect(constructed).toBe(1);
    expect(await engine.container.resolve('IPaymentGateway')).toBe(double);
    expect(await engine.container.resolve('StripeGateway')).toBeInstanceOf(StripeGateway);
  });
});
