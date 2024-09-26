/*
 * @H is handler type of each validator controller
 *
 *
 */
import type { MiddlewareHandler } from 'hono';

export abstract class AsenaValidationService<H> {

  public abstract json?(): H;

  public abstract form?(): H;

  public abstract query?(): H;

  public abstract param?(): H;

  public abstract header?(): H;

}

export type ValidationService = AsenaValidationService<MiddlewareHandler>;
