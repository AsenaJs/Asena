/**
 * Interface for post-processing component instances after creation.
 *
 * PostProcessors run once at startup during component creation (NOT on every method call).
 * They are registered in FIFO order and executed sequentially.
 *
 * Two usage modes:
 * - **Mode 1 (Instance Transformation):** Return a modified instance (e.g., Proxy wrapper for tracing)
 * - **Mode 2 (Metadata Collection):** Read metadata and return the original instance unchanged
 *
 * @example
 * ```typescript
 * @PostProcessor()
 * class TracingPostProcessor implements ComponentPostProcessor {
 *   postProcess<T>(instance: T, Class: any): T {
 *     return new Proxy(instance, { ... }); // Mode 1: wrap with Proxy
 *   }
 * }
 * ```
 */
export interface ComponentPostProcessor {
  /**
   * Process a component instance after creation and dependency injection.
   *
   * @param instance - The fully initialized component instance (after DI + PostConstruct)
   * @param Class - The original class constructor (for metadata reading)
   * @returns The processed instance (same or modified). Return null/undefined to keep original.
   */
  postProcess<T>(instance: T, Class: any): T | Promise<T>;
}
