import { afterEach, describe, expect, test } from 'bun:test';
import { HealthServer } from '../../../lib/server/health/HealthServer';
import { computeReadiness } from '../../../lib/server/health/readiness';
import { LifecycleState } from '../../../lib/server/lifecycle';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

const randomPort = () => 10000 + Math.floor(Math.random() * 22000);

const transports = (entries: Record<string, boolean>) =>
  new Map(Object.entries(entries).map(([name, isConnected]) => [name, { isConnected }]));

let health: HealthServer | undefined;

const probe = async (state: LifecycleState | undefined, transportMap: Map<string, { isConnected: boolean }>) => {
  const port = randomPort();
  const ulak = { getMicroserviceTransports: () => transportMap } as any;

  health = new HealthServer({ port }, ulak, silentLogger, state === undefined ? undefined : () => state);
  health.start();

  const response = await fetch(`http://localhost:${port}/healthz/ready`);

  return { status: response.status, text: await response.text() };
};

// F2 shows readiness from computeReadiness; the probe must answer from the same rule, byte for byte.
describe('computeReadiness parity with HealthServer', () => {
  afterEach(() => {
    health?.stop();
    health = undefined;
  });

  const cases: [string, LifecycleState | undefined, Record<string, boolean>, number, string][] = [
    ['not started', LifecycleState.STARTING, {}, 503, '{"status":"not_ready","state":"STARTING","uptime":0}'],
    [
      'stopping with healthy transports',
      LifecycleState.STOPPING,
      { default: true },
      503,
      '{"status":"not_ready","state":"STOPPING","uptime":0}',
    ],
    ['started without transports', LifecycleState.STARTED, {}, 200, '{"status":"up","uptime":0}'],
    ['state unknown', undefined, {}, 200, '{"status":"up","uptime":0}'],
    [
      'every transport connected',
      LifecycleState.STARTED,
      { default: true, events: true },
      200,
      '{"status":"up","uptime":0,"transports":{"default":"connected","events":"connected"}}',
    ],
    [
      'one transport disconnected',
      LifecycleState.STARTED,
      { default: true, events: false },
      503,
      '{"status":"degraded","uptime":0,"transports":{"default":"connected","events":"disconnected"}}',
    ],
  ];

  for (const [label, state, connections, status, body] of cases) {
    test(label, async () => {
      const answer = await probe(state, transports(connections));
      const { uptime: _uptime, ...withoutUptime } = JSON.parse(answer.text);

      expect(answer.status).toBe(status);
      expect(answer.text).toBe(body);
      expect(computeReadiness(state, transports(connections))).toEqual(withoutUptime);
    });
  }
});
