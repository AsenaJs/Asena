import * as path from 'node:path';
import type { Container, ContainerService, Dependencies, Strategies } from '../ioc';
import { ComponentConstants, ComponentType } from '../ioc';
import { Scope } from '../ioc/component/Scope';
import { collectValueFields } from '../ioc/helper/valueResolver';
import {
  getChainedTypedMetadata,
  getChainedTypedMetadataList,
  getComponentType,
  getOwnTypedMetadata,
  getTypedMetadata,
} from '../utils';
import { ASENA_CONTEXT_CONTRACT, resolveContextContract } from '../adapter/RequestContract';
import type { Route } from '../adapter';
import type { Class } from '../server/types';
import type { AsenaConfig, GlobalMiddlewareEntry } from '../server/config';
import type { EventHandlerMetadata } from '../server/event/types';
import type { MessageHandlerMetadata } from '../server/microservice/types';
import { DEFAULT_TRANSPORT_NAME } from '../server/microservice/types';
import type { CatchHandlerMetadata, NotFoundHandlerMetadata } from '../server/exception/types';
import type {
  DevtoolsCatch,
  DevtoolsComponent,
  DevtoolsComponentType,
  DevtoolsConfig,
  DevtoolsDependency,
  DevtoolsEventHandler,
  DevtoolsExceptionHandler,
  DevtoolsGlobalMiddleware,
  DevtoolsHttpMethod,
  DevtoolsMessageHandler,
  DevtoolsRoute,
  DevtoolsSchedule,
  DevtoolsSnapshot,
  DevtoolsWebSocket,
} from './protocol';

interface ComponentEntry {
  name: string;
  Class: Class;
  entry: ContainerService;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const componentName = (Class: Class): string =>
  getTypedMetadata<string>(ComponentConstants.NameKey, Class) || Class.name;

// Own-only, like PrepareMiddlewareService and PrepareValidatorService: an undecorated subclass
// never resolves to its base's name.
const middlewareName = (Class: Class): string =>
  getOwnTypedMetadata<string>(ComponentConstants.NameKey, Class) || Class.name;

// The rule PrepareEventService, PrepareMicroserviceService and UlakMessages each implement.
const joinPattern = (prefix: string, pattern: string, applyPrefix: boolean): string => {
  if (!applyPrefix || !prefix) return pattern;
  if (!pattern) return prefix;
  return `${prefix}.${pattern}`;
};

/**
 * User components, each once. Core services share the container but carry no component marker,
 * and an `@Implements` alias reaches the same entry under a second key.
 */
const collectComponents = (container: Container): ComponentEntry[] => {
  const seen = new Set<ContainerService>();
  const components: ComponentEntry[] = [];

  for (const value of Object.values(container.services)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (seen.has(entry)) continue;

      seen.add(entry);

      if (!getOwnTypedMetadata<boolean>(ComponentConstants.IOCObjectKey, entry.Class)) continue;

      components.push({ name: componentName(entry.Class), Class: entry.Class, entry });
    }
  }

  return components.sort((a, b) => byText(a.name, b.name));
};

const ofType = (components: ComponentEntry[], type: ComponentType): ComponentEntry[] =>
  components.filter(({ Class }) => getOwnTypedMetadata<boolean>(type, Class) === true);

const describeDependencies = (Class: Class): DevtoolsDependency[] => {
  const injected = getChainedTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, Class);
  const strategies = getChainedTypedMetadata<Strategies>(ComponentConstants.StrategyKey, Class);
  const soft = getChainedTypedMetadata<Dependencies>(ComponentConstants.SoftDependencyKey, Class);

  const dependencies: DevtoolsDependency[] = [
    ...Object.entries(injected).map(([field, target]) => ({ field, target, kind: 'inject' as const })),
    ...Object.entries(strategies)
      .filter(([, target]) => Boolean(target))
      .map(([field, target]) => ({ field, target, kind: 'strategy' as const })),
    ...Object.keys(soft).map((target) => ({ field: null, target, kind: 'soft' as const })),
  ];

  return dependencies.sort(
    (a, b) => byText(a.kind, b.kind) || byText(a.field ?? '', b.field ?? '') || byText(a.target, b.target),
  );
};

const describeComponent = ({ name, Class }: ComponentEntry): DevtoolsComponent => {
  const implemented = getTypedMetadata<string>(ComponentConstants.InterfaceKey, Class);

  return {
    name,
    type: (getComponentType(Class) ?? ComponentType.COMPONENT) as DevtoolsComponentType,
    scope: getTypedMetadata<Scope>(ComponentConstants.ScopeKey, Class) === Scope.SINGLETON ? 'singleton' : 'prototype',
    interfaces: implemented && implemented !== name ? [implemented] : [],
    className: Class.name,
    dependencies: describeDependencies(Class),
    values: Object.entries(collectValueFields(Class))
      .map(([field, spec]) => ({
        field,
        key: spec.key,
        hasDefault: 'default' in spec,
        parsed: typeof spec.parse === 'function',
        isSet: process.env[spec.key] !== undefined,
      }))
      .sort((a, b) => byText(a.field, b.field)),
  };
};

const describeRoutes = (controllers: ComponentEntry[]): DevtoolsRoute[] => {
  const routes: DevtoolsRoute[] = [];

  for (const { name, Class } of controllers) {
    const declared = getChainedTypedMetadata<Route>(ComponentConstants.RouteKey, Class);
    const basePath = getOwnTypedMetadata<string>(ComponentConstants.PathKey, Class) || '';
    const controllerMiddlewares = getChainedTypedMetadataList<Class>(ComponentConstants.MiddlewaresKey, Class);
    // resolveContextContract walks from the prototype of what it is given, and must not get an instance.
    const prototypeProbe = Object.create(Class.prototype);

    for (const [method, params] of Object.entries(declared)) {
      const contract = resolveContextContract(prototypeProbe, method);
      const schemas = contract?.[ASENA_CONTEXT_CONTRACT];
      const validator = params.validator as Class | undefined;

      routes.push({
        controller: name,
        method,
        httpMethod: params.method.toUpperCase() as DevtoolsHttpMethod,
        path: path.join(`${basePath}/`, params.path).replace(/\\/g, '/'),
        middlewares: [...controllerMiddlewares, ...(params.middlewares || [])].map(middlewareName),
        validator: validator ? middlewareName(validator) : null,
        contract: contract ? contract.name : null,
        hasBodySchema: schemas
          ? Boolean(schemas.body || schemas.form)
          : Boolean(
              validator &&
              (typeof validator.prototype.json === 'function' || typeof validator.prototype.form === 'function'),
            ),
      });
    }
  }

  return routes.sort(
    (a, b) => byText(a.path, b.path) || byText(a.httpMethod, b.httpMethod) || byText(a.method, b.method),
  );
};

const describeWebSockets = (websockets: ComponentEntry[]): DevtoolsWebSocket[] =>
  websockets
    .map(({ name, Class }) => ({
      namespace: getOwnTypedMetadata<string>(ComponentConstants.PathKey, Class) || '',
      component: name,
    }))
    .sort((a, b) => byText(a.namespace, b.namespace));

const describeSchedules = (schedules: ComponentEntry[]): DevtoolsSchedule[] =>
  schedules
    .map(({ name, Class }) => ({ name, cron: getTypedMetadata<string>(ComponentConstants.CronKey, Class) || '' }))
    .filter((schedule) => schedule.cron !== '')
    .sort((a, b) => byText(a.name, b.name));

const describeEvents = (services: ComponentEntry[]): DevtoolsEventHandler[] => {
  const events: DevtoolsEventHandler[] = [];

  for (const { name, Class } of services) {
    const prefix = getTypedMetadata<string>(ComponentConstants.EventPrefixKey, Class) || '';
    const handlers = getChainedTypedMetadata<Record<string, EventHandlerMetadata>>(
      ComponentConstants.EventHandlersKey,
      Class,
    );

    for (const [method, metadata] of Object.entries(handlers)) {
      if (metadata.skip) continue;

      events.push({ component: name, method, event: joinPattern(prefix, metadata.pattern, metadata.prefix !== false) });
    }
  }

  return events.sort((a, b) => byText(a.component, b.component) || byText(a.method, b.method));
};

const describeMessageHandlers = (controllers: ComponentEntry[]): DevtoolsMessageHandler[] => {
  const handlers: DevtoolsMessageHandler[] = [];

  for (const { name, Class } of controllers) {
    const prefix = getTypedMetadata<string>(ComponentConstants.MessagePrefixKey, Class) || '';
    const transport = getTypedMetadata<string>(ComponentConstants.MessageTransportKey, Class) || DEFAULT_TRANSPORT_NAME;
    const declared = getChainedTypedMetadata<Record<string, MessageHandlerMetadata>>(
      ComponentConstants.MessageHandlersKey,
      Class,
    );

    for (const [method, metadata] of Object.entries(declared)) {
      if (metadata.skip) continue;

      handlers.push({
        controller: name,
        method,
        pattern: joinPattern(prefix, metadata.pattern, metadata.prefix !== false),
        kind: metadata.type,
        transport,
      });
    }
  }

  return handlers.sort((a, b) => byText(a.controller, b.controller) || byText(a.method, b.method));
};

const describeExceptionHandlers = (handlers: ComponentEntry[]): DevtoolsExceptionHandler[] =>
  handlers.map(({ name, Class }) => {
    const catches = getChainedTypedMetadata<Record<string, CatchHandlerMetadata>>(
      ComponentConstants.ExceptionHandlersKey,
      Class,
    );
    const notFound = Object.keys(
      getChainedTypedMetadata<Record<string, NotFoundHandlerMetadata>>(ComponentConstants.NotFoundHandlerKey, Class),
    ).sort(byText);

    const described: DevtoolsExceptionHandler = {
      component: name,
      catches: Object.entries(catches)
        .map(([method, metadata]): DevtoolsCatch => ({
          method,
          types: metadata.types.length === 0 ? 'catch-all' : metadata.types.map((type) => type.name),
        }))
        .sort((a, b) => byText(a.method, b.method)),
    };

    if (notFound.length > 0) {
      described.notFound = notFound[0];
    }

    return described;
  });

const describeGlobalMiddleware = (entry: GlobalMiddlewareEntry): DevtoolsGlobalMiddleware => {
  if (typeof entry === 'object' && 'middleware' in entry) {
    return {
      middleware: middlewareName(entry.middleware),
      ...(entry.routes?.include ? { include: [...entry.routes.include] } : {}),
      ...(entry.routes?.exclude ? { exclude: [...entry.routes.exclude] } : {}),
    };
  }

  return { middleware: middlewareName(entry) };
};

/**
 * `globalMiddlewares()` is the one thing metadata cannot answer, so the already-built `@Config`
 * singleton is asked again. Nothing is constructed: a transient config is read off its prototype.
 */
const describeConfig = async (configs: ComponentEntry[]): Promise<DevtoolsConfig> => {
  const [config] = configs;

  if (!config) {
    return { hasOnError: false, hasOnNotFound: false, globalMiddlewares: [] };
  }

  const target: Partial<AsenaConfig> = config.entry.instance ?? config.Class.prototype;
  const entries =
    config.entry.instance && typeof target.globalMiddlewares === 'function' ? await target.globalMiddlewares() : [];

  return {
    component: config.name,
    hasOnError: typeof target.onError === 'function',
    hasOnNotFound: typeof target.onNotFound === 'function',
    globalMiddlewares: entries.map(describeGlobalMiddleware),
  };
};

/**
 * Describes what the application is made of, from decorator metadata and the container's
 * registrations. Resolves nothing and constructs nothing.
 *
 * @param container - The user component container (`server.coreContainer.container`)
 * @returns The snapshot, every list in a stable order so two boots of one app compare equal
 */
export const buildDevtoolsSnapshot = async (container: Container): Promise<DevtoolsSnapshot> => {
  const components = collectComponents(container);

  return {
    components: components.map(describeComponent),
    routes: describeRoutes(ofType(components, ComponentType.CONTROLLER)),
    websockets: describeWebSockets(ofType(components, ComponentType.WEBSOCKET)),
    schedules: describeSchedules(ofType(components, ComponentType.SCHEDULE)),
    events: describeEvents(ofType(components, ComponentType.EVENT)),
    messageHandlers: describeMessageHandlers(ofType(components, ComponentType.MESSAGE_CONTROLLER)),
    exceptionHandlers: describeExceptionHandlers(ofType(components, ComponentType.EXCEPTION_HANDLER)),
    config: await describeConfig(ofType(components, ComponentType.CONFIG)),
  };
};
