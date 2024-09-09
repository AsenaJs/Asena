import type { RouteParams } from './types/routeParams.ts';

export interface AsenaAdapter<A, M, H, AM, AH> {
  app: A;
  setPort: (port: number) => void;
  use: (middleware: M) => void;
  registerRoute: (params: RouteParams<AM, AH>) => void;
  prepareMiddlewares: (middlewares: M | M[]) => any[];
  prepareHandler: (handler: H) => any;
  start: () => Promise<void>;
  onError: (errorHandler: any) => void;
}
