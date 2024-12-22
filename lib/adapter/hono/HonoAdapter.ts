import { AsenaAdapter } from '../AsenaAdapter';
import {
  type Context,
  type Handler,
  Hono,
  type HonoRequest,
  type MiddlewareHandler,
  type ValidationTargets,
} from 'hono';
import type { Server } from 'bun';
import * as bun from 'bun';
import type { RouteParams } from '../types';
import { HonoContextWrapper } from './HonoContextWrapper';
import { HttpMethod } from '../../server/web/http';
import {
  type BaseMiddleware,
  type BaseValidator,
  VALIDATOR_METHODS,
  type ValidatorHandler,
} from '../../server/web/types';
import type { HonoErrorHandler, HonoHandler } from './types';
import { green, type ServerLogger, yellow } from '../../logger';
import type { AsenaWebsocketAdapter } from '../AsenaWebsocketAdapter';
import { type Hook, zValidator } from '@hono/zod-validator';
import type { ValidationSchema, ValidationSchemaWithHook } from './defaults';
import type { ZodType, ZodTypeDef } from 'zod';
import type { WSOptions } from '../../server/web/websocket';
import { middlewareParser } from './utils/middlewareParser';
import type { AsenaServeOptions } from '../types/ServeOptions';

export class HonoAdapter extends AsenaAdapter<
  Hono,
  HonoRequest,
  Response,
  ValidationSchema,
  AsenaWebsocketAdapter<Hono, HonoRequest, Response>
> {

  public name = 'HonoAdapter';

  public app = new Hono();

  private server: Server;

  // @ts-ignore
  private options: AsenaServeOptions = {} satisfies AsenaServeOptions;

  private readonly methodMap = {
    [HttpMethod.GET]: (path: string, ...handlers: (MiddlewareHandler | Handler)[]) => this.app.get(path, ...handlers),
    [HttpMethod.POST]: (path: string, ...handlers: any[]) => this.app.post(path, ...handlers),
    [HttpMethod.PUT]: (path: string, ...handlers: any[]) => this.app.put(path, ...handlers),
    [HttpMethod.DELETE]: (path: string, ...handlers: any[]) => this.app.delete(path, ...handlers),
    [HttpMethod.PATCH]: (path: string, ...handlers: any[]) => this.app.patch(path, ...handlers),
    [HttpMethod.OPTIONS]: (path: string, ...handlers: any[]) => this.app.options(path, ...handlers),
    [HttpMethod.CONNECT]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.CONNECT.toUpperCase(), path, ...handlers),
    [HttpMethod.HEAD]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.HEAD.toUpperCase(), path, ...handlers),
    [HttpMethod.TRACE]: (path: string, ...handlers: any[]) =>
      this.app.on(HttpMethod.TRACE.toUpperCase(), path, ...handlers),
  };

  public constructor(websocketAdapter: AsenaWebsocketAdapter<Hono, HonoRequest, Response>, logger?: ServerLogger) {
    super(websocketAdapter, logger);
    this.websocketAdapter.app = this.app;

    // to ensure that the logger is set
    if (!this.websocketAdapter.logger && logger) {
      this.websocketAdapter.logger = this.logger;
    }
  }

  public use(middleware: BaseMiddleware<HonoRequest, Response>, path?: string) {
    const normalizedPath = path ? this.normalizePath(path) : undefined;
    const preparedMiddlewares = this.prepareMiddlewares([middleware]);

    if (normalizedPath) {
      this.app.use(normalizedPath, ...preparedMiddlewares);
      return;
    }

    this.app.use(...preparedMiddlewares);
  }

  public async registerRoute({
    method,
    path,
    middleware,
    handler,
    staticServe,
    validator,
  }: RouteParams<HonoRequest, Response, ValidationSchema>) {
    const middlewares = this.prepareMiddlewares(middleware);

    const allMiddlewares: MiddlewareHandler[] = validator
      ? [...(await this.prepareValidator(validator)), ...middlewares]
      : middlewares;

    const routeHandler = staticServe ? allMiddlewares : [...allMiddlewares, this.prepareHandler(handler)];

    const methodHandler = this.methodMap[method];

    if (!methodHandler) {
      throw new Error('Invalid method');
    }

    methodHandler(path, ...routeHandler);
    this.logger.info(
      `${green('Successfully')} registered ${yellow(method.toUpperCase())} route for PATH: ${green(`${path}`)}`,
    );
  }

  public async start(wsOptions?: WSOptions) {
    this.websocketAdapter.buildWebsocket(wsOptions);

    this.server = bun.serve({
      ...this.options,
      port: this.port,
      fetch: this.app.fetch,
      websocket: this.websocketAdapter.websocket,
    });

    this.websocketAdapter.startWebsocket(this.server);

    return this.server;
  }

  public onError(errorHandler: HonoErrorHandler) {
    this.app.onError((error, context) => {
      return errorHandler(error, new HonoContextWrapper(context));
    });
  }

  public async serveOptions(options: () => Promise<AsenaServeOptions> | AsenaServeOptions) {
    this.options = await options();
  }

  public setPort(port: number) {
    this.port = port;
  }

  private prepareMiddlewares(middlewares: BaseMiddleware<HonoRequest, Response>[]): MiddlewareHandler[] {
    return middlewareParser(middlewares);
  }

  private prepareHandler(handler: HonoHandler): Handler {
    return (c: Context) => handler(new HonoContextWrapper(c));
  }

  private async prepareValidator(
    baseValidator: BaseValidator<ValidationSchema | ValidationSchemaWithHook>,
  ): Promise<MiddlewareHandler[]> {
    if (!baseValidator) {
      return [];
    }

    const validators = [];

    for (const key of VALIDATOR_METHODS) {
      // if the key is not a validator method, skip
      if (typeof (baseValidator[key] as BaseMiddleware<HonoRequest, Response>)?.handle !== 'function') {
        continue;
      }

      const validator: ValidatorHandler<ValidationSchema | ValidationSchemaWithHook> = baseValidator[key];

      const validationSchema = await validator.handle();
      let schema: ZodType<any, ZodTypeDef, any>;
      let hook: Hook<any, any, any>;

      if ('schema' in validationSchema) {
        schema = validationSchema['schema'];
        hook = validationSchema['hook'];
      } else {
        schema = validationSchema as ZodType<any, ZodTypeDef, any>;
      }

      validators.push(zValidator(key as keyof ValidationTargets, schema, hook));
    }

    return validators;
  }

  private normalizePath(path: string): string {
    return `${path.endsWith('/') ? path : `${path}/`}*`;
  }

}
