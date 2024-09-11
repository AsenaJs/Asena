import type { ValidationService } from '../../../server/validation/ValidationService';
import type { MiddlewareHandler } from 'hono';

export type DefaultValidationService = ValidationService<MiddlewareHandler>;
