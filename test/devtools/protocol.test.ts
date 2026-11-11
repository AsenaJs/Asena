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
    const hello = agentMessage('hello', {
      serverId: 'server-1',
      coreVersion: '0.13.0',
      adapter: 'MockAdapter',
      port: 3000,
      pid: 42,
    });
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
    const serverId = 'server-1';
    const readiness = { status: 'degraded', transports: { default: 'connected', audit: 'disconnected' } } as const;
    const hello = agentMessage('hello', {
      serverId,
      coreVersion: '0.13.0',
      adapter: null,
      port: null,
      pid: 7,
      transports,
    });
    const metrics = agentMessage('metrics', {
      rss: 1,
      heapUsed: 1,
      heapTotal: 1,
      cpuPercent: 0,
      eventLoopLagMs: 0,
      uptimeSeconds: 1,
      readiness,
      transports,
      servers: { [serverId]: { readiness, transports } },
    });
    const bare = agentMessage('hello', { serverId, coreVersion: '0.13.0', adapter: null, port: null, pid: 7 });

    for (const message of [hello, metrics, bare]) {
      expect(isDevtoolsAgentMessage(structuredClone(message))).toBe(true);
    }

    expect(structuredClone(hello).payload.transports).toEqual(transports);
    expect(structuredClone(metrics).payload.transports).toEqual(transports);
  });

  // The id is one more field of v1 messages a host already reads, and `serverStopped` is a type such a
  // host drops at its guard, so the version did not move.
  test('names the server on v1 messages, and announces a stopped one', () => {
    const stopped = structuredClone(agentMessage('serverStopped', { serverId: 'server-2' }));
    const command = structuredClone(
      hostMessage('command', { id: 'c-1', serverId: 'server-2', command: 'runSchedule', name: 'Nightly' }),
    );
    const result = structuredClone(agentMessage('commandResult', { id: 'c-1', serverId: 'server-2', ok: true }));

    expect(DEVTOOLS_PROTOCOL_VERSION).toBe(1);
    expect(isDevtoolsAgentMessage(stopped)).toBe(true);
    expect(stopped.payload).toEqual({ serverId: 'server-2' });
    expect(isDevtoolsHostMessage(stopped)).toBe(false);
    expect(isDevtoolsHostMessage(command)).toBe(true);
    expect(command.payload.serverId).toBe('server-2');
    expect(isDevtoolsAgentMessage(result)).toBe(true);
    expect(result.payload.serverId).toBe('server-2');
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

  // The agent reads the payload's fields, so a payload it cannot read must never pass the guard.
  test('rejects a payload that is not an object, and a command without a string id', () => {
    for (const payload of [null, 'runSchedule', 42, true]) {
      expect(isDevtoolsHostMessage({ v: 1, type: 'command', payload })).toBe(false);
      expect(isDevtoolsAgentMessage({ v: 1, type: 'hello', payload })).toBe(false);
    }

    expect(isDevtoolsHostMessage({ v: 1, type: 'command', payload: { command: 'runSchedule', name: 'Nightly' } })).toBe(
      false,
    );
    expect(
      isDevtoolsHostMessage({ v: 1, type: 'command', payload: { id: 7, command: 'runSchedule', name: 'Nightly' } }),
    ).toBe(false);
  });
});
