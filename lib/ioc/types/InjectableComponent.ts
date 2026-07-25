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
