import type { AsenaContext } from '../AsenaContext';

export interface BaseStaticServeParams<C extends AsenaContext<any, any> = any, E = any> {
  extra: E;
  root: string;
  rewriteRequestPath: (path: string) => string;
  onFound: AsenaStaticServeHandler<C>;
  onNotFound: AsenaStaticServeHandler<C>;
}

export interface AsenaStaticServeHandler<C extends AsenaContext<any, any>> {
  handler: (path: string, c: C) => Promise<void> | void;
  override: boolean;
}
