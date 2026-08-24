import type { Class } from '../../server/types';

export interface InjectableComponent {
  Class: Class;
  interface: string;
}

export interface Dependencies {
  [key: string]: string;
}

/**
 * Maps a field name to the class reference it was injected with.
 *
 * Only populated for class-based injections (`@Inject(UserService)`); string-based
 * injections (`@Inject('UserService')`) carry no class reference and are absent here.
 * Used by the test utilities to auto-generate method mocks from the real class shape.
 */
export interface DependencyClasses {
  [key: string]: Class;
}

export interface Expressions {
  [key: string]: (injectedClass: any) => any;
}

export interface Strategies {
  [key: string]: string;
}

/**
 * Options accepted by the @Value decorator. `default` is applied when the environment
 * variable is not set; `parse` converts the raw string before it lands on the field.
 */
export interface ValueOptions {
  default?: unknown;
  parse?: (raw: string) => unknown;
}

/**
 * The stored @Value metadata for one field. `default` is only present when the option
 * was given, so "was a default provided?" stays distinguishable from its value.
 */
export interface ValueSpec extends ValueOptions {
  key: string;
}

export interface ValueFields {
  [field: string]: ValueSpec;
}
