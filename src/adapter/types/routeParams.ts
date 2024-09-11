import type { HttpMethod } from '../../server/web/http/HttpMethod.ts';

export interface RouteParams<M, H> {
  method: HttpMethod;
  path: string;
  middleware: M[];
  handler: H;
  staticServe: boolean;
}
