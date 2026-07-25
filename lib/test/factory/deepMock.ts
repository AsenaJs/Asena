import { mock } from 'bun:test';

/**
 * Keys that must NOT resolve to a mock function on a deep mock node.
 *
 * `then`/`catch`/`finally`: if property access returned a function, the node
 * would be treated as a thenable and `await deepMock` would never resolve.
 * `toJSON`: keeps JSON.stringify from invoking an auto-generated mock.
 */
const IGNORED_KEYS = new Set<PropertyKey>(['then', 'catch', 'finally', 'toJSON']);

/**
 * Creates a leaf mock: a REAL Bun mock function (no Proxy wrapper)
 *
 * Leaves must stay raw because Bun's expect() matchers and mock configuration
 * methods (mockReturnValue, mockResolvedValue...) brand-check their target -
 * a Proxy-wrapped mock fails "Expected value must be a mock function". The
 * default implementation returns a memoized deep node so call chains continue.
 *
 * @param path - Access path of this mock, used as the function name for debugging
 * @returns Bun mock function
 *
 * @internal
 */
function createDeepMockLeaf(path: string): any {
  let callResult: any;

  const leaf = mock(() => {
    callResult ??= createDeepMockNode(`${path}()`);

    return callResult;
  });

  Object.defineProperty(leaf, 'name', { value: path, configurable: true });

  return leaf;
}

/**
 * Creates a deep mock node
 *
 * A node is a Proxy whose target is a Bun mock function: the node is callable
 * (returning a memoized child node) and any unknown property resolves to a
 * memoized raw leaf mock.
 *
 * @param path - Access path of this node, used as the function name for debugging
 * @returns Proxy-wrapped mock function
 *
 * @internal
 */
function createDeepMockNode(path: string): any {
  let callResult: any;

  const fn = mock(() => {
    callResult ??= createDeepMockNode(`${path}()`);

    return callResult;
  });

  Object.defineProperty(fn, 'name', { value: path, configurable: true });

  const children = new Map<PropertyKey, any>();

  return new Proxy(fn, {
    get(target, key) {
      // Pass through everything that exists on the mock function itself
      // (mock state, Function.prototype members). Methods are bound to the
      // raw target so native brand checks keep working through the Proxy.
      if (Reflect.has(target, key)) {
        const value = Reflect.get(target, key, target);

        return typeof value === 'function' ? value.bind(target) : value;
      }

      if (IGNORED_KEYS.has(key)) {
        return undefined;
      }

      // Well-known symbols (Symbol.iterator, Symbol.toPrimitive, inspect
      // symbols...) fall back to engine defaults instead of becoming mocks
      if (typeof key === 'symbol') {
        return undefined;
      }

      // Memoized per key so repeated access returns the SAME mock function
      // and call counts accumulate across accesses
      if (!children.has(key)) {
        children.set(key, createDeepMockLeaf(`${path}.${String(key)}`));
      }

      return children.get(key);
    },
  });
}

/**
 * Creates a deep mock object backed by native Proxy
 *
 * Any property access returns a memoized Bun mock function, and calling one
 * returns another deep mock node - so arbitrary call chains work without any
 * upfront shape definition. Used by mockComponent to evaluate @Inject expression
 * transformations (e.g. the ulak() helper) without a running application.
 *
 * @returns Deep mock root node
 *
 * @example
 * ```typescript
 * const deepMock = createDeepMock();
 *
 * // Any chain works out of the box
 * const channel = deepMock.namespace('/chat');
 * await channel.broadcast({ text: 'hello' });
 *
 * expect(channel.broadcast).toHaveBeenCalledWith({ text: 'hello' });
 *
 * // Mocks are configurable like any Bun mock
 * channel.getSocketCount.mockReturnValue(5);
 * ```
 */
export function createDeepMock(): any {
  return createDeepMockNode('deepMock');
}
