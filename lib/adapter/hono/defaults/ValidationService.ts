import type { AsenaValidationService } from '../../../server/web/middleware';
import type { z } from 'zod';
import type { Hook } from '@hono/zod-validator';

export type ValidationSchema = z.ZodType<any, z.ZodTypeDef, any>;

export interface ValidationSchemaWithHook {
  schema: z.ZodType<any, z.ZodTypeDef, any>;
  hook?: Hook<any, any, any>;
}

export abstract class ValidationService
  implements AsenaValidationService<ValidationSchema | ValidationSchemaWithHook> {}
