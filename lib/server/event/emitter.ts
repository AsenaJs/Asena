import { ICoreServiceNames } from '../../ioc';

/**
 * @description Utility for injecting EventEmitter
 *
 * Returns the EventEmitter service key for use with @Inject decorator.
 *
 * @returns The EventEmitter service key
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserService {
 *   @Inject(emitter())
 *   private emitter!: EventEmitter;
 *
 *   createUser(name: string) {
 *     this.emitter.emit('user.created', { name });
 *   }
 * }
 * ```
 */
export function emitter(): string {
  return ICoreServiceNames.EVENT_EMITTER;
}
