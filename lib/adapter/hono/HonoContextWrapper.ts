import type { Context, HonoRequest } from 'hono';
import type { AsenaContext } from '../AsenaContext';
import type { CookieExtra, SendOptions } from '../types';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'; // add delete cookie
import type { CookieOptions } from 'hono/utils/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HonoContextWrapper implements AsenaContext<HonoRequest<any, any>, Response> {

  private _context: Context;

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
    const { headers = {}, status = 200 } =
      typeof statusOrOptions === 'number' ? { status: statusOrOptions } : statusOrOptions || {};

    if (headers !== undefined) {
      Object.entries(headers).forEach(([key, value]) => {
        this._context.res.headers.append(key, value);
      });
    }

    if (typeof data === 'string') {
      return this._context.text(data);
    }

    return this._context.json(data, status as ContentfulStatusCode, headers);
  }

  public async getCookie(name: string, secret?: string | BufferSource): Promise<string | false> {
    return secret ? await getSignedCookie(this._context, secret, name) : getCookie(this._context, name);
  }

  public async setCookie(name: string, value: string, options?: CookieExtra<CookieOptions>) {
    const { secret, extraOptions } = options ?? { secret: undefined, extraOptions: undefined };

    return secret
      ? setSignedCookie(this._context, name, value, secret, extraOptions)
      : setCookie(this._context, name, value, extraOptions);
  }

  public async deleteCookie(name: string, options?: CookieExtra<CookieOptions>) {
    const { extraOptions } = options ?? { secret: undefined, extraOptions: undefined };

    deleteCookie(this._context, name, extraOptions);
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

  public setWebSocketValue(value: any): void {
    this._context.set('_websocketData', value);
  }

  public getWebSocketValue<T>(): T {
    return this._context.get('_websocketData') as T;
  }

  public html(data: string, statusOrOptions?: SendOptions | number) {
    const { headers = {}, status = 200 } =
      typeof statusOrOptions === 'number' ? { status: statusOrOptions } : statusOrOptions || {};

    if (typeof data === 'string') {
      return this._context.html(data, status as ContentfulStatusCode, headers);
    }

    Object.entries(headers).forEach(([key, value]) => {
      this._context.res.headers.append(key, value);
    });

    return this._context.html(data, status as ContentfulStatusCode, headers);
  }

  public get context(): Context {
    return this._context;
  }

  public set context(value: Context) {
    this._context = value;
  }

}
