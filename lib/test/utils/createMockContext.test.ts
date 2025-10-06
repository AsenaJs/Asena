import { mock } from 'bun:test';
import type { AsenaContext, CookieExtra, SendOptions } from '../../adapter';

export const createMockContext = () =>
  ({
    // @ts-ignore
    req: {} satisfies Request,
    // @ts-ignore
    res: {} satisfies Response,

    headers: {},

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

    html: mock((_data: string) => new Response()),
    send: mock((_data: any, _status?: SendOptions | number) => new Response()),
    redirect: mock((_url: string) => {}),
  }) as unknown as AsenaContext<Request, Response>;

export const createMockAdapter = () => {
  const mockLogger = {
    info: mock((message: string) => console.log(`[INFO] ${message}`)),
    warn: mock((message: string) => console.warn(`[WARN] ${message}`)),
    error: mock((message: string) => console.error(`[ERROR] ${message}`)),
    debug: mock((message: string) => console.debug(`[DEBUG] ${message}`)),
  };

  const mockAdapter = {
    name: 'MockAdapter',
    setPort: mock((port: number) => {}),
    start: mock(async () => {}),
    testRequest: mock(async (method: string, path: string) => {
      return {
        status: 200,
        body: { message: 'mock response' },
        headers: {}
      };
    }),
    testWebSocket: mock(async (path: string) => {
      return {
        send: mock(async (message: string) => `echo: ${message}`),
        close: mock(async () => {}),
        receive: mock(async () => 'connected')
      };
    })
  };

  return { adapter: mockAdapter, logger: mockLogger };
};
