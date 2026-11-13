import { cycleMessage } from './cycleMessage';

/**
 * @description Custom error class for circular dependency detection
 * Provides detailed information about the circular dependency chain
 */
export class CircularDependencyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

/**
 * @description Public detector for circular dependencies, kept for API compatibility.
 * The container no longer uses it: it keeps the resolution path per call chain, so a
 * shared stack like this one cannot tell two overlapping resolves apart.
 */
export class CircularDependencyDetector {
  private resolutionStack: Set<string> = new Set();

  /**
   * @description Check if service creates circular dependency
   * @param {string} serviceName - The service being resolved
   * @throws {CircularDependencyError} If circular dependency is detected
   * @returns {void}
   */
  public checkCircular(serviceName: string): void {
    if (this.resolutionStack.has(serviceName)) {
      const stack = Array.from(this.resolutionStack);

      throw new CircularDependencyError(cycleMessage([...stack, serviceName]));
    }
  }

  /**
   * @description Push service to resolution stack
   * @param {string} serviceName - The service being resolved
   * @returns {void}
   */
  public push(serviceName: string): void {
    this.resolutionStack.add(serviceName);
  }

  /**
   * @description Pop service from resolution stack
   * @param {string} serviceName - The service that was resolved
   * @returns {void}
   */
  public pop(serviceName: string): void {
    this.resolutionStack.delete(serviceName);
  }

  /**
   * @description Clear the resolution stack
   * Useful for testing or manual stack reset
   * @returns {void}
   */
  public clear(): void {
    this.resolutionStack.clear();
  }

  /**
   * @description Get current resolution stack as array
   * @returns {string[]} Array of service names in resolution order
   */
  public getStack(): string[] {
    return Array.from(this.resolutionStack);
  }

  /**
   * @description Check if stack is empty
   * @returns {boolean}
   */
  public isEmpty(): boolean {
    return this.resolutionStack.size === 0;
  }
}
