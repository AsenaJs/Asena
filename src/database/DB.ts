export interface DB<T> {
  initialize: () => Promise<T>;
  destroy: () => Promise<void>;
}
