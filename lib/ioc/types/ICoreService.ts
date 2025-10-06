/**
 * @description Interface for core framework services
 * Provides lifecycle hooks for initialization and cleanup
 */
export interface ICoreService {
  readonly serviceName: string;
  onInit?(): Promise<void> | void;
  onDestroy?(): Promise<void> | void;
}

