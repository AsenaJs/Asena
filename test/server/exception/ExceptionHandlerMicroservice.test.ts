import { describe, expect, test } from 'bun:test';
import { Config, ExceptionHandler, MessageController } from '../../../lib/server/decorators';
import { Catch, type ExceptionContext } from '../../../lib/server/exception';
import {
  EventPattern,
  InMemoryTransport,
  MessagePattern,
  type EventPatternHandler,
  type MessageContext,
  type MessageHandler,
  type MessagingInterceptor,
  type MicroserviceTransport,
} from '../../../lib/server/microservice';
import { UlakError, UlakErrorCode } from '../../../lib/server/messaging';
import { bootExceptionApp, createLogger } from './bootHelper';

abstract class DomainError extends Error {}

class OutOfStock extends DomainError {}

class Unrelated extends Error {}

/** Keeps the registered handlers so a test can invoke one and see exactly what the transport would. */
class RecordingTransport implements MicroserviceTransport {
  public readonly name = 'recording';

  public readonly isConnected = true;

  public readonly messages = new Map<string, MessageHandler>();

  public readonly events = new Map<string, EventPatternHandler>();

  public async init(): Promise<void> {}

  public registerMessageHandler(pattern: string, handler: MessageHandler): void {
    this.messages.set(pattern, handler);
  }

  public registerEventHandler(pattern: string, handler: EventPatternHandler): void {
    this.events.set(pattern, handler);
  }

  public async listen(): Promise<void> {}

  public async send<T>(): Promise<T> {
    throw new Error('not used');
  }

  public async emit(): Promise<void> {}

  public async destroy(): Promise<void> {}
}

const messageContext = (pattern: string): MessageContext => ({
  pattern,
  messageId: 'm-1',
  headers: {},
  timestamp: 0,
  attempt: 1,
});

const bootWith = async (
  transport: MicroserviceTransport,
  components: any[],
  interceptors: MessagingInterceptor[] = [],
) => {
  @Config()
  class TransportConfig {
    public transport() {
      return { microservice: { orders: transport }, interceptors };
    }
  }

  return bootExceptionApp([TransportConfig, ...components]);
};

const returnValueWarnings = (logger: ReturnType<typeof createLogger>) =>
  (logger.warn.mock.calls as unknown[][])
    .map(([message]) => String(message))
    .filter((message) => message.includes('has no effect in event scopes'));

const responseReplyWarnings = (logger: ReturnType<typeof createLogger>) =>
  (logger.warn.mock.calls as unknown[][])
    .map(([message]) => String(message))
    .filter((message) => message.includes('returned a Response for @MessagePattern'));

describe('@Catch for @MessagePattern', () => {
  test('turns a matched failure into the reply, with the microservice context', async () => {
    const transport = new InMemoryTransport();
    const failure = new OutOfStock('sku-1');
    const seen: ExceptionContext[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock(error: Error, ctx: ExceptionContext) {
        seen.push(ctx);
        return { error: error.message };
      }
    }

    @MessageController({ prefix: 'order', transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderHandler]);

    expect(await transport.send('order.create', { sku: 'sku-1' }, { headers: { trace: 't' } })).toEqual({
      error: 'sku-1',
    });
    expect(returnValueWarnings(logger)).toHaveLength(0);

    const [ctx] = seen;

    expect(ctx).toMatchObject({
      scope: 'microservice',
      kind: 'message',
      data: { sku: 'sku-1' },
      source: 'OrderHandler.create',
      transport: 'orders',
    });
    expect((ctx as any).message).toMatchObject({ pattern: 'order.create', headers: { trace: 't' } });
  });

  test('catches a synchronous throw too', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return 'fallback';
      }
    }

    @MessageController({ prefix: 'order', transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public create() {
        throw new OutOfStock();
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    expect(await transport.send('order.create')).toBe('fallback');
  });

  test('names the handler by component name, as the devtools snapshot does', async () => {
    const transport = new RecordingTransport();
    const sources: string[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock(_error: Error, ctx: ExceptionContext) {
        sources.push((ctx as { source: string }).source);
        return 'fallback';
      }
    }

    @MessageController({ name: 'Orders', transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public create() {
        throw new OutOfStock();
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);
    await transport.messages.get('create')!({}, messageContext('create'));

    expect(sources).toEqual(['Orders.create']);
  });

  test('resolves the most specific type along the prototype chain', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(DomainError)
      public domain() {
        return 'domain';
      }

      @Catch(Error)
      public generic() {
        return 'generic';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('stock')
      public async stock() {
        throw new OutOfStock();
      }

      @MessagePattern('other')
      public async other() {
        throw new Unrelated();
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    expect(await transport.send('stock')).toBe('domain');
    expect(await transport.send('other')).toBe('generic');
  });

  test('leaves an unmatched failure to the transport, untouched', async () => {
    const transport = new RecordingTransport();
    const failure = new Unrelated('nobody catches this');

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return 'never';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('sync')
      public sync() {
        throw failure;
      }

      @MessagePattern('async')
      public async async() {
        throw failure;
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    expect(() => transport.messages.get('sync')!({}, messageContext('sync'))).toThrow(failure);
    await expect(transport.messages.get('async')!({}, messageContext('async'))).rejects.toBe(failure);
  });

  test('keeps the in-memory REMOTE_ERROR reply for an unmatched failure', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return 'never';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new Unrelated('boom');
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    const error = await transport.send<never>('create').catch((caught: UlakError) => caught);

    expect(error).toBeInstanceOf(UlakError);
    expect(error.code).toBe(UlakErrorCode.REMOTE_ERROR);
    expect(error.message).toBe('Handler for pattern "create" failed: boom');
  });

  test('a @Catch that returns nothing declines, so the original error is the reply', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();
    let reached = false;

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        reached = true;
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw failure;
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    await expect(transport.messages.get('create')!({}, messageContext('create'))).rejects.toBe(failure);
    expect(reached).toBe(true);
  });

  // A Response serialized as a reply would reach the caller as a success, hiding the failure.
  test('a @Catch returning a Response declines with a warning, so the transport sees the original error', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return Response.json({ error: 'out of stock' }, { status: 409 });
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderHandler]);

    await expect(transport.messages.get('create')!({}, messageContext('create'))).rejects.toBe(failure);
    await expect(transport.messages.get('create')!({}, messageContext('create'))).rejects.toBe(failure);

    const warnings = responseReplyWarnings(logger);

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Errors.outOfStock()');
    expect(warnings[0]).toContain('OrderHandler.create()');
  });

  test('a @Catch returning a Response leaves the caller with a failed reply, not a successful one', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return new Response('out of stock', { status: 409 });
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new OutOfStock('sku-1');
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    const error = await transport.send<never>('create').catch((caught: UlakError) => caught);

    expect(error).toBeInstanceOf(UlakError);
    expect(error.code).toBe(UlakErrorCode.REMOTE_ERROR);
    expect(error.message).toBe('Handler for pattern "create" failed: sku-1');
  });

  test('a @Catch returning a plain object keeps it as the reply, with no warning', async () => {
    const transport = new RecordingTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return { status: 409, error: 'out of stock' };
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new OutOfStock();
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderHandler]);
    const warningsAtBoot = logger.warn.mock.calls.length;

    expect(await transport.messages.get('create')!({}, messageContext('create'))).toEqual({
      status: 409,
      error: 'out of stock',
    });
    expect(logger.warn.mock.calls.length).toBe(warningsAtBoot);
  });

  test('logs the original error at debug level when a @Catch replies, since the transport never sees it', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock('sku-1');

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return { error: 'out of stock' };
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderHandler]);

    await transport.messages.get('create')!({}, messageContext('create'));

    const lines = (logger.debug.mock.calls as unknown[][]).filter(([message]) => String(message).includes('@Catch'));

    expect(lines).toEqual([[expect.stringContaining('Errors.outOfStock()'), failure]]);
  });

  test('a @Catch that throws replaces the failure: the transport sees the error the @Catch threw', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock('original');
    const handlerFailure = new Error('handler broke');

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public async outOfStock() {
        throw handlerFailure;
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public create() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderHandler]);

    await expect(transport.messages.get('create')!({}, messageContext('create'))).rejects.toBe(handlerFailure);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('a @Catch that throws a sanitized error keeps the original message from the caller', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        throw new Error('Service unavailable');
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new OutOfStock('insert into stock violates constraint stock_sku_fkey');
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    const error = await transport.send<never>('create').catch((caught: UlakError) => caught);

    expect(error.code).toBe(UlakErrorCode.REMOTE_ERROR);
    expect(error.message).toBe('Handler for pattern "create" failed: Service unavailable');
  });

  test('a @Catch returning null replies null: only undefined declines', async () => {
    const transport = new InMemoryTransport();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return null;
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new OutOfStock();
      }
    }

    await bootWith(transport, [Errors, OrderHandler]);

    expect(await transport.send('create')).toBeNull();
  });

  test('sits outside the interceptor chain, so an interceptor still sees the failure', async () => {
    const transport = new InMemoryTransport();
    const observed: unknown[] = [];

    const interceptor: MessagingInterceptor = {
      async onReceive(_ctx, next) {
        try {
          return await next();
        } catch (error) {
          observed.push(error);
          throw error;
        }
      },
    };

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return 'recovered';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public async create() {
        throw new OutOfStock();
      }
    }

    await bootWith(transport, [Errors, OrderHandler], [interceptor]);

    expect(await transport.send('create')).toBe('recovered');
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(OutOfStock);
  });
});

describe('@Catch for @EventPattern', () => {
  test('a @Catch returning a value only observes: the transport still sees the original, with a warning', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();
    const seen: ExceptionContext[] = [];

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock(_error: unknown, ctx: ExceptionContext) {
        seen.push(ctx);
        return 'handled';
      }
    }

    @MessageController({ prefix: 'order', transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public async shipped() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderEvents]);

    const context = messageContext('order.shipped');

    await expect(transport.events.get('order.shipped')!({ id: 3 }, context)).rejects.toBe(failure);
    expect(returnValueWarnings(logger)).toHaveLength(1);
    expect(returnValueWarnings(logger)[0]).toContain('Errors.outOfStock()');
    expect(seen).toEqual([
      {
        scope: 'microservice',
        kind: 'event',
        message: context,
        data: { id: 3 },
        source: 'OrderEvents.shipped',
        transport: 'orders',
      },
    ]);
  });

  test('does not route a failure the @Catch itself published back into @Catch, so it cannot loop', async () => {
    const transport = new InMemoryTransport();
    const auditDown = new Error('audit down');
    const cap = 50;
    let catches = 0;

    @ExceptionHandler()
    class Errors {
      @Catch()
      public async fallback() {
        catches += 1;

        if (catches < cap) {
          await transport.emit('audit.failed');
        }
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('order.shipped')
      public async shipped() {
        throw new OutOfStock();
      }

      @EventPattern('audit.failed')
      public async audit() {
        throw auditDown;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderEvents]);

    await transport.emit('order.shipped');

    expect(catches).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Errors.fallback()'), auditDown);
  });

  test('a @Catch that returns nothing declines, so the transport still sees the original failure', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {}
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public async shipped() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderEvents]);

    await expect(transport.events.get('shipped')!({}, messageContext('shipped'))).rejects.toBe(failure);
    expect(returnValueWarnings(logger)).toHaveLength(0);
  });

  test('observes a synchronous throw too, and still rethrows the original', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();
    let reached = false;

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        reached = true;
        return 'handled';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public shipped() {
        throw failure;
      }
    }

    await bootWith(transport, [Errors, OrderEvents]);

    await expect(transport.events.get('shipped')!({}, messageContext('shipped'))).rejects.toBe(failure);
    expect(reached).toBe(true);
  });

  test('leaves an unmatched failure to the transport', async () => {
    const transport = new RecordingTransport();
    const failure = new Unrelated();

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        return 'never';
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public shipped() {
        throw failure;
      }
    }

    await bootWith(transport, [Errors, OrderEvents]);

    expect(() => transport.events.get('shipped')!({}, messageContext('shipped'))).toThrow(failure);
  });

  test('a @Catch that throws is contained: its error is logged and the transport sees the original', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();
    const handlerFailure = new Error('handler broke');

    @ExceptionHandler()
    class Errors {
      @Catch(DomainError)
      public async domain() {
        throw handlerFailure;
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public async shipped() {
        throw failure;
      }
    }

    const { logger } = await bootWith(transport, [Errors, OrderEvents]);

    await expect(transport.events.get('shipped')!({}, messageContext('shipped'))).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledWith(
      '@Catch handler Errors.domain() threw an error, falling back to the framework default:',
      handlerFailure,
    );
    expect(returnValueWarnings(logger)).toHaveLength(0);
  });
});

describe('when containing a throwing @Catch fails too', () => {
  test('the transport still sees the original @EventPattern failure', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();
    const logger = createLogger();

    logger.error.mockImplementation(() => {
      throw new Error('logger down');
    });

    @ExceptionHandler()
    class Errors {
      @Catch(OutOfStock)
      public outOfStock() {
        throw new Error('handler broke');
      }
    }

    @MessageController({ transport: 'orders' })
    class OrderEvents {
      @EventPattern('shipped')
      public async shipped() {
        throw failure;
      }
    }

    @Config()
    class TransportConfig {
      public transport() {
        return { microservice: { orders: transport } };
      }
    }

    await bootExceptionApp([TransportConfig, Errors, OrderEvents], { logger });

    await expect(transport.events.get('shipped')!({}, messageContext('shipped'))).rejects.toBe(failure);
  });
});

describe('with no @Catch declared', () => {
  test('hands the transport the handler unwrapped', async () => {
    const transport = new RecordingTransport();
    const failure = new OutOfStock();

    @MessageController({ transport: 'orders' })
    class OrderHandler {
      @MessagePattern('create')
      public create() {
        throw failure;
      }
    }

    await bootWith(transport, [OrderHandler]);

    expect(() => transport.messages.get('create')!({}, messageContext('create'))).toThrow(failure);
  });
});
