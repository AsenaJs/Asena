import { afterEach, describe, expect, test } from 'bun:test';
import { Container, type InjectableComponent, IocEngine } from '../../lib/ioc';
import { getBuildComponents } from '../../lib/ioc/component';
import { Service } from '../../lib/server/decorators';
import { createTestApp } from '../../lib/test/harness/createTestApp';
import { silentLogger } from '../../lib/test/harness/silentLogger';
import { createMockAdapter } from '../utils/createMockContext';
import { ImportedGreetingService } from '../fixtures/importsSources/ImportedGreetingService';
import { ClashingImport } from '../fixtures/importsSources/ClashingImport';
import { ScannedConsumerService } from '../fixtures/importsScan/ScannedConsumerService';
import { ScannedGreeterService } from '../fixtures/importsScan/ScannedGreeterService';

/**
 * The `imports` option: components handed in by packages, merged into whatever the
 * scan / `components` / the build-time list found, plus that build-time list itself.
 *
 * Every class that arrives through `imports` is declared in a fixture file rather than
 * in this one: under `bun test` the test file counts as an entry file, and classes
 * decorated here would reach the scan through the entry-declared path instead of
 * through `imports`, making the assertions pass for the wrong reason.
 */
const BUILD_COMPONENTS_KEY = Symbol.for('asena.buildComponents');

const SCAN_FOLDER = 'test/fixtures/importsScan';

const newEngine = (): IocEngine => {
  const engine = new IocEngine();

  (engine as any)['_container'] = new Container();

  return engine;
};

const bootApp = (options: { components?: any[]; imports?: (any | readonly any[])[] }) =>
  createTestApp({
    adapter: createMockAdapter().adapter as any,
    logger: silentLogger,
    components: options.components ?? [],
    imports: options.imports,
  });

describe('IocEngine imports', () => {
  test('registers imports alongside scanned components and wires them into scanned classes', async () => {
    const engine = newEngine();

    engine.setConfig({ sourceFolder: SCAN_FOLDER, rootFile: '' });

    await engine.searchAndRegister(undefined, [ImportedGreetingService]);

    expect(await engine.container.resolve<any>('ImportedGreetingService')).toBeInstanceOf(ImportedGreetingService);
    expect(await engine.container.resolve<any>('ScannedGreeterService')).toBeInstanceOf(ScannedGreeterService);

    const consumer = (await engine.container.resolve<ScannedConsumerService>(
      'ScannedConsumerService',
    )) as ScannedConsumerService;

    // The scanned consumer reaches a component that only exists because it was imported
    expect(consumer.greet()).toBe('imported');
  });

  test('registers imports alongside explicit components', async () => {
    @Service('ExplicitService')
    class ExplicitService {}

    const engine = newEngine();

    await engine.searchAndRegister([{ Class: ExplicitService, interface: null }], [ImportedGreetingService]);

    expect(engine.container.has('ExplicitService')).toBe(true);
    expect(engine.container.has('ImportedGreetingService')).toBe(true);
  });

  test('registers imports when there are no components, build list or config', async () => {
    const engine = newEngine();

    await engine.searchAndRegister(undefined, [ImportedGreetingService]);

    expect(engine.container.has('ImportedGreetingService')).toBe(true);
  });

  test('rejects an undecorated class in imports', async () => {
    class UndecoratedService {}

    const engine = newEngine();

    await expect(engine.searchAndRegister(undefined, [ImportedGreetingService, UndecoratedService])).rejects.toThrow(
      /imports entry UndecoratedService carries no component decorator/,
    );
  });

  test('rejects an import whose name collides with a scanned component', async () => {
    const engine = newEngine();

    engine.setConfig({ sourceFolder: SCAN_FOLDER, rootFile: '' });

    await expect(engine.searchAndRegister(undefined, [ClashingImport])).rejects.toThrow(
      'Duplicate component name detected',
    );
  });
});

describe('imports and the build-time component list', () => {
  afterEach(() => {
    delete (globalThis as any)[BUILD_COMPONENTS_KEY];
  });

  test('registers the build list when components is empty', async () => {
    @Service()
    class BuildListComponent {}

    (globalThis as any)[BUILD_COMPONENTS_KEY] = [BuildListComponent];

    await using app = await bootApp({});

    expect(app.container.has('BuildListComponent')).toBe(true);
  });

  test('an empty build list counts as absent and other sources are used', async () => {
    (globalThis as any)[BUILD_COMPONENTS_KEY] = [];

    expect(getBuildComponents()).toBeUndefined();

    await using app = await bootApp({ imports: [ImportedGreetingService] });

    expect(app.container.has('ImportedGreetingService')).toBe(true);
  });

  test('explicit components win over the build list, imports still merge in', async () => {
    @Service()
    class BuildListComponent {}

    @Service()
    class ExplicitWinnerService {}

    (globalThis as any)[BUILD_COMPONENTS_KEY] = [BuildListComponent];

    await using app = await bootApp({ components: [ExplicitWinnerService], imports: [ImportedGreetingService] });

    expect(app.container.has('ExplicitWinnerService')).toBe(true);
    expect(app.container.has('BuildListComponent')).toBe(false);
    expect(app.container.has('ImportedGreetingService')).toBe(true);
  });
});

describe('createTestApp imports', () => {
  test('registers imports passed through the harness', async () => {
    @Service()
    class HarnessImportedService {}

    await using app = await bootApp({ imports: [HarnessImportedService] });

    expect(app.container.has('HarnessImportedService')).toBe(true);
  });

  test('a class listed in both components and imports is registered once', async () => {
    await using app = await bootApp({ components: [ImportedGreetingService], imports: [ImportedGreetingService] });

    // A second registration under the same name would promote the entry to an array
    expect(Array.isArray(app.container.services['ImportedGreetingService'])).toBe(false);
    expect(await app.resolve('ImportedGreetingService')).toBeInstanceOf(ImportedGreetingService);
  });

  test('flattens one level of nesting in imports', async () => {
    @Service()
    class ImportedAlpha {}

    @Service()
    class ImportedBeta {}

    await using app = await bootApp({ imports: [[ImportedAlpha, ImportedBeta], ImportedGreetingService] });

    expect(app.container.has('ImportedAlpha')).toBe(true);
    expect(app.container.has('ImportedBeta')).toBe(true);
    expect(app.container.has('ImportedGreetingService')).toBe(true);
  });
});
