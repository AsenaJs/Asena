import { mock } from 'bun:test';
import type { AsenaContext, CookieExtra, SendOptions } from '../../adapter';
import type { GlobalMiddlewareRouteConfig } from '../../server/config';
import { shouldApplyMiddleware } from '../../utils/patternMatcher';

export const createMockContext = () =>
  ({
    // @ts-ignore
    req: {} satisfies Request,
    // @ts-ignore
    res: {} satisfies Response,

    headers: {},
    params: {},

    getArrayBuffer: mock(() => Promise.resolve(new ArrayBuffer(0))),
    getParseBody: mock(() => Promise.resolve({})),
    getBlob: mock(() => Promise.resolve(new Blob())),
    getFormData: mock(() => Promise.resolve(new FormData())),
    getParam: mock((_s: string) => ''),

    // @ts-ignore
    getBody: mock(<U>() => Promise.resolve({} satisfies U)),

    getQuery: mock((_query: string) => Promise.resolve('')),
    getQueryAll: mock((_query: string) => Promise.resolve([])),

    getCookie: mock((_name: string, _secret?: string | BufferSource) => Promise.resolve('')),
    setCookie: mock((_name: string, _value: string, _options?: CookieExtra<any>) => Promise.resolve()),
    deleteCookie: mock((_name: string, _options?: CookieExtra<any>) => Promise.resolve()),

    // @ts-ignore
    getValue: mock(<T>(_key: string) => ({}) satisfies T),
    setValue: mock((_key: string, _value: any) => {}),

    setWebSocketValue: mock((_value: any) => {}),
    // @ts-ignore
    getWebSocketValue: mock(<T>() => ({}) satisfies T),

    html: mock((_data: string) => _data),
    send: mock((_data: any, _status?: SendOptions | number) => _data),
    json: mock((_data: any) => _data),
    status: mock((_code: number) => ({ json: mock((_data: any) => _data) })),
    redirect: mock((_url: string) => {}),
  }) as unknown as AsenaContext<Request, Response>;

export const createMockAdapter = () => {
  const mockLogger = {
    info: mock((message: string) => console.log(`[INFO] ${message}`)),
    warn: mock((message: string) => console.warn(`[WARN] ${message}`)),
    error: mock((message: string) => console.error(`[ERROR] ${message}`)),
    debug: mock((message: string) => console.debug(`[DEBUG] ${message}`)),
  };

  // Store registered routes and global middlewares for testing
  const registeredRoutes: Map<string, any> = new Map();
  const globalMiddlewares: Array<{ middleware: any; config?: GlobalMiddlewareRouteConfig }> = [];

  const mockAdapter = {
    name: 'MockAdapter',
    setPort: mock((_port: number) => {}),
    start: mock(async () => {}),
    registerRoute: mock(async (route: any) => {
      // Store route for testing
      const key = `${route.method}:${route.path}`;

      registeredRoutes.set(key, route);
      return true;
    }),
    use: mock(async (middleware: any, config?: GlobalMiddlewareRouteConfig) => {
      // Store middleware with its pattern config
      globalMiddlewares.push({ middleware, config });
      return true;
    }),
    registerWebsocketRoute: mock(async (_websocketRoute: any) => {
      // Mock WebSocket route registration
      return true;
    }),
    extractRouteParams: (routePath: string, requestPath: string) => {
      const params: any = {};
      const routeSegments = routePath.split('/');
      const requestSegments = requestPath.split('/');

      for (let i = 0; i < routeSegments.length; i++) {
        const routeSegment = routeSegments[i];
        const requestSegment = requestSegments[i];

        if (routeSegment.startsWith(':')) {
          const paramName = routeSegment.slice(1);

          params[paramName] = requestSegment;
        }
      }

      return params;
    },
    testRequest: mock(async (method: string, path: string) => {
      // Normalize method to lowercase
      const normalizedMethod = method.toLowerCase();

      // Find matching route - try exact match first
      let key = `${normalizedMethod}:${path}`;
      let route = registeredRoutes.get(key);

      // Try with trailing slash
      if (!route) {
        key = `${normalizedMethod}:${path}/`;
        route = registeredRoutes.get(key);
      }

      // Try without trailing slash
      if (!route && path.endsWith('/')) {
        key = `${normalizedMethod}:${path.slice(0, -1)}`;
        route = registeredRoutes.get(key);
      }

      // If no exact match, try to find by method only (for debugging)
      if (!route) {
        for (const [routeKey, routeValue] of registeredRoutes.entries()) {
          if (routeKey.startsWith(`${normalizedMethod}:`)) {
            console.log(`Found route: ${routeKey} for request: ${method}:${path}`);
            route = routeValue;
            break;
          }
        }
      }

      if (route && route.handler) {
        // Create mock context
        const mockContext = createMockContext();

        // Extract route parameters from path


        mockContext['params'] = mockAdapter.extractRouteParams(route.path, path);

        // Filter global middlewares based on pattern matching
        const applicableMiddlewares = globalMiddlewares
          .filter(({ config }) => shouldApplyMiddleware(route.path, config))
          .map(({ middleware }) => middleware);

        // Combine all middlewares: applicable global + route.middlewares
        const allMiddlewares = [...applicableMiddlewares, ...(route.middlewares || [])];

        // Execute middleware chain if present
        if (allMiddlewares.length > 0) {
          let middlewareIndex = 0;
          const next = async () => {
            if (middlewareIndex < allMiddlewares.length) {
              const middleware = allMiddlewares[middlewareIndex++];

              await middleware.handle(mockContext, next);
            } else {
              // Execute handler


              return await route.handler(mockContext);
            }
          };

          const result = await next();

          return {
            status: 200,
            body: result,
            headers: {},
          };
        } else {
          // Execute handler directly
          const result = await route.handler(mockContext);

          return {
            status: 200,
            body: result,
            headers: {},
          };
        }
      }

      // Debug: log all registered routes
      console.log('Registered routes:', Array.from(registeredRoutes.keys()));
      console.log(`Looking for: ${method}:${path}`);

      // Default mock response
      return {
        status: 200,
        body: { message: 'mock response' },
        headers: {},
      };
    }),
    testWebSocket: mock(async (_path: string) => {
      return {
        send: mock(async (message: string) => `echo: ${message}`),
        close: mock(async () => {}),
        receive: mock(async () => 'connected'),
      };
    }),
  };

  return { adapter: mockAdapter, logger: mockLogger };
};
