import type { AsenaValidationService } from '../../../server/web/middleware';
import type { z } from 'zod';
import type { Hook } from '@hono/zod-validator';

export type ValidationSchema =
  | {
      schema: z.ZodType<any, z.ZodTypeDef, any>;
      hook?: Hook<any, any, any>;
    }
  | z.ZodType<any, z.ZodTypeDef, any>;

export abstract class ValidationService implements AsenaValidationService<ValidationSchema> {}
