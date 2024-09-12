import type { Class } from '../../server/types';

export interface Component {
  Class: Class;
  interface: string;
}

export interface Injectable {
  [key: string]: Class | Class[];
}

export interface Strategies {
  [key: string]: string;
}
