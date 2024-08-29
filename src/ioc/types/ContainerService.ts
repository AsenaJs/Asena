import type { Class } from '../../server/types/Class';

export interface ContainerService {
  Class: Class;
  instance: any | null;
  singleton: boolean;
}
