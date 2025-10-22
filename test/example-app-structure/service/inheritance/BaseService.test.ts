import { Service } from '../../../../lib/server/decorators';
import { Inject } from '../../../../lib/ioc/component';
import type { BaseDataBaseServiceTest } from './BaseDataBaseService.test';

@Service()
export class BaseServiceTest {
  @Inject('BaseDataBaseServiceTest')
  public db: BaseDataBaseServiceTest;

  public getConnection() {
    return this.db.connection;
  }
}
