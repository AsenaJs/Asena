/**
 * Abstract base class for Asena services.
 * Subclasses should implement the onStart method if needed.
 */
export abstract class AsenaService {

  protected onStart?(): void | Promise<void>;

}
