import type { MiddlewareHandler } from 'hono';
import type { AsenaValidationService } from '../../../server/web/middleware';

export abstract class ValidationService<H = MiddlewareHandler> implements AsenaValidationService<H> {}
