import type { Context, HonoRequest } from 'hono';
import type { AsenaContext } from '../AsenaContext.ts';
import type { SendOptions } from '../types/SendOptions.ts';
import { getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieExtra } from '../types/CookieExtra.ts';
import type { CookieOptions } from 'hono/utils/cookie';

export class DefaultContextWrapper implements AsenaContext<HonoRequest<any, any>, Response> {

  private readonly _context: Context;

  public constructor(context: Context) {
    this._context = context;
  }

  public get req() {
    return this._context.req;
  }

  public get res() {
    return this._context.res;
  }

  public get headers(): Record<string, string> {
    return this._context.req.header();
  }

  public getArrayBuffer(): Promise<ArrayBuffer> {
    return this._context.req.arrayBuffer();
  }

  public getParseBody(): Promise<any> {
    return this._context.req.parseBody();
  }

  public getBlob(): Promise<Blob> {
    return this._context.req.blob();
  }

  public getFormData(): Promise<FormData> {
    return this._context.req.formData();
  }

  public getParam(s: string): string {
    return this._context.req.param(s);
  }

  public async getBody<T>(): Promise<T> {
    return await this._context.req.json<T>();
  }

  public async getQuery(query: string): Promise<string> {
    return this._context.req.query(query);
  }

  public async getQueryAll(query: string): Promise<string[]> {
    return this._context.req.queries(query);
  }

  public send(data: string | any, statusOrOptions?: SendOptions | number) {
    const {
      headers = {},
      status = 200,
      override = false,
    } = typeof statusOrOptions === 'number' ? { status: statusOrOptions } : statusOrOptions || {};

    if (typeof data === 'string' && override) {
      return this._context.text(data, { headers, status });
    }

    Object.entries(headers).forEach(([key, value]) => {
      this._context.res.headers.append(key, value);
    });

    return this._context.json(data, { status });
  }

  public async getCookie(name: string, secret?: string | BufferSource): Promise<string | false> {
    return secret ? await getSignedCookie(this._context, secret, name) : getCookie(this._context, name);
  }

  public async setCookie(name: string, value: string, options?: CookieExtra<CookieOptions>) {
    const { secret, extraOptions } =
      options || ({ secret: undefined, extraOptions: undefined } satisfies CookieExtra<CookieOptions>);

    return secret
      ? setSignedCookie(this._context, name, value, secret, extraOptions)
      : setCookie(this._context, name, value, extraOptions);
  }

  public redirect(url: string) {
    return this._context.redirect(url);
  }

  public getValue<T>(key: string): T {
    return this._context.get(key) as T;
  }

  public setValue(key: string, value: any): void {
    this._context.set(key, value);
  }

  public html(data: string, statusOrOptions?: SendOptions | number) {
    const { headers = {}, status = 200 } =
      typeof statusOrOptions === 'number' ? { status: statusOrOptions } : statusOrOptions || {};

    if (typeof data === 'string') {
      return this._context.html(data, { headers, status });
    }

    Object.entries(headers).forEach(([key, value]) => {
      this._context.res.headers.append(key, value);
    });

    return this._context.html(data, { status });
  }

}
