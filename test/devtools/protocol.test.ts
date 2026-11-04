import { describe, expect, test } from 'bun:test';
import {
  agentMessage,
  DEVTOOLS_PROTOCOL_VERSION,
  type DevtoolsComponentType,
  type DevtoolsHttpMethod,
  type DevtoolsLifecycleState,
  hostMessage,
  isDevtoolsAgentMessage,
  isDevtoolsHostMessage,
} from '../../lib/devtools/protocol';
import { ComponentType } from '../../lib/ioc';
import { LifecycleState } from '../../lib/server/lifecycle';
import { HttpMethod } from '../../lib/server/web/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// protocol.ts copies these unions instead of importing them, so the CLI can vendor it. A new enum
// member that the copy lacks fails `bun run typecheck` here.
const componentTypesAgree: Equals<`${ComponentType}`, DevtoolsComponentType> = true;
const lifecycleStatesAgree: Equals<`${LifecycleState}`, DevtoolsLifecycleState> = true;
const httpMethodsAgree: Equals<Uppercase<`${HttpMethod}`>, DevtoolsHttpMethod> = true;

describe('devtools protocol', () => {
  test('mirrors the core enums it copies', () => {
    expect([componentTypesAgree, lifecycleStatesAgree, httpMethodsAgree]).toEqual([true, true, true]);
  });

  test('survives the IPC serialisation round trip in both directions', () => {
    const hello = agentMessage('hello', { coreVersion: '0.13.0', adapter: 'MockAdapter', port: 3000, pid: 42 });
    const command = hostMessage('command', {
      id: 'c-1',
      command: 'sendMessage',
      transport: 'default',
      pattern: 'inventory.reserve',
      kind: 'message',
      data: { sku: 'A-1' },
    });

    const helloBack = structuredClone(hello);
    const commandBack = structuredClone(command);

    expect(isDevtoolsAgentMessage(helloBack)).toBe(true);
    expect(helloBack).toEqual({ v: DEVTOOLS_PROTOCOL_VERSION, type: 'hello', payload: hello.payload });
    expect(isDevtoolsHostMessage(commandBack)).toBe(true);
    expect(commandBack.payload).toEqual(command.payload);
  });

  // Optional on both, so an agent that predates them still speaks v1.
  test('carries the microservice transports on hello and metrics', () => {
    const transports = [
      { name: 'default', connected: true },
      { name: 'audit', connected: false },
    ];
    const hello = agentMessage('hello', { coreVersion: '0.13.0', adapter: null, port: null, pid: 7, transports });
    const metrics = agentMessage('metrics', {
      rss: 1,
      heapUsed: 1,
      heapTotal: 1,
      cpuPercent: 0,
      eventLoopLagMs: 0,
      uptimeSeconds: 1,
      readiness: { status: 'degraded', transports: { default: 'connected', audit: 'disconnected' } },
      transports,
    });
    const bare = agentMessage('hello', { coreVersion: '0.13.0', adapter: null, port: null, pid: 7 });

    for (const message of [hello, metrics, bare]) {
      expect(isDevtoolsAgentMessage(structuredClone(message))).toBe(true);
    }

    expect(structuredClone(hello).payload.transports).toEqual(transports);
    expect(structuredClone(metrics).payload.transports).toEqual(transports);
  });

  test('rejects another protocol version, an unknown type and the wrong direction', () => {
    const result = agentMessage('commandResult', { id: 'c-1', ok: true });

    expect(isDevtoolsAgentMessage({ ...result, v: 2 })).toBe(false);
    expect(isDevtoolsAgentMessage({ ...result, type: 'reload' })).toBe(false);
    expect(isDevtoolsAgentMessage({ v: 1, type: 'hello' })).toBe(false);
    expect(isDevtoolsAgentMessage(null)).toBe(false);
    expect(isDevtoolsAgentMessage('hello')).toBe(false);
    expect(isDevtoolsHostMessage(result)).toBe(false);
    expect(isDevtoolsAgentMessage(hostMessage('command', { id: 'c-2', command: 'runSchedule', name: 'Nightly' }))).toBe(
      false,
    );
  });
});
