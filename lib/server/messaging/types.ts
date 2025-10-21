/**
 * Error codes for Ulak messaging system
 */
export enum UlakErrorCode {
  NAMESPACE_NOT_FOUND = 'NAMESPACE_NOT_FOUND',
  NAMESPACE_ALREADY_EXISTS = 'NAMESPACE_ALREADY_EXISTS',
  INVALID_NAMESPACE = 'INVALID_NAMESPACE',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  SEND_FAILED = 'SEND_FAILED',
  BROADCAST_FAILED = 'BROADCAST_FAILED',
  SOCKET_NOT_FOUND = 'SOCKET_NOT_FOUND',
  SERVICE_NOT_INITIALIZED = 'SERVICE_NOT_INITIALIZED',
}

/**
 * Custom error class for Ulak messaging system
 * Provides structured error information with error codes
 */
export class UlakError extends Error {

  public readonly code: UlakErrorCode;

  public readonly namespace?: string;

  public readonly cause?: Error;

  constructor(message: string, code: UlakErrorCode, namespace?: string, cause?: Error) {
    super(message);
    this.name = 'UlakError';
    this.code = code;
    this.namespace = namespace;
    this.cause = cause;

    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UlakError);
    }
  }

}

/**
 * Operation types for bulk message sending
 */
export type BulkOperationType = 'broadcast' | 'room' | 'socket';

/**
 * A single operation in a bulk send
 */
export interface BulkOperation {
  /**
   * Type of operation
   */
  type: BulkOperationType;

  /**
   * Target namespace
   */
  namespace: string;

  /**
   * Room name (required for 'room' type)
   */
  room?: string;

  /**
   * Socket ID (required for 'socket' type)
   */
  socketId?: string;

  /**
   * Data to send
   */
  data: any;
}

/**
 * Result of a bulk send operation
 */
export interface BulkResult {
  /**
   * Total number of operations attempted
   */
  total: number;

  /**
   * Number of successful operations
   */
  succeeded: number;

  /**
   * Number of failed operations
   */
  failed: number;

  /**
   * Detailed results for each operation
   */
  results: PromiseSettledResult<void>[];
}
