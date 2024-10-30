import type { HttpMethod } from '../../server/web/http';

export interface RouteParams<M, H> {
  method: HttpMethod;
  path: string;
  middleware: M[];
  handler: H;
  staticServe: boolean;
  validator: M[];
}
