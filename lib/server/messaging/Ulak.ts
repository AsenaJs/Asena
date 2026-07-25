import type { AsenaWebSocketService } from '../web/websocket';
import { CoreService, type ICoreService, ICoreServiceNames } from '../../ioc';
import { type BulkOperation, type BulkResult, UlakError, UlakErrorCode } from './types';
import { Inject } from '../../ioc/component';
import { blue, type ServerLogger } from '../../logger';
import { DEFAULT_TRANSPORT_NAME } from '../microservice/types';
import { composeOnSend } from '../microservice/interceptorChain';
import type { MessagingInterceptor, OutboundContext } from '../microservice/types';
import type { EmitOptions, MicroserviceTransport, SendOptions } from '../microservice/MicroserviceTransport';

/**
 * @description Options for Ulak microservice sends - adds named transport selection
 */
export interface UlakSendOptions extends SendOptions {
  /**
   * Named microservice transport to use (multi-broker projects)
   * @default 'default'
   */
  transport?: string;
}

/**
 * @description Options for Ulak microservice emits - adds named transport selection
 */
export interface UlakEmitOptions extends EmitOptions {
  /**
   * Named microservice transport to use (multi-broker projects)
   * @default 'default'
   */
  transport?: string;
}

/**
 * Central WebSocket message broker for Asena.js
 *
 * Ulak (Turkish: Messenger/Courier) provides a centralized way to send WebSocket messages
 * without circular dependencies. Services can inject Ulak to send messages to any
 * WebSocket namespace without directly injecting WebSocket services.
 *
 * @example
 * ```typescript
 * @Service('UserService')
 * class UserService {
 *   @Inject(ulak("/notifications"))
 *   private notifications: Ulak.NameSpace<"/notifications">;
 *
 *   async createUser(data: any) {
 *     const user = await this.saveUser(data);
 *     await this.notifications.broadcast({ type: 'user_created', user });
 *   }
 * }
 * ```
 */
@CoreService(ICoreServiceNames.__ULAK__)
export class Ulak implements ICoreService {
  public readonly serviceName: string = 'Ulak';

  /**
   * Logger instance injected from CoreContainer
   */
  @Inject(ICoreServiceNames.SERVER_LOGGER)
  private logger: ServerLogger;

  /**
   * Map of namespace path to WebSocket service instance
   */
  private namespaces: Map<string, AsenaWebSocketService<any>> = new Map();

  /**
   * Named microservice transports (set during bootstrap by PrepareMicroserviceService)
   */
  private microserviceTransports: Map<string, MicroserviceTransport> = new Map();

  /**
   * Messaging interceptors applied to all outgoing send/emit calls
   */
  private microserviceInterceptors: MessagingInterceptor[] = [];

  /**
   * Initialize Ulak messaging system
   * Called after dependency injection is complete
   */
  public async init(): Promise<void> {
    this.logger.info(`${blue('[Ulak]')} Initializing WebSocket messaging system ready`);
  }

  /**
   * Register a WebSocket namespace
   * Called automatically during WebSocket service initialization
   *
   * @param path - The namespace path (e.g., "/notifications")
   * @param service - The WebSocket service instance
   */
  public registerNamespace(path: string, service: AsenaWebSocketService<any>): void {
    if (this.namespaces.has(path)) {
      this.logger.warn(`${blue('[Ulak]')} Namespace "${path}" already registered, skipping`);
      return;
    }

    this.namespaces.set(path, service);
    this.logger.info(`${blue('[Ulak]')} Namespace "${path}" registered`);
  }

  /**
   * Unregister a WebSocket namespace
   * Useful for cleanup and preventing memory leaks
   *
   * @param path - The namespace path to unregister
   */
  public unregisterNamespace(path: string): void {
    if (!this.namespaces.has(path)) {
      this.logger.warn(`${blue('[Ulak]')} Cannot unregister namespace "${path}" - not found`);
      return;
    }

    this.namespaces.delete(path);
    this.logger.info(`${blue('[Ulak]')} Namespace "${path}" unregistered`);
  }

  /**
   * Select a specific namespace for scoped operations
   * Returns a scoped namespace interface for ergonomic API
   *
   * @param path - The namespace path
   * @returns Scoped namespace instance
   *
   * @example
   * ```typescript
   * const chat = ulak.namespace('/chat');
   * await chat.broadcast({ message: 'Hello' }); // No need to repeat '/chat'
   * ```
   */
  public namespace<T extends string>(path: T): Ulak.NameSpace<T> {
    return new UlakNameSpace(path, this);
  }

  /**
   * Broadcast message to all clients in a namespace
   *
   * @param namespace - The target namespace
   * @param data - The data to send
   * @throws {UlakError} If namespace not found or broadcast fails
   */
  public async broadcast(namespace: string, data: any): Promise<void> {
    try {
      const service = this.getNamespaceService(namespace);

      // Use service's in() method to broadcast to all clients
      service.in(data);
    } catch (error) {
      this.logger.error(`${blue('[Ulak]')} Broadcast failed for namespace "${namespace}"`, error);

      // If already a UlakError (e.g., NAMESPACE_NOT_FOUND), rethrow as-is
      if (error instanceof UlakError) {
        throw error;
      }

      throw new UlakError(
        `Failed to broadcast to namespace: ${namespace}`,
        UlakErrorCode.BROADCAST_FAILED,
        namespace,
        error as Error,
      );
    }
  }

  /**
   * Send message to specific room in a namespace
   *
   * @param namespace - The target namespace
   * @param room - The room name
   * @param data - The data to send
   * @throws {UlakError} If namespace not found or send fails
   */
  public async to(namespace: string, room: string, data: any): Promise<void> {
    try {
      const service = this.getNamespaceService(namespace);

      // Use service's to() method to send to specific room
      service.to(room, data);
    } catch (error) {
      this.logger.error(`${blue('[Ulak]')} Send to room "${room}" failed in namespace "${namespace}"`, error);

      // If already a UlakError (e.g., NAMESPACE_NOT_FOUND), rethrow as-is
      if (error instanceof UlakError) {
        throw error;
      }

      throw new UlakError(
        `Failed to send to room "${room}" in namespace: ${namespace}`,
        UlakErrorCode.SEND_FAILED,
        namespace,
        error as Error,
      );
    }
  }

  /**
   * Send message to specific socket by ID
   *
   * @param namespace - The target namespace
   * @param socketId - The socket ID
   * @param data - The data to send
   * @throws {UlakError} If namespace not found, socket not found, or send fails
   */
  public async toSocket(namespace: string, socketId: string, data: any): Promise<void> {
    try {
      const service = this.getNamespaceService(namespace);

      // Try direct send first (fastest path - local socket)
      const socket = service.sockets.get(socketId);

      if (socket) {
        socket.send(typeof data === 'string' ? data : JSON.stringify(data));
        return;
      }

      // Cross-pod fallback: publish to the socket's ID topic
      // Each socket auto-subscribes to its own ID in onOpenInternal(),
      // so the transport will deliver the message to the correct pod
      service.to(socketId, data);
    } catch (error) {
      this.logger.error(`${blue('[Ulak]')} Send to socket "${socketId}" failed in namespace "${namespace}"`, error);

      if (error instanceof UlakError) {
        throw error;
      }

      throw new UlakError(
        `Failed to send to socket "${socketId}" in namespace: ${namespace}`,
        UlakErrorCode.SEND_FAILED,
        namespace,
        error as Error,
      );
    }
  }

  /**
   * Send to multiple rooms at once (parallel execution)
   *
   * @param namespace - The target namespace
   * @param rooms - Array of room names
   * @param data - The data to send
   */
  public async toMany(namespace: string, rooms: string[], data: any): Promise<void> {
    const results = await Promise.allSettled(rooms.map((room) => this.to(namespace, room, data)));

    // Track failures
    const failures = results.filter((r) => r.status === 'rejected');

    if (failures.length > 0) {
      this.logger.warn(
        `${blue('[Ulak]')} Batch send failed for ${failures.length}/${rooms.length} rooms in "${namespace}"`,
      );
    }
  }

  /**
   * Broadcast to all registered namespaces
   *
   * @param data - The data to send
   */
  public async broadcastAll(data: any): Promise<void> {
    const namespaces = Array.from(this.namespaces.keys());
    const results = await Promise.allSettled(namespaces.map((ns) => this.broadcast(ns, data)));

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.info(`${blue('[Ulak]')} Broadcast to all: ${succeeded} succeeded, ${failed} failed`);
  }

  /**
   * Send different messages to different targets (bulk operation)
   *
   * @param operations - Array of operations to perform
   * @returns Result summary
   */
  public async bulkSend(operations: BulkOperation[]): Promise<BulkResult> {
    const results = await Promise.allSettled(
      operations.map((op) => {
        switch (op.type) {
          case 'broadcast':
            return this.broadcast(op.namespace, op.data);

          case 'room':
            if (!op.room) {
              return Promise.reject(new Error('Room name required for room operation'));
            }

            return this.to(op.namespace, op.room, op.data);

          case 'socket':
            if (!op.socketId) {
              return Promise.reject(new Error('Socket ID required for socket operation'));
            }

            return this.toSocket(op.namespace, op.socketId, op.data);

          default:
            return Promise.reject(new Error(`Invalid operation type: ${(op as any).type}`));
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.info(`${blue('[Ulak]')} Bulk send: ${succeeded}/${operations.length} succeeded, ${failed} failed`);

    return {
      total: operations.length,
      succeeded,
      failed,
      results,
    };
  }

  /**
   * Get all active namespaces
   *
   * @returns Array of namespace paths
   */
  public getNamespaces(): string[] {
    return Array.from(this.namespaces.keys());
  }

  /**
   * Check if namespace exists
   *
   * @param namespace - The namespace to check
   * @returns True if namespace is registered
   */
  public hasNamespace(namespace: string): boolean {
    return this.namespaces.has(namespace);
  }

  /**
   * Get socket count for a namespace
   *
   * @param namespace - The namespace to query
   * @returns Number of active sockets
   */
  public getSocketCount(namespace: string): number {
    const service = this.namespaces.get(namespace);

    return service ? service.sockets.size : 0;
  }

  /**
   * Wire the microservice transports into Ulak
   * Called during bootstrap by PrepareMicroserviceService - not intended for user code
   *
   * @param transports - Named transports ('default' for the single-transport form)
   * @param interceptors - Interceptors applied to all outgoing send/emit calls
   */
  public setMicroserviceTransports(
    transports: Map<string, MicroserviceTransport>,
    interceptors: MessagingInterceptor[] = [],
  ): void {
    this.microserviceTransports = transports;
    this.microserviceInterceptors = interceptors;
  }

  /**
   * Check if a microservice transport is configured and connected
   *
   * @param transport - Named transport to check
   * @returns True when the transport exists and reports a live connection
   */
  public isMicroserviceConnected(transport: string = DEFAULT_TRANSPORT_NAME): boolean {
    const instance = this.microserviceTransports.get(transport);

    return instance ? instance.isConnected : false;
  }

  /**
   * Get all configured microservice transports (read-only)
   * Used by the health endpoint to report per-transport status
   */
  public getMicroserviceTransports(): ReadonlyMap<string, MicroserviceTransport> {
    return this.microserviceTransports;
  }

  /**
   * Send a request to another service and await its reply (request/response)
   *
   * @param pattern - Full request pattern (e.g. 'order.create')
   * @param data - Request payload
   * @param options - Timeout, headers and named transport selection
   * @returns The reply produced by the remote @MessagePattern handler
   * @throws {UlakError} NO_TRANSPORT / TRANSPORT_NOT_FOUND / TIMEOUT / REMOTE_ERROR
   */
  public async send<T = unknown>(pattern: string, data?: unknown, options?: UlakSendOptions): Promise<T> {
    if (!pattern) {
      // Fail fast: an empty pattern would otherwise create a nonsense broker
      // stream and burn the full request timeout before surfacing
      throw new UlakError('Pattern cannot be empty', UlakErrorCode.SEND_FAILED);
    }

    const transport = this.getMicroserviceTransport(options?.transport);

    const ctx: OutboundContext = { pattern, kind: 'send', headers: { ...options?.headers }, data };

    return composeOnSend(this.microserviceInterceptors, ctx, () =>
      transport.send<T>(pattern, data, { timeout: options?.timeout, headers: ctx.headers }),
    ) as Promise<T>;
  }

  /**
   * Emit a fire-and-forget event to other services
   *
   * @param pattern - Full event pattern (e.g. 'order.created')
   * @param data - Event payload
   * @param options - Headers and named transport selection
   * @throws {UlakError} NO_TRANSPORT / TRANSPORT_NOT_FOUND
   */
  public async emit(pattern: string, data?: unknown, options?: UlakEmitOptions): Promise<void> {
    if (!pattern) {
      throw new UlakError('Pattern cannot be empty', UlakErrorCode.SEND_FAILED);
    }

    const transport = this.getMicroserviceTransport(options?.transport);

    const ctx: OutboundContext = { pattern, kind: 'emit', headers: { ...options?.headers }, data };

    await composeOnSend(this.microserviceInterceptors, ctx, () =>
      transport.emit(pattern, data, { headers: ctx.headers }),
    );
  }

  /**
   * Select a pattern-scoped microservice messaging view
   * Patterns passed to the returned view are joined with the prefix ('order' + 'create' → 'order.create')
   *
   * @param prefix - Pattern prefix (empty for absolute patterns)
   * @param options - Named transport selection
   * @returns Scoped messages instance
   *
   * @example
   * ```typescript
   * const orders = ulak.messages('order');
   * const res = await orders.send('create', dto); // sends 'order.create'
   * ```
   */
  public messages<T extends string = ''>(prefix?: T, options?: { transport?: string }): Ulak.Messages<T> {
    return new UlakMessages((prefix || '') as T, this, options?.transport);
  }

  /**
   * Dispose of all resources and stop background tasks
   * Should be called during application shutdown
   */
  public dispose(): void {
    // Unregister all namespaces
    const namespaces = Array.from(this.namespaces.keys());

    for (const namespace of namespaces) {
      this.unregisterNamespace(namespace);
    }

    this.logger.info(`${blue('[Ulak]')} Disposed`);
  }

  /**
   * Get namespace service or throw error
   *
   * @param namespace - The namespace to retrieve
   * @returns The WebSocket service
   * @throws {UlakError} If namespace not found
   */
  private getNamespaceService(namespace: string): AsenaWebSocketService<any> {
    const service = this.namespaces.get(namespace);

    if (!service) {
      throw new UlakError(`Namespace "${namespace}" not found in Ulak`, UlakErrorCode.NAMESPACE_NOT_FOUND, namespace);
    }

    return service;
  }

  /**
   * Get a named microservice transport or throw
   *
   * @param name - Named transport (defaults to 'default')
   * @throws {UlakError} NO_TRANSPORT when none configured, TRANSPORT_NOT_FOUND for unknown names
   */
  private getMicroserviceTransport(name: string = DEFAULT_TRANSPORT_NAME): MicroserviceTransport {
    if (this.microserviceTransports.size === 0) {
      throw new UlakError(
        'No microservice transport configured - configure a microservice transport in your @Config transport()',
        UlakErrorCode.NO_TRANSPORT,
      );
    }

    const transport = this.microserviceTransports.get(name);

    if (!transport) {
      const available = Array.from(this.microserviceTransports.keys()).join(', ');

      throw new UlakError(
        `Microservice transport "${name}" not found - available transports: ${available}`,
        UlakErrorCode.TRANSPORT_NOT_FOUND,
      );
    }

    return transport;
  }
}

/**
 * Scoped namespace interface
 * Provides ergonomic API without repeating namespace path
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Ulak {
  export interface NameSpace<T extends string = string> {
    /**
     * The namespace path
     */
    readonly path: T;

    /**
     * Broadcast to all clients in this namespace
     *
     * @param data - The data to send
     */
    broadcast(data: any): Promise<void>;

    /**
     * Send to specific room in this namespace
     *
     * @param room - The room name
     * @param data - The data to send
     */
    to(room: string, data: any): Promise<void>;

    /**
     * Send to specific socket by ID in this namespace
     *
     * @param socketId - The socket ID
     * @param data - The data to send
     */
    toSocket(socketId: string, data: any): Promise<void>;

    /**
     * Send to multiple rooms at once
     *
     * @param rooms - Array of room names
     * @param data - The data to send
     */
    toMany(rooms: string[], data: any): Promise<void>;

    /**
     * Get socket count for this namespace
     *
     * @returns Number of active sockets
     */
    getSocketCount(): number;
  }

  /**
   * Pattern-scoped microservice messaging view
   * Provides ergonomic API without repeating the pattern prefix
   */
  export interface Messages<P extends string = string> {
    /**
     * The pattern prefix ('' for absolute patterns)
     */
    readonly prefix: P;

    /**
     * Send a request and await its reply (request/response)
     * The pattern is joined with the prefix ('create' → 'order.create')
     *
     * @param pattern - Request pattern relative to the prefix
     * @param data - Request payload
     * @param options - Timeout and headers
     */
    send<T = unknown>(pattern: string, data?: unknown, options?: SendOptions): Promise<T>;

    /**
     * Emit a fire-and-forget event
     * The pattern is joined with the prefix ('created' → 'order.created')
     *
     * @param pattern - Event pattern relative to the prefix
     * @param data - Event payload
     * @param options - Headers
     */
    emit(pattern: string, data?: unknown, options?: EmitOptions): Promise<void>;
  }
}

/**
 * Internal implementation of scoped namespace
 */
class UlakNameSpace<T extends string> implements Ulak.NameSpace<T> {
  public constructor(
    public readonly path: T,
    private readonly ulak: Ulak,
  ) {}

  public async broadcast(data: any): Promise<void> {
    await this.ulak.broadcast(this.path, data);
  }

  public async to(room: string, data: any): Promise<void> {
    await this.ulak.to(this.path, room, data);
  }

  public async toSocket(socketId: string, data: any): Promise<void> {
    await this.ulak.toSocket(this.path, socketId, data);
  }

  public async toMany(rooms: string[], data: any): Promise<void> {
    await this.ulak.toMany(this.path, rooms, data);
  }

  public getSocketCount(): number {
    return this.ulak.getSocketCount(this.path);
  }
}

/**
 * Internal implementation of pattern-scoped microservice messaging
 */
class UlakMessages<P extends string> implements Ulak.Messages<P> {
  public constructor(
    public readonly prefix: P,
    private readonly ulak: Ulak,
    private readonly transport?: string,
  ) {}

  public async send<T = unknown>(pattern: string, data?: unknown, options?: SendOptions): Promise<T> {
    return this.ulak.send<T>(this.buildPattern(pattern), data, { ...options, transport: this.transport });
  }

  public async emit(pattern: string, data?: unknown, options?: EmitOptions): Promise<void> {
    await this.ulak.emit(this.buildPattern(pattern), data, { ...options, transport: this.transport });
  }

  /**
   * Join prefix and pattern (same rule as message handler prefixes):
   * no prefix → pattern, no pattern → prefix, both → prefix.pattern
   */
  private buildPattern(pattern: string): string {
    if (!this.prefix) return pattern;
    if (!pattern) return this.prefix;
    return `${this.prefix}.${pattern}`;
  }
}

/**
 * Helper function for injecting scoped Ulak namespace
 *
 * This function returns a tuple that can be used with the @Inject decorator
 * to inject a scoped namespace from Ulak. This provides an ergonomic API
 * where you don't need to repeat the namespace path in every method call.
 *
 * @param namespace - The WebSocket namespace path (e.g., "/chat", "/notifications")
 * @returns A tuple of [serviceName, expression] for @Inject decorator
 *
 * @example
 * ```typescript
 * @Service('ChatService')
 * export class ChatService {
 *   // Inject scoped namespace
 *   @Inject(ulak("/chat"))
 *   private chat: Ulak.NameSpace<"/chat">;
 *
 *   async sendMessage(roomId: string, message: string) {
 *     // Clean API - no need to repeat '/chat'
 *     await this.chat.to(roomId, { message });
 *   }
 *
 *   async broadcastAnnouncement(text: string) {
 *     await this.chat.broadcast({ type: 'announcement', text });
 *   }
 * }
 * ```
 */
export function ulak<T extends string>(namespace: T) {
  return [ICoreServiceNames.__ULAK__, (ulak: Ulak) => ulak.namespace(namespace)] as const;
}

/**
 * Helper functions for injecting microservice messaging views from Ulak
 * Declaration merging keeps the single `ulak` entry point:
 * `ulak('/chat')` → WebSocket namespace, `ulak.messages('order')` → microservice messaging
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ulak {
  /**
   * Inject a pattern-scoped microservice messaging view
   *
   * @param prefix - Pattern prefix joined to every send/emit ('' for absolute patterns)
   * @param options - Named transport selection (multi-broker projects)
   * @returns A tuple of [serviceName, expression] for @Inject decorator
   *
   * @example
   * ```typescript
   * @Service('CheckoutService')
   * export class CheckoutService {
   *   @Inject(ulak.messages('order'))
   *   private orders: Ulak.Messages<'order'>;
   *
   *   async checkout(dto: CheckoutDto) {
   *     const res = await this.orders.send('create', dto);  // sends 'order.create'
   *     await this.orders.emit('created', { id: res.id });  // emits 'order.created'
   *   }
   * }
   *
   * // Named transport (multi-broker projects)
   * @Inject(ulak.messages('metrics', { transport: 'analytics' }))
   * private metrics: Ulak.Messages<'metrics'>;
   * ```
   */
  export function messages<P extends string = ''>(prefix?: P, options?: { transport?: string }) {
    return [ICoreServiceNames.__ULAK__, (u: Ulak) => u.messages(prefix, options)] as const;
  }
}
