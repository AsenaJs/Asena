import type { Class } from '../../server/types';

export interface InjectableComponent {
  Class: Class;
  interface: string;
}

export interface Dependencies {
  [key: string]: string;
}

export interface Expressions {
  [key: string]: (injectedClass: any) => any;
}

export interface Strategies {
  [key: string]: string;
}
