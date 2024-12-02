import type { MiddlewareHandler } from 'hono';
import { AsenaValidationService } from '../../../server/web/middleware';

export abstract class ValidationService<H = MiddlewareHandler> extends AsenaValidationService<H> {}
