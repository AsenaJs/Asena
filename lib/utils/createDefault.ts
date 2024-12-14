import type { ServerLogger } from '../logger';
import { HonoAdapter } from '../adapter/hono';
import { HonoWebsocketAdapter } from '../adapter/hono';

export const createDefaultAdapter = (logger?: ServerLogger): [HonoAdapter, ServerLogger] => {
  return [new HonoAdapter(new HonoWebsocketAdapter(), logger), logger];
};
