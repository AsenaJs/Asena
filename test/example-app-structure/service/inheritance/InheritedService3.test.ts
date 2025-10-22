import { Service } from '../../../../lib/server/decorators';
import { BaseServiceTest } from './BaseService.test';
import { Inject } from '../../../../lib/ioc/component';
import type { InheritedService1Test } from './InheritedService1.test';
import type { InheritedService2Test } from './InheritedService2.test';

@Service()
export class InheritedService3Test extends BaseServiceTest {
  @Inject('InheritedService1Test')
  public service1: InheritedService1Test;

  @Inject('InheritedService2Test')
  public service2: InheritedService2Test;

  public test() {
    this.service1.test();
    this.service2.test();

    return this.getConnection();
  }
}
