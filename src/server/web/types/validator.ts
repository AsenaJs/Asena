import type { ZodType } from 'zod';
import type { ValidationTargets } from 'hono';

export type Validators = {
  [key in keyof ValidationTargets]?: ZodType;
};
