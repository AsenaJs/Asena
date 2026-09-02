/**
 * The authenticated principal, shaped by whichever provider resolved it.
 * `id` and `roles` are the members every enforcement package reads; the index
 * signature carries the rest as opaque provider data.
 */
export interface AuthUser {
  id: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * What an auth provider resolves for a request: the user plus the raw session record.
 * Handlers and enforcement packages read it through `getAuthSession` / `requireAuthSession`.
 */
export interface AuthSession<TUser extends AuthUser = AuthUser> {
  user: TUser;
  session: { id: string; userId: string; createdAt: Date; expiresAt: Date };
}

/**
 * Derives the effective role names from a resolved session. Consulted by providers
 * and guards whose role source is richer than the plain `user.roles` member.
 */
export type RolesResolver<TUser extends AuthUser = AuthUser> = (session: AuthSession<TUser>) => string[];

/**
 * The contract every auth implementation satisfies. Implementations register under
 * `AUTH_PROVIDER_KEY` (`@Implements` / `container.resolveStrategy`) and enforcement
 * packages consult them through these two methods - core itself never does.
 */
export interface AsenaAuthProvider<TUser extends AuthUser = AuthUser> {
  getSession(request: Request): Promise<AuthSession<TUser> | null>;
  getRoles(session: AuthSession<TUser>): string[];
}

/**
 * The decision input a guard decorator leaves behind. Read by enforcement packages
 * (and by OpenAPI security-scheme generation), never by core itself.
 */
export interface GuardMark {
  access: 'protected' | 'public';
  /** Registered component name of the provider to consult; a method mark falls back to the class mark's, then to the default provider. */
  provider?: string;
  /** Any-of: a session holding at least one of these roles passes. */
  roles?: string[];
}

/** Options accepted by {@link Protected}; read by the decorator itself. */
export interface ProtectedOptions {
  provider?: string;
}
