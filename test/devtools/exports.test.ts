import { describe, expect, test } from 'bun:test';
import manifest from '../../package.json';
import * as devtools from '../../lib/devtools';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The console calls the hook with the context alone. A public channel option would let an app wire
// the commands (run any schedule, publish to any transport) to a socket with no authentication.
const takesOnlyTheContext: Equals<
  Parameters<typeof devtools.attachDevtoolsAgent>,
  [context: devtools.DevtoolsServerContext]
> = true;
// @ts-expect-error the channel type is internal
type _Channel = devtools.DevtoolsChannel;
// @ts-expect-error the options type is internal
type _Options = devtools.DevtoolsAgentOptions;

// The console wrapper imports the agent from this subpath, resolved to an absolute path in the user's project.
describe('@asenajs/asena/devtools', () => {
  test('the agent takes the server context and nothing else', () => {
    expect(takesOnlyTheContext).toBe(true);
  });

  test('maps to the build output of lib/devtools/index.ts', () => {
    expect(manifest.exports['./devtools']).toEqual({
      import: './dist/lib/devtools/index.js',
      types: './dist/lib/devtools/index.d.ts',
    });
  });

  test('exposes the agent factory, the hook key, the snapshot builder and the protocol', () => {
    expect(typeof devtools.attachDevtoolsAgent).toBe('function');
    expect(devtools.DEVTOOLS_HOOK === Symbol.for('asena.devtools')).toBe(true);
    expect(typeof devtools.buildDevtoolsSnapshot).toBe('function');
    expect(devtools.DEVTOOLS_PROTOCOL_VERSION).toBe(1);
    expect(typeof devtools.agentMessage).toBe('function');
    expect(typeof devtools.isDevtoolsHostMessage).toBe('function');
  });
});
