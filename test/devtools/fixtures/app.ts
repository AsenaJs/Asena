import type { AsenaContext, AsenaNextHandler } from '../../../lib/adapter';
import { ConflictException } from '../../../lib/adapter/types/HttpStatusExceptions';
import {
  ASENA_CONTEXT_ADAPTER,
  ASENA_CONTEXT_CONTRACT,
  defineRequestSchemas,
  type RequestSchema,
} from '../../../lib/adapter/RequestContract';
import { Implements, Inject, Scope, Strategy, Value } from '../../../lib/ioc/component';
import type { ComponentPostProcessor } from '../../../lib/ioc';
import {
  Config,
  Controller,
  EventService,
  ExceptionHandler,
  FrontendController,
  MessageController,
  Middleware,
  PostProcessor,
  Schedule,
  Service,
  StaticServe,
  WebSocket,
} from '../../../lib/server/decorators';
import { Get, Page, Post, Put } from '../../../lib/server/web/decorators';
import { AsenaStaticServeService } from '../../../lib/server/web/middleware';
import { AsenaWebSocketService } from '../../../lib/server/web/websocket';
import { On } from '../../../lib/server/event';
import { EventPattern, InMemoryTransport, MessagePattern } from '../../../lib/server/microservice';
import { Catch, NotFound } from '../../../lib/server/exception';
import type { AsenaSchedule } from '../../../lib/server/schedule';

export class ItemError extends Error {}

export class ItemMissing extends ItemError {}

export class ItemRejected extends ItemError {}

export class ItemConflict extends ConflictException {}

const acceptAnything: RequestSchema = {
  '~standard': { version: 1, vendor: 'fixture', validate: (value) => ({ value }) },
};

export class RenameItemContext {
  public static readonly [ASENA_CONTEXT_CONTRACT] = defineRequestSchemas({ body: acceptAnything });

  public static readonly [ASENA_CONTEXT_ADAPTER] = 'MockAdapter';
}

@Middleware()
export class CorsHeaders {
  public async handle(_context: AsenaContext<any, any>, next: AsenaNextHandler) {
    await next();
  }
}

@Middleware()
export class AuditTrail {
  public async handle(_context: AsenaContext<any, any>, next: AsenaNextHandler) {
    await next();
  }
}

@Middleware({ name: 'RequestTimer' })
export class RequestTimerMiddleware {
  public async handle(_context: AsenaContext<any, any>, next: AsenaNextHandler) {
    await next();
  }
}

@Middleware({ validator: true })
export class CreateItemValidator {
  public json() {
    return acceptAnything;
  }
}

@StaticServe({ root: './public/items', name: 'ItemImages' })
export class ItemImages extends AsenaStaticServeService<any> {}

@Service()
@Implements('PriceFormatter')
export class EuroFormatter {
  public format(amount: number) {
    return `${amount} EUR`;
  }
}

@Service()
@Implements('PriceFormatter')
export class DollarFormatter {
  public format(amount: number) {
    return `${amount} USD`;
  }
}

@Service({ name: 'ItemService' })
export class ItemService {
  @Value('DEVTOOLS_FIXTURE_PAGE_SIZE', { default: 20, parse: Number })
  public pageSize!: number;

  @Value('DEVTOOLS_FIXTURE_REGION')
  public region!: string;

  @Strategy('PriceFormatter')
  public formatters!: EuroFormatter[];

  public find(id: string) {
    return { id };
  }
}

/** Never injected anywhere: the snapshot must describe it without constructing one. */
@Service({ name: 'ItemDraft', scope: Scope.PROTOTYPE })
export class ItemDraft {
  public static constructed = 0;

  public constructor() {
    ItemDraft.constructed += 1;
  }
}

@Controller({ path: '/items', middlewares: [AuditTrail] })
export class ItemController {
  @Inject(ItemService)
  private itemService!: ItemService;

  @Get('/:id')
  public find(context: AsenaContext<any, any>) {
    return context.send(this.itemService.find('1'));
  }

  @Post({ path: '/', middlewares: [RequestTimerMiddleware], validator: CreateItemValidator })
  public create(context: AsenaContext<any, any>) {
    return context.send({ created: true }, 201);
  }

  @Put('/:id/name')
  public rename(context: RenameItemContext) {
    return context;
  }

  @Get({ path: '/images/*', staticServe: ItemImages })
  public images() {}
}

/** Stands in for a Bun HTMLBundle, which only a `.html` import produces. */
const adminBundle = { index: 'admin.html' };

@FrontendController('/admin')
export class AdminPages {
  public static pageCalls = 0;

  @Page('/')
  public home() {
    AdminPages.pageCalls += 1;
    return adminBundle;
  }

  @Page('reports')
  public reports() {
    AdminPages.pageCalls += 1;
    return adminBundle;
  }
}

@WebSocket('/ws/items')
export class ItemFeed extends AsenaWebSocketService {}

@Schedule({ cron: '0 3 * * *' })
export class NightlyCleanup implements AsenaSchedule {
  public async execute() {}
}

@EventService('item')
export class ItemEvents {
  @On('created')
  public onCreated() {}

  @On({ event: 'audit.*', prefix: false })
  public onAudit() {}

  @On({ event: 'archived', skip: true })
  public onArchived() {}
}

@MessageController('inventory')
export class InventoryHandler {
  @MessagePattern('reserve')
  public reserve(data: unknown) {
    return data;
  }

  @EventPattern('restocked')
  public onRestocked() {}
}

@PostProcessor()
export class PassThroughPostProcessor implements ComponentPostProcessor {
  public postProcess<T>(instance: T): T {
    return instance;
  }
}

@Config()
export class AppConfig {
  public static globalMiddlewareCalls = 0;

  public globalMiddlewares() {
    AppConfig.globalMiddlewareCalls += 1;

    return [{ middleware: CorsHeaders, routes: { exclude: ['/health'] } }];
  }

  public transport() {
    return { microservice: new InMemoryTransport() };
  }
}

@ExceptionHandler()
export class ApiExceptionHandler {
  @Catch(ItemMissing, ItemRejected)
  public known() {}

  @Catch(ItemConflict)
  public conflict() {}

  @Catch()
  public fallback() {}

  @NotFound()
  public missingRoute() {}
}

export const fixtureComponents = [
  CorsHeaders,
  AuditTrail,
  RequestTimerMiddleware,
  CreateItemValidator,
  EuroFormatter,
  DollarFormatter,
  ItemService,
  ItemDraft,
  ItemImages,
  ItemController,
  AdminPages,
  ItemFeed,
  NightlyCleanup,
  ItemEvents,
  InventoryHandler,
  PassThroughPostProcessor,
  AppConfig,
  ApiExceptionHandler,
];
