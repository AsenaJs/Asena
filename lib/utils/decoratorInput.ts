export function assertStringMemberKey(propertyKey: string | symbol, decorator: string): asserts propertyKey is string {
  if (typeof propertyKey === 'symbol') {
    throw new TypeError(`${decorator} supports string member names only, received ${String(propertyKey)}.`);
  }
}
