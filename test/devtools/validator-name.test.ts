import { describe, expect, test } from 'bun:test';
import { Controller, Middleware } from '../../lib/server/decorators';
import { Get, Post } from '../../lib/server/web/decorators';
import type { AsenaContext, RouteParams } from '../../lib/adapter';
import type { TestApp } from '../../lib/test/harness/types';
import { bootWithMockAdapter, mockAdapterOf } from './helpers';

// Core hands the adapter bound validator handles (`bound json`), so the class is gone by then;
// `validatorName` is the only way an adapter can name the validator step `Component.json`.

@Middleware({ validator: true })
class OrderBodyValidator {
  public json() {
    return { parse: (value: unknown) => value };
  }
}

@Middleware({ validator: true, name: 'CustomerQueryRules' })
class CustomerQueryValidator {
  public query() {
    return { parse: (value: unknown) => value };
  }
}

@Controller('/orders')
class OrderController {
  @Post({ path: '/new', validator: OrderBodyValidator })
  public create(context: AsenaContext<any, any>) {
    return context.send({ ok: true });
  }

  @Get('/all')
  public list(context: AsenaContext<any, any>) {
    return context.send([]);
  }

  @Get({ path: '/by-customer', validator: CustomerQueryValidator })
  public byCustomer(context: AsenaContext<any, any>) {
    return context.send([]);
  }
}

const bootOrders = () => bootWithMockAdapter([OrderController, OrderBodyValidator, CustomerQueryValidator]);

const registeredRoute = (app: TestApp, path: string): RouteParams<any, any> => {
  const routes: RouteParams<any, any>[] = mockAdapterOf(app).registerRoute.mock.calls.map(([route]) => route);
  const route = routes.find((candidate) => candidate.path === path);

  expect(route).toBeDefined();

  return route;
};

describe('validatorName on registered routes', () => {
  test('a route with a legacy validator carries the validator component name', async () => {
    await using app = await bootOrders();

    expect(registeredRoute(app, '/orders/new').validatorName).toBe('OrderBodyValidator');
  });

  test('a validator registered under an explicit name carries that name, not the class name', async () => {
    await using app = await bootOrders();

    expect(registeredRoute(app, '/orders/by-customer').validatorName).toBe('CustomerQueryRules');
  });

  test('a route without a validator has no validatorName field', async () => {
    await using app = await bootOrders();

    expect('validatorName' in registeredRoute(app, '/orders/all')).toBe(false);
  });

  test('a decorated subclass of a named validator carries its own name', async () => {
    @Middleware({ validator: true })
    class StrictCustomerQueryValidator extends CustomerQueryValidator {}

    @Middleware({ validator: true, name: 'VipCustomerRules' })
    class VipCustomerQueryValidator extends CustomerQueryValidator {}

    @Controller('/customers')
    class CustomerController {
      @Get({ path: '/strict', validator: StrictCustomerQueryValidator })
      public strict(context: AsenaContext<any, any>) {
        return context.send([]);
      }

      @Get({ path: '/vip', validator: VipCustomerQueryValidator })
      public vip(context: AsenaContext<any, any>) {
        return context.send([]);
      }
    }

    await using app = await bootWithMockAdapter([
      CustomerController,
      CustomerQueryValidator,
      StrictCustomerQueryValidator,
      VipCustomerQueryValidator,
    ]);

    expect(registeredRoute(app, '/customers/strict').validatorName).toBe('StrictCustomerQueryValidator');
    expect(registeredRoute(app, '/customers/vip').validatorName).toBe('VipCustomerRules');
  });

  test('an undecorated subclass of a named validator fails the boot before any label exists', async () => {
    class UndecoratedQueryValidator extends CustomerQueryValidator {}

    @Controller('/customers')
    class CustomerController {
      @Get({ path: '/plain', validator: UndecoratedQueryValidator })
      public plain(context: AsenaContext<any, any>) {
        return context.send([]);
      }
    }

    await expect(bootWithMockAdapter([CustomerController, CustomerQueryValidator])).rejects.toThrow(
      "Validator 'UndecoratedQueryValidator' is not a component",
    );
  });
});
