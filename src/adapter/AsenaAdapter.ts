import type { RouteParams } from './types/routeParams.ts';

export interface AsenaAdapter<A, M, H> {
  app: A;
  setPort: (port: number) => void;
  use: (middleware: M) => void;
  registerRoute: (params: RouteParams<M, H>) => void;
  start: () => Promise<void>;
}
