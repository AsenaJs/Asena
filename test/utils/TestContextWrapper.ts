import type {
  AsenaContext,
  AsenaSSEStreamWriter,
  AsenaStreamWriter,
  CookieExtra,
  SendOptions,
} from '../../lib/adapter';

/**
 * Minimal AsenaContext implementation for testing.
 * Only implements setValue/getValue with real logic.
 * Used to test AsenaVariables augmentation without adapter dependency.
 */
export class TestContextWrapper implements AsenaContext<Request, Response> {
  public req: Request;

  public res: Response;

  public headers: Record<string, string> = {};

  private values: Map<string, any> = new Map();

  public constructor(req?: Request) {
    this.req = req ?? new Request('http://localhost/');
    this.res = new Response();
  }

  getAllQueries: () => Record<string, string | string[]>;

  getRequestIp?(): string | null {
    throw new Error('Method not implemented.');
  }
  setResponseHeader?(key: string, value: string): void {
    throw new Error('Method not implemented.');
  }

  public getValue<T = any>(key: string): T {
    return this.values.get(key) as T;
  }

  public setValue(key: string, value: any): void {
    this.values.set(key, value);
  }

  // Stubs for interface compliance
  public getArrayBuffer = () => Promise.resolve(new ArrayBuffer(0));

  public getParseBody = () => Promise.resolve({});

  public getBlob = () => Promise.resolve(new Blob());

  public getFormData = () => Promise.resolve(new FormData());

  public getParam = (_s: string) => '';

  public getBody = <U>() => Promise.resolve({} as U);

  public getQuery = (_q: string) => Promise.resolve('');

  public getQueryAll = (_q: string) => Promise.resolve([] as string[]);

  public getCookie = (_n: string, _s?: string | BufferSource) => Promise.resolve('');

  public setCookie = (_n: string, _v: string, _o?: CookieExtra<any>) => Promise.resolve();

  public deleteCookie = (_n: string, _o?: CookieExtra<any>) => Promise.resolve();

  public setWebSocketValue = (_v: any) => {};

  public getWebSocketValue = <T>() => ({}) as T;

  public stream = (_cb: (stream: AsenaStreamWriter) => Promise<void>) => new Response();

  public streamSSE = (_cb: (stream: AsenaSSEStreamWriter) => Promise<void>) => new Response();

  public streamText = (_cb: (stream: AsenaStreamWriter) => Promise<void>) => new Response();

  public html = (_d: string) => new Response();

  public send = (_d: any, _s?: SendOptions | number) => new Response();

  public redirect = (_u: string) => {};
}
