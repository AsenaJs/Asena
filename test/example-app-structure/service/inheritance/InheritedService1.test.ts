import { Service } from '../../../../lib/server/decorators';
import { BaseServiceTest } from './BaseService.test';

@Service()
export class InheritedService1Test extends BaseServiceTest {
  public test() {
    return this.getConnection();
  }
}
