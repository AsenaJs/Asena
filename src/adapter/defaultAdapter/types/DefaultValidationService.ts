import type { ValidationService } from '../../../server/web/middleware';
import type { MiddlewareHandler } from 'hono';

export type DefaultValidationService = ValidationService<MiddlewareHandler>;
