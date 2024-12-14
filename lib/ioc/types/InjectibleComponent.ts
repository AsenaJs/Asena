import type { Class } from '../../server/types';

export interface InjectibleComponent {
  Class: Class;
  interface: string;
}

export interface Dependencies {
  [key: string]: string;
}

export interface Expressions {
  [key: string]: (injectedClass) => any;
}

export interface Strategies {
  [key: string]: string;
}
