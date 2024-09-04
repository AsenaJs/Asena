import type { Context } from 'hono';

export class ContextWrapper {

  private _context: Context;

  public constructor(context: Context) {
    this._context = context;
  }

  public get param(s: string): string {
    return this._context.req.param(s);
  }

  public async getBody<T>(): Promise<T> {
    return await this._context.req.json<T>();
  }

  public send(data: string | any) {
    if (typeof data === 'string') {
      this._context.text(data);

      return;
    }

    this._context.json(data);
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

}
