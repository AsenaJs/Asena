import { matchesEventPattern } from './eventPatternMatcher';

/**
 * @description Shared pattern → handler index with the hybrid lookup strategy
 * used across Asena's event and messaging systems:
 *
 * - Exact patterns → Map (O(1) lookup on collect)
 * - Wildcard patterns → Array (O(n) matchesEventPattern check, smaller n)
 *
 * Consumers: EventDispatchService (in-process events), InMemoryTransport and
 * RedisMicroserviceTransport (microservice event handlers). The generic type T
 * lets each consumer store what it needs (a bare handler or a subscription object).
 *
 * Collection order: exact matches first (registration order), then wildcard
 * matches (registration order).
 */
export class PatternHandlerIndex<T> {
  /**
   * Exact pattern → entries (O(1) fast path)
   */
  private exact = new Map<string, T[]>();

  /**
   * Wildcard patterns, matched with matchesEventPattern on collect
   */
  private wildcard: { pattern: string; entry: T }[] = [];

  /**
   * Register an entry under a pattern
   */
  public add(pattern: string, entry: T): void {
    if (pattern.includes('*')) {
      this.wildcard.push({ pattern, entry });
      return;
    }

    const entries = this.exact.get(pattern) || [];

    entries.push(entry);
    this.exact.set(pattern, entries);
  }

  /**
   * Remove a specific entry registered under a pattern (identity comparison)
   *
   * @returns true if the entry was found and removed
   */
  public remove(pattern: string, entry: T): boolean {
    if (pattern.includes('*')) {
      const index = this.wildcard.findIndex((item) => item.pattern === pattern && item.entry === entry);

      if (index !== -1) {
        this.wildcard.splice(index, 1);
        return true;
      }

      return false;
    }

    const entries = this.exact.get(pattern);

    if (!entries) {
      return false;
    }

    const index = entries.indexOf(entry);

    if (index === -1) {
      return false;
    }

    entries.splice(index, 1);

    if (!entries.length) {
      this.exact.delete(pattern);
    }

    return true;
  }

  /**
   * Collect all entries whose pattern matches the given event name
   */
  public collect(eventName: string): T[] {
    const result: T[] = [...(this.exact.get(eventName) || [])];

    for (const item of this.wildcard) {
      if (matchesEventPattern(eventName, item.pattern)) {
        result.push(item.entry);
      }
    }

    return result;
  }

  /**
   * All registered patterns - exact first (registration order), then wildcard
   *
   * Diagnostics only: consumers use it to explain why an expected source
   * matched no handler (e.g. the Kafka transport's external-topic hint).
   */
  public patterns(): string[] {
    return [...this.exact.keys(), ...this.wildcard.map((item) => item.pattern)];
  }

  /**
   * Whether the index holds no entries at all
   */
  public get isEmpty(): boolean {
    return this.exact.size === 0 && this.wildcard.length === 0;
  }

  /**
   * Remove all entries
   */
  public clear(): void {
    this.exact.clear();
    this.wildcard = [];
  }
}
