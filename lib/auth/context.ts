import { HttpException } from '../adapter/types/HttpException';
import { ClientErrorStatusCode } from '../server/web/types/HttpStatus';
import type { AsenaContext } from '../adapter/AsenaContext';
import { AUTH_SESSION_CONTEXT_KEY } from './constants';
import type { AuthSession, AuthUser } from './types';

/**
 * Reads the session an auth provider or guard stored on the context, without deciding
 * anything: `undefined` means nothing resolved it yet, `null` means resolved as anonymous.
 */
export function getAuthSession<TUser extends AuthUser = AuthUser>(
  ctx: AsenaContext<any, any>,
): AuthSession<TUser> | null | undefined {
  return ctx.getValue<AuthSession<TUser>>(AUTH_SESSION_CONTEXT_KEY);
}

/**
 * The session or a 401: throws an `HttpException` with status 401 when the context
 * carries `undefined` (nothing resolved the session yet) or `null` (anonymous).
 */
export function requireAuthSession<TUser extends AuthUser = AuthUser>(ctx: AsenaContext<any, any>): AuthSession<TUser> {
  const session = getAuthSession<TUser>(ctx);

  if (session === null || session === undefined) {
    throw new HttpException(ClientErrorStatusCode.Unauthorized, 'Authentication required');
  }

  return session;
}
