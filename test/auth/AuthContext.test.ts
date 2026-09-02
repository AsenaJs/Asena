import { describe, expect, test } from 'bun:test';
import { AUTH_PROVIDER_KEY, AUTH_SESSION_CONTEXT_KEY, getAuthSession, requireAuthSession } from '../../lib/auth';
import type { AsenaAuthProvider, AuthSession, AuthUser, RolesResolver } from '../../lib/auth';
import { HttpException } from '../../lib/adapter';
import type { AsenaContext } from '../../lib/adapter';
import { TestContextWrapper } from '../utils/TestContextWrapper';

const session: AuthSession = {
  user: { id: 'u1', roles: ['admin'] },
  session: {
    id: 's1',
    userId: 'u1',
    createdAt: new Date(0),
    expiresAt: new Date(60_000),
  },
};

const createContext = (store: Record<string, unknown>): AsenaContext<any, any> =>
  ({ getValue: (key: string) => store[key] }) as unknown as AsenaContext<any, any>;

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('auth context constants', () => {
  test('the wire-format keys keep their documented values', () => {
    expect(AUTH_PROVIDER_KEY).toBe('AsenaAuthProvider');
    expect(AUTH_SESSION_CONTEXT_KEY).toBe('authSession');
  });
});

describe('getAuthSession', () => {
  test('returns undefined when nothing resolved the session yet', () => {
    expect(getAuthSession(createContext({}))).toBeUndefined();
  });

  test('returns null when the request was resolved as anonymous', () => {
    expect(getAuthSession(createContext({ authSession: null }))).toBeNull();
  });

  test('returns the stored session untouched', () => {
    expect(getAuthSession(createContext({ authSession: session }))).toBe(session);
  });
});

describe('requireAuthSession', () => {
  test('throws an HttpException with status 401 when nothing resolved the session yet', () => {
    const error = thrownBy(() => requireAuthSession(createContext({})));

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).status).toBe(401);
  });

  test('throws the same 401 when the request was resolved as anonymous', () => {
    const error = thrownBy(() => requireAuthSession(createContext({ authSession: null })));

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).status).toBe(401);
  });

  test('returns the session when one is present', () => {
    expect(requireAuthSession(createContext({ authSession: session }))).toBe(session);
  });
});

// Type-level contract: exercised at compile time by `bun run typecheck`, which includes test/.

describe('auth contract types', () => {
  test('an AsenaAuthProvider implementation with both methods compiles and runs', () => {
    class StubProvider implements AsenaAuthProvider {
      getSession(_request: Request): Promise<AuthSession | null> {
        return Promise.resolve(session);
      }

      getRoles(_session: AuthSession): string[] {
        return ['admin'];
      }
    }

    const provider: AsenaAuthProvider = new StubProvider();

    expect(provider.getRoles(session)).toEqual(['admin']);

    // @ts-expect-error - a provider missing getRoles does not satisfy the interface
    const incomplete: AsenaAuthProvider = { getSession: (_request) => Promise.resolve(null) };
    expect(incomplete).toBeDefined();
  });

  test('a RolesResolver maps a session to role names', () => {
    const resolver: RolesResolver = (s) => s.user.roles ?? [];

    expect(resolver(session)).toEqual(session.user.roles ?? []);

    // @ts-expect-error - a resolver returning something other than string[] does not satisfy the type
    const wrong: RolesResolver = (s) => s.user.id;
    expect(wrong).toBeDefined();
  });

  test('the AsenaVariables augmentation types setValue for the authSession key', () => {
    const ctx = new TestContextWrapper();

    ctx.setValue(AUTH_SESSION_CONTEXT_KEY, session);
    ctx.setValue(AUTH_SESSION_CONTEXT_KEY, null);
    ctx.setValue(AUTH_SESSION_CONTEXT_KEY, undefined);
    ctx.setValue(AUTH_SESSION_CONTEXT_KEY, session);

    expect(ctx.getValue(AUTH_SESSION_CONTEXT_KEY)).toBe(session);

    // @ts-expect-error - authSession only accepts AuthSession | null | undefined
    ctx.setValue(AUTH_SESSION_CONTEXT_KEY, 42);
  });

  test('a narrower user type flows through the session helpers', () => {
    interface AdminUser extends AuthUser {
      clearance: number;
    }

    const adminSession: AuthSession<AdminUser> = {
      user: { id: 'u2', roles: ['admin'], clearance: 5 },
      session: {
        id: 's2',
        userId: 'u2',
        createdAt: new Date(0),
        expiresAt: new Date(60_000),
      },
    };

    const ctx = createContext({ authSession: adminSession });
    const resolved = requireAuthSession<AdminUser>(ctx);

    expect(resolved.user.clearance).toBe(5);
  });
});
