export interface ServerService {
  onStart?: () => void | Promise<void>;
}
