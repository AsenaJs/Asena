import { type ComponentParams, ComponentType } from '../../../ioc';
import { defineComponent } from '../../../ioc/component';

/**
 * Decorator for defining a PostProcessor component.
 *
 * PostProcessors hook into the component creation lifecycle and can modify or inspect
 * instances after they are fully initialized (constructor + DI + PostConstruct).
 *
 * PostProcessor components and their dependencies are registered BEFORE other components
 * (Phase A) and are NOT themselves post-processed.
 *
 * @param {ComponentParams | string} [params] - Optional parameters (name, scope).
 * @returns {ClassDecorator} - The class decorator for the PostProcessor.
 *
 * @example
 * ```typescript
 * @PostProcessor()
 * class TracingPostProcessor implements ComponentPostProcessor {
 *   postProcess<T>(instance: T, Class: any): T {
 *     // Wrap with tracing proxy
 *     return new Proxy(instance, { ... });
 *   }
 * }
 * ```
 */
export const PostProcessor = (params?: ComponentParams | string): ClassDecorator => {
  return defineComponent(ComponentType.POST_PROCESSOR, params || {});
};
