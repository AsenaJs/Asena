/**
 * @description The message for a cycle, shared by every place that reports one. Internal:
 * deliberately not re-exported from the ioc index.
 * @param {readonly string[]} chain - The cycle, first and last entry equal (`A -> B -> A`)
 * @returns {string}
 */
export const cycleMessage = (chain: readonly string[]): string => `Circular dependency detected: ${chain.join(' -> ')}`;
