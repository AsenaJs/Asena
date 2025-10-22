import { beforeEach, describe, expect, test } from 'bun:test';
import type { Dependencies, InjectableComponent } from '../../lib/ioc';
import { ComponentConstants, Container, IocEngine } from '../../lib/ioc';
import { InheritedService1Test } from '../example-app-structure/service/inheritance/InheritedService1.test';
import { InheritedService2Test } from '../example-app-structure/service/inheritance/InheritedService2.test';
import { BaseDataBaseServiceTest } from '../example-app-structure/service/inheritance/BaseDataBaseService.test';
import { InheritedService3Test } from '../example-app-structure/service/inheritance/InheritedService3.test';
import { BaseServiceTest } from '../example-app-structure/service/inheritance/BaseService.test';
import { getOwnTypedMetadata } from '../../lib/utils/typedMetadata';

describe('Inheritance Tests', () => {
  let iocEngine: IocEngine;

  beforeEach(() => {
    iocEngine = new IocEngine();
    // Manually inject container for testing (IocEngine is now a core service)
    (iocEngine as any)['_container'] = new Container();
  });

  test('should register dependencies correctly for inherited services', async () => {
    const components: InjectableComponent[] = [
      { Class: BaseServiceTest, interface: null },
      { Class: BaseDataBaseServiceTest, interface: null },
      { Class: InheritedService1Test, interface: null },
      { Class: InheritedService2Test, interface: null },
      { Class: InheritedService3Test, interface: null },
    ];

    await iocEngine.searchAndRegister(components);

    const service1 = (await iocEngine.container.resolve<InheritedService1Test>(
      'InheritedService1Test',
    )) as InheritedService1Test;

    const service2 = (await iocEngine.container.resolve<InheritedService2Test>(
      'InheritedService2Test',
    )) as InheritedService2Test;

    const service3 = (await iocEngine.container.resolve<InheritedService3Test>(
      'InheritedService3Test',
    )) as InheritedService3Test;

    const baseService = (await iocEngine.container.resolve<BaseServiceTest>('BaseServiceTest')) as BaseServiceTest;

    // Base service'in doğru şekilde initialize olduğunu kontrol ediyoruz
    expect(baseService).toBeInstanceOf(BaseServiceTest);

    const deps = getOwnTypedMetadata<Dependencies>(ComponentConstants.DependencyKey, baseService.constructor);

    expect(Object.keys(deps).length).toBe(1);

    // Inherited servislerin doğru şekilde oluşturulduğunu kontrol ediyoruz
    expect(service1).toBeInstanceOf(InheritedService1Test);
    expect(service2).toBeInstanceOf(InheritedService2Test);

    // Her servisin bağımsız olarak çalıştığını test ediyoruz
    expect(baseService.db.connection).toBe(true);
    expect(service3.test()).toBe(true);
    expect(service3.service2).toBeInstanceOf(InheritedService2Test);
    expect(service3.service1).toBeInstanceOf(InheritedService1Test);
  });

  test('should not share injected dependencies between inherited services', async () => {
    const components: InjectableComponent[] = [
      { Class: BaseDataBaseServiceTest, interface: null },
      { Class: BaseServiceTest, interface: null },
      { Class: InheritedService1Test, interface: null },
      { Class: InheritedService2Test, interface: null },
    ];

    await iocEngine.searchAndRegister(components);

    // Her servis için ayrı instance oluşturulduğunu kontrol ediyoruz
    const service1First = await iocEngine.container.resolve<InheritedService1Test>('InheritedService1Test');
    const service1Second = await iocEngine.container.resolve<InheritedService1Test>('InheritedService1Test');
    const service2 = await iocEngine.container.resolve<InheritedService2Test>('InheritedService2Test');

    // Farklı servisler için bağımlılıkların karışmadığını kontrol ediyoruz
    expect(service1First).toBe(service1Second); // Singleton olduğu için aynı instance
    expect(service1First).not.toBe(service2); // Farklı servisler farklı instance'lar
  });
});
