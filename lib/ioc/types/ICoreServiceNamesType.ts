/**
 * @description Object containing all core service names
 * Used for type-safe service resolution and plugin system access
 * All core services are managed by CoreContainer and AsenaServerFactory
 */
export enum ICoreServiceNames {
  // Core Infrastructure Services (Phase 1-4)
  CONTAINER = 'Container',
  SERVER_LOGGER = 'ServerLogger',
  IOC_ENGINE = 'IocEngine',
  ASENA_ADAPTER = 'AsenaAdapter',

  // Internal Messaging Services (Phase 5)
  __ULAK__ = '__Ulak__',

  // Event Services (Phase 5)
  EVENT_EMITTER = 'EventEmitter',
  EVENT_DISPATCH_SERVICE = 'EventDispatchService',

  // Prepare Services (Phase 5)
  PREPARE_MIDDLEWARE_SERVICE = 'PrepareMiddlewareService',
  PREPARE_CONFIG_SERVICE = 'PrepareConfigService',
  PREPARE_WEBSOCKET_SERVICE = 'PrepareWebsocketService',
  PREPARE_VALIDATOR_SERVICE = 'PrepareValidatorService',
  PREPARE_STATIC_SERVE_CONFIG_SERVICE = 'PrepareStaticServeConfigService',
  PREPARE_EVENT_SERVICE = 'PrepareEventService',

  // Factory Services (Phase 6+)
  CORE_CONTAINER = 'CoreContainer',
  ASENA_SERVER = 'AsenaServer',
}
