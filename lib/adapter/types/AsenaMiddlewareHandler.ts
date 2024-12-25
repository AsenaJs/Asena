export type AsenaMiddlewareHandler<C> = (context: C, next: () => Promise<void>) => Promise<void> | any;

export type AsenaNextHandler = () => Promise<void>;
