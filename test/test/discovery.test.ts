import { describe, expect, test } from 'bun:test';
import {
  discoverInjectedFields,
  discoverInjectedFieldsFromClass,
  getFieldExpression,
  getFieldServiceName,
  hasInjectedFields,
} from '../../lib/test/metadata/discovery';
import { Component } from '../../lib/server/decorators';
import { Inject } from '../../lib/ioc/component';
import { ulak, type Ulak } from '../../lib/server/messaging';

@Component()
class UserService {
  public async findById(id: string) {
    return { id };
  }
}

@Component()
class AuditService {
  public async record(_event: string) {
    return true;
  }
}

@Component()
class MixedService {
  @Inject(UserService)
  private byClass: UserService;

  @Inject('UserService')
  private byName: UserService;

  @Inject('UserService', (s: any) => s.findById)
  private byNameWithExpression: (id: string) => Promise<any>;

  @Inject(ulak('/stats'))
  private stats: Ulak.NameSpace<'/stats'>;

  @Inject([AuditService, (s: any) => s.record] as const)
  private record: (event: string) => Promise<boolean>;
}

@Component()
class BaseService {
  @Inject(UserService)
  protected shared: UserService;

  @Inject(AuditService)
  protected audit: AuditService;
}

@Component()
class ChildService extends BaseService {
  // Redeclares a parent field with a different injection - the child must win
  @Inject('UserService')
  protected shared: UserService;

  @Inject(AuditService)
  private ownAudit: AuditService;
}

@Component()
class ExplodingService {
  @Inject(UserService)
  private userService: UserService;

  public constructor() {
    throw new Error('this component must never be constructed during discovery');
  }
}

class NoDependencies {}

describe('discoverInjectedFieldsFromClass', () => {
  const byName = (fields: ReturnType<typeof discoverInjectedFieldsFromClass>, name: string) =>
    fields.find((field) => field.fieldName === name);

  test('should record the class reference for class injections', () => {
    const field = byName(discoverInjectedFieldsFromClass(MixedService), 'byClass');

    expect(field.serviceName).toBe('UserService');
    expect(field.serviceClass).toBe(UserService);
    expect(field.expression).toBeUndefined();
  });

  test('should leave serviceClass undefined for string injections', () => {
    const field = byName(discoverInjectedFieldsFromClass(MixedService), 'byName');

    expect(field.serviceName).toBe('UserService');
    expect(field.serviceClass).toBeUndefined();
  });

  test('should keep the expression for string injections that carry one', () => {
    const field = byName(discoverInjectedFieldsFromClass(MixedService), 'byNameWithExpression');

    expect(field.serviceClass).toBeUndefined();
    expect(typeof field.expression).toBe('function');
  });

  test('should treat ulak() as a core-service dependency with an expression', () => {
    const field = byName(discoverInjectedFieldsFromClass(MixedService), 'stats');

    expect(field.serviceName).toBe('__Ulak__');
    expect(field.serviceClass).toBeUndefined();
    expect(typeof field.expression).toBe('function');
  });

  test('should record the class reference for class-based tuple injections', () => {
    const field = byName(discoverInjectedFieldsFromClass(MixedService), 'record');

    expect(field.serviceName).toBe('AuditService');
    expect(field.serviceClass).toBe(AuditService);
    expect(typeof field.expression).toBe('function');
  });

  test('should walk the constructor chain and let the child win', () => {
    const fields = discoverInjectedFieldsFromClass(ChildService);

    expect(fields.map((field) => field.fieldName).sort()).toEqual(['audit', 'ownAudit', 'shared']);
    // child redeclared `shared` as a string injection, so no class reference survives
    expect(byName(fields, 'shared').serviceClass).toBeUndefined();
    // inherited untouched field keeps the parent's class reference
    expect(byName(fields, 'audit').serviceClass).toBe(AuditService);
  });

  test('should not instantiate the component', () => {
    const fields = discoverInjectedFieldsFromClass(ExplodingService);

    expect(fields).toHaveLength(1);
    expect(fields[0].serviceClass).toBe(UserService);
  });

  test('should return an empty array for classes without dependencies', () => {
    expect(discoverInjectedFieldsFromClass(NoDependencies)).toEqual([]);
  });

  test('should return an empty array for undefined and native constructors', () => {
    expect(discoverInjectedFieldsFromClass(undefined)).toEqual([]);
    expect(discoverInjectedFieldsFromClass(Object)).toEqual([]);
  });
});

describe('discoverInjectedFields', () => {
  test('should produce the same result as the class-based walker', () => {
    const fromInstance = discoverInjectedFields(new MixedService());
    const fromClass = discoverInjectedFieldsFromClass(MixedService);

    expect(fromInstance).toEqual(fromClass);
  });

  test('should return an empty array for a plain object', () => {
    expect(discoverInjectedFields({})).toEqual([]);
  });
});

describe('field metadata helpers', () => {
  test('hasInjectedFields should distinguish components with and without dependencies', () => {
    expect(hasInjectedFields(MixedService)).toBe(true);
    expect(hasInjectedFields(NoDependencies)).toBe(false);
  });

  test('getFieldServiceName should resolve the registered name', () => {
    expect(getFieldServiceName(MixedService, 'byClass')).toBe('UserService');
    expect(getFieldServiceName(MixedService, 'missing')).toBeUndefined();
  });

  test('getFieldExpression should resolve only expression-backed fields', () => {
    expect(typeof getFieldExpression(MixedService, 'stats')).toBe('function');
    expect(getFieldExpression(MixedService, 'byClass')).toBeUndefined();
  });
});
