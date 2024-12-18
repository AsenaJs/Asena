import type { AsenaContext } from '../../adapter';

export interface AsenaConfig<C extends AsenaContext<any, any> = AsenaContext<any, any>> {
  onError?(error: Error, context: C): Response | Promise<Response>;
}
