/**
 * @description The message for a cycle. Internal: not re-exported from the ioc index.
 * @param {readonly string[]} chain - The path ending on the repeated key (`A -> B -> A`)
 * @returns {string}
 */
export const cycleMessage = (chain: readonly string[]): string => `Circular dependency detected: ${chain.join(' -> ')}`;
