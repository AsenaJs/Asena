import * as path from 'node:path';
import type { Class } from '../../server/types';

/**
 * @description Registry of every class a component decorator has been applied to,
 * keyed by the class itself and valued by the file it was declared in.
 *
 * The IoC scan cannot import the application entry file. While the entry awaits
 * `AsenaServerFactory.create` at module scope it sits in the *evaluating-async*
 * state, so importing it is a cyclic dynamic import that never settles - Bun
 * >= 1.3.14 follows the spec here and waits on an evaluation that can only finish
 * once the scan returns. Declaring components directly in the entry file is still
 * supported: their decorators have already run by the time the scan starts, so the
 * scan reads them from this registry instead of from a module namespace.
 *
 * Stored under `Symbol.for` so a project that ends up with two copies of
 * `@asenajs/asena` still shares a single registry.
 */
const REGISTRY_KEY = Symbol.for('asena.componentRegistry');

type Registry = Map<Class, string | null>;

const getRegistry = (): Registry => {
  const store = globalThis as unknown as Record<symbol, Registry | undefined>;

  if (!store[REGISTRY_KEY]) {
    store[REGISTRY_KEY] = new Map();
  }

  return store[REGISTRY_KEY];
};

/**
 * The framework's own source tree - `<pkg>/lib` when running from source,
 * `<pkg>/dist/lib` when running the build. Frames below it belong to Asena itself
 * (the decorator factory, this file) and are never a declaration site.
 *
 * Deliberately narrower than the package root: test fixtures and example apps live
 * beside `lib`, and skipping the whole package would swallow them too.
 */
const FRAMEWORK_ROOT = path.resolve(import.meta.dir, '../..');

/**
 * Matches the trailing `/abs/path/file.ts:12:34` of a stack frame, with or without
 * parens. The column is optional: the module-level frame that a top-level class
 * declaration produces carries only a line number.
 */
const STACK_FRAME = /\(?((?:\/|[A-Za-z]:\\)[^()]+?):\d+(?::\d+)?\)?\s*$/;

/**
 * `reflect-metadata` installs `Reflect.decorate`, which TypeScript's `__decorate`
 * helper uses to apply decorators - so it sits between us and the declaring file.
 * Matches both a `node_modules/reflect-metadata/` layout and Bun's flattened
 * install cache (`reflect-metadata@0.2.2@@@1/`).
 */
const DECORATOR_PLUMBING = /[/\\]reflect-metadata[@/\\]/;

/**
 * @description Resolve the file a decorator was applied in, by walking the call
 * stack past Asena's own frames, past the decorator plumbing, and past runtime
 * internals (`bun:*`, `node:*`, which carry no absolute path and therefore never
 * match `STACK_FRAME`).
 *
 * Skipping only these - rather than everything under `node_modules` - keeps a
 * component declared inside a third-party package attributed to *that* package's
 * file. It then never matches an entry path, so importing such a package from the
 * entry file does not silently pull its components into the container.
 *
 * Returns null when the site cannot be determined; such a component is simply
 * never treated as entry-declared, which is the safe direction - it means the
 * file scan stays the only source for it.
 */
const declarationSite = (): string | null => {
  const previousLimit = Error.stackTraceLimit;

  // Asena's own frames plus the decorator plumbing put the declaring frame around
  // 6 levels up; a small limit keeps the capture cheap
  Error.stackTraceLimit = 20;

  const stack = new Error().stack;

  Error.stackTraceLimit = previousLimit;

  if (!stack) {
    return null;
  }

  for (const line of stack.split('\n')) {
    const match = STACK_FRAME.exec(line);

    if (!match) continue;

    const file = match[1];

    if (file.startsWith(FRAMEWORK_ROOT) || DECORATOR_PLUMBING.test(file)) continue;

    return file;
  }

  return null;
};

/**
 * @description Record a decorated class along with the file it was declared in.
 * Called from `defineComponent`, the single place that marks a class as an IoC
 * component.
 * @param {Class} target - The decorated class
 * @returns {void}
 */
export const registerDeclaredComponent = (target: Class): void => {
  getRegistry().set(target, declarationSite());
};

/**
 * @description Every registered class that was declared in one of the given files.
 * @param {ReadonlySet<string>} sourceFiles - Absolute, resolved file paths
 * @returns {Class[]} Classes declared in those files
 */
export const getComponentsDeclaredIn = (sourceFiles: ReadonlySet<string>): Class[] => {
  if (!sourceFiles.size) {
    return [];
  }

  const components: Class[] = [];

  for (const [target, file] of getRegistry()) {
    if (file !== null && sourceFiles.has(file)) {
      components.push(target);
    }
  }

  return components;
};

/**
 * @description Clear the registry. The registry outlives any single application,
 * so tests that boot more than one app in the same process use this to keep
 * components from one run leaking into the next.
 * @returns {void}
 */
export const resetComponentRegistry = (): void => {
  getRegistry().clear();
};
