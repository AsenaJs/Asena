import type { Class } from '../../server/types';

export interface ContainerService {
  Class: Class;
  instance: any | null;
  singleton: boolean;
}
