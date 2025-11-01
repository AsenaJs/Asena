/**
 * @description Component constants used in the IOC (Inversion of Control) container.
 * All keys are Symbols to prevent naming collisions and external manipulation.
 */
export class ComponentConstants {
  // Component metadata keys - Symbol based for uniqueness
  public static readonly NameKey = Symbol('component:name');

  public static readonly TypeKey = Symbol('component:type');

  public static readonly ScopeKey = Symbol('component:scope');

  public static readonly PathKey = Symbol('component:path');

  public static readonly InterfaceKey = Symbol('component:interface');

  public static readonly DependencyKey = Symbol('component:dependency');

  public static readonly SoftDependencyKey = Symbol('component:softDependency');

  public static readonly StrategyKey = Symbol('component:strategy');

  public static readonly ExpressionKey = Symbol('component:expression');

  public static readonly PostConstructKey = Symbol('component:postConstruct');

  public static readonly OverrideKey = Symbol('component:override');

  public static readonly IOCObjectKey = Symbol('component:iocObject');

  public static readonly CronKey = Symbol('component:cron');

  // Controller specific
  public static readonly ControllerConfigKey = Symbol('controller:config');

  public static readonly RouteKey = Symbol('controller:route');

  // Middleware specific
  public static readonly MiddlewaresKey = Symbol('middleware:middlewares');

  public static readonly ValidatorKey = Symbol('middleware:validator');

  // Route specific
  public static readonly MethodKey = Symbol('route:method');

  public static readonly RoutePathKey = Symbol('route:path');

  public static readonly RouteMiddlewaresKey = Symbol('route:middlewares');

  public static readonly RouteValidatorKey = Symbol('route:validator');

  // WebSocket specific
  public static readonly WebSocketPathKey = Symbol('websocket:path');

  public static readonly WebSocketMiddlewaresKey = Symbol('websocket:middlewares');

  // Static Serve specific
  public static readonly StaticServeRootKey = Symbol('staticServe:root');

  // Event specific
  public static readonly EventHandlersKey = Symbol('event:handlers');

  public static readonly EventPrefixKey = Symbol('event:prefix');
}
