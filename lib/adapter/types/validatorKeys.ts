import type { BaseValidator } from './BaseMiddleware';

export const VALIDATOR_KEYS = [
  'json',
  'query',
  'form',
  'param',
  'header',
] as const satisfies readonly (keyof BaseValidator)[];
