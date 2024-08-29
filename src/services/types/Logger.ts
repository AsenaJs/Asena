import type { ServerService } from './ServerService.ts';

export interface ServerLogger extends ServerService {
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
}
