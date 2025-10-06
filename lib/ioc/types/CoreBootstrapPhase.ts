/**
 * @description Enum representing the bootstrap phases of the CoreContainer
 * These phases define the order in which core services are initialized
 */
export enum CoreBootstrapPhase {
  CONTAINER_INIT = 'CONTAINER_INIT',
  LOGGER_INIT = 'LOGGER_INIT',
  IOC_ENGINE_INIT = 'IOC_ENGINE_INIT',
  HTTP_ADAPTER_INIT = 'HTTP_ADAPTER_INIT',
  PREPARE_SERVICES_INIT = 'PREPARE_SERVICES_INIT',
  USER_COMPONENTS_SCAN = 'USER_COMPONENTS_SCAN',
  USER_COMPONENTS_INIT = 'USER_COMPONENTS_INIT',
  APPLICATION_SETUP = 'APPLICATION_SETUP',
  SERVER_READY = 'SERVER_READY',
}

