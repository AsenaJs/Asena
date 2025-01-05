import type { ServerLogger } from '../../../logger';
import { HonoAdapter } from '../index';
import { HonoWebsocketAdapter } from '../index';

export const createHonoAdapter = (logger?: ServerLogger): [HonoAdapter, ServerLogger] => {
  return [new HonoAdapter(new HonoWebsocketAdapter(), logger), logger];
};
