/**
 * @description Component constants used in the IOC (Inversion of Control) container.
 * All keys are Symbols to prevent naming collisions and external manipulation.
 */
export class ComponentConstants {
  // Component metadata keys - Symbol based for uniqueness
  public static readonly NameKey = Symbol('component:name');

  public static readonly ScopeKey = Symbol('component:scope');

  public static readonly PathKey = Symbol('component:path');

  public static readonly InterfaceKey = Symbol('component:interface');

  public static readonly DependencyKey = Symbol('component:dependency');

  public static readonly DependencyClassKey = Symbol('component:dependencyClass');

  public static readonly SoftDependencyKey = Symbol('component:softDependency');

  public static readonly StrategyKey = Symbol('component:strategy');

  public static readonly ExpressionKey = Symbol('component:expression');

  // Start hooks. The key keeps the old name because @PostConstruct is still a supported alias
  // for @OnStart and both must land in the same list.
  public static readonly PostConstructKey = Symbol('component:postConstruct');

  public static readonly OnStopKey = Symbol('component:onStop');

  public static readonly OverrideKey = Symbol('component:override');

  public static readonly IOCObjectKey = Symbol('component:iocObject');

  public static readonly CronKey = Symbol('component:cron');

  // Controller specific
  public static readonly ControllerDescriptionKey = Symbol('controller:description');

  public static readonly RouteKey = Symbol('controller:route');

  // Middleware specific
  public static readonly MiddlewaresKey = Symbol('middleware:middlewares');

  public static readonly ValidatorKey = Symbol('middleware:validator');

  // Static Serve specific
  public static readonly StaticServeRootKey = Symbol('staticServe:root');

  // FrontendController specific
  public static readonly PageRoutesKey = Symbol('frontendController:pageRoutes');

  // Event specific
  public static readonly EventHandlersKey = Symbol('event:handlers');

  public static readonly EventPrefixKey = Symbol('event:prefix');

  // Microservice specific
  public static readonly MessageHandlersKey = Symbol('microservice:handlers');

  public static readonly MessagePrefixKey = Symbol('microservice:prefix');

  public static readonly MessageTransportKey = Symbol('microservice:transport');
}
