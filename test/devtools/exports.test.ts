import { describe, expect, test } from 'bun:test';
import manifest from '../../package.json';
import * as devtools from '../../lib/devtools';

// The console wrapper imports the agent from this subpath, resolved to an absolute path in the user's project.
describe('@asenajs/asena/devtools', () => {
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
