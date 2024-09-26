import type { CookieExtra } from './types';
import type { SendOptions } from './types';
import type { TypedResponse } from 'hono';

export interface AsenaContext<R, S> {
  req: R;
  res: S;
  headers: Record<string, string>;
  getArrayBuffer: () => Promise<ArrayBuffer>;
  getParseBody: () => Promise<any>;
  getBlob: () => Promise<Blob>;
  getFormData: () => Promise<FormData>;
  getParam: (s: string) => string;
  getBody: <U>() => Promise<U>;
  getQuery: (query: string) => Promise<string>;
  getQueryAll: (query: string) => Promise<string[]>;
  getCookie: (name: string, secret?: string | BufferSource) => Promise<string | false>;
  setCookie: (name: string, value: string, options?: CookieExtra<any>) => Promise<void>;
  getValue: <T>(key: string) => T;
  setValue: (key: string, value: any) => void;
  html: (data: string) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;
  send: (
    data: string | any,
    status?: SendOptions | number,
  ) => Response | Promise<Response> | TypedResponse | Promise<TypedResponse>;
  redirect: (url: string) => void;
}
