import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const LIB = path.resolve(import.meta.dir, '../../lib');

let appDir: string;

/**
 * The fixture is written to a temp directory rather than committed under `test/`
 * on purpose: it needs a real `asena-config.ts`, and any file by that name inside
 * the package would be picked up by `readConfigFile()` during the rest of the suite.
 */
const writeFixtureApp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-tla-entry-'));

  fs.mkdirSync(path.join(root, 'src/services'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'asena-config.ts'),
    `export default { sourceFolder: 'src', rootFile: 'src/index.ts' };\n`,
  );

  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: false,
          skipLibCheck: true,
        },
      },
      null,
      2,
    ),
  );

  // A component in its own file, found by the scan, that depends by name on the one
  // declared in the entry - so a successful resolve proves the entry component made it
  fs.writeFileSync(
    path.join(root, 'src/services/ScannedService.ts'),
    `import { Service } from '${LIB}/server/decorators';
import { Inject, PostConstruct } from '${LIB}/ioc/component';

@Service()
export class ScannedService {
  @Inject('InlineEntryService')
  private inline: { whoAmI: () => string };

  @PostConstruct()
  public report(): void {
    console.log(\`RESOLVED:\${this.inline.whoAmI()}\`);
  }
}
`,
  );

  fs.writeFileSync(
    path.join(root, 'src/index.ts'),
    `import 'reflect-metadata';
import { AsenaServerFactory } from '${LIB}/server/AsenaServerFactory';
import { Service } from '${LIB}/server/decorators';

const logger = {
  info: () => {},
  warn: (message: string) => console.log(\`WARN:\${message}\`),
  error: (message: string, meta?: unknown) => console.log(\`ERROR:\${message}\`, meta ?? ''),
  profile: () => {},
};

// Declared in the entry file, above the bootstrap call
@Service()
export class InlineEntryService {
  public whoAmI(): string {
    return 'InlineEntryService';
  }
}

// Top-level await: importing this module while it is suspended here is what deadlocked
const server = await AsenaServerFactory.create({ headless: true, logger });

// Declared after create() - too late to be registered, must be reported
@Service()
export class TooLateService {}

await server.start();

console.log('BOOT_OK');
process.exit(0);
`,
  );

  return root;
};

/**
 * Booted in a real subprocess rather than in-process: the defect only appears when
 * the entry module is genuinely mid-evaluation, suspended on its own top-level await,
 * while the component scan runs. Importing the fixture from here would evaluate it to
 * completion first and hide exactly the state under test.
 */
const bootFixtureApp = async (): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> => {
  const proc = Bun.spawn(['bun', 'src/index.ts'], { cwd: appDir, stdout: 'pipe', stderr: 'pipe' });

  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, 20_000);

  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  await proc.exited;
  clearTimeout(timer);

  return { output: stdout + stderr, exitCode: proc.exitCode, timedOut };
};

describe('component scan and the application entry file', () => {
  beforeAll(() => {
    appDir = writeFixtureApp();
  });

  afterAll(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  test('boots an entry that uses top-level await instead of deadlocking', async () => {
    const { output, exitCode, timedOut } = await bootFixtureApp();

    // Before the fix the scan imported the entry while it was suspended on its own
    // top-level await, so this hung forever with no output at all
    expect(timedOut).toBe(false);
    expect(output).toContain('BOOT_OK');
    expect(exitCode).toBe(0);
  }, 30_000);

  test('registers components declared in the entry file and injects them elsewhere', async () => {
    const { output } = await bootFixtureApp();

    // The entry is never imported by the scan, so this only passes if the component
    // came from the decorator registry - and it resolved by name from a scanned file
    expect(output).toContain('RESOLVED:InlineEntryService');
  }, 30_000);

  test('reports components declared after the bootstrap call', async () => {
    const { output } = await bootFixtureApp();

    expect(output).toContain('TooLateService');
    expect(output).toContain('declared after the AsenaServerFactory.create() call');
  }, 30_000);
});
