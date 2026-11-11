import { LifecycleState } from '../lifecycle/LifecycleState';

export type Readiness =
  | { status: 'not_ready'; state: LifecycleState }
  | { status: 'up' }
  | { status: 'up' | 'degraded'; transports: Record<string, 'connected' | 'disconnected'> };

/**
 * The readiness rule the health probe and the devtools agent share: lifecycle state first, then
 * every microservice transport's connection.
 *
 * @param state - The server's lifecycle state, `undefined` when unknown (skips the state check)
 * @param transports - Microservice transports by name, as `Ulak` holds them
 * @returns The readiness body without `uptime`
 */
export const computeReadiness = (
  state: LifecycleState | undefined,
  transports: ReadonlyMap<string, { readonly isConnected: boolean }>,
): Readiness => {
  // A stopping instance is not ready even if every transport is healthy.
  if (state && state !== LifecycleState.STARTED) {
    return { status: 'not_ready', state };
  }

  if (transports.size === 0) {
    return { status: 'up' };
  }

  const states: Record<string, 'connected' | 'disconnected'> = {};
  let degraded = false;

  for (const [name, transport] of transports) {
    const connected = transport.isConnected;

    states[name] = connected ? 'connected' : 'disconnected';

    if (!connected) {
      degraded = true;
    }
  }

  return { status: degraded ? 'degraded' : 'up', transports: states };
};
