import { Service } from '../../../../server/decorators';
import { Inject } from '../../../../ioc/component';
import type { BaseDataBaseServiceTest } from './BaseDataBaseService.test';

@Service()
export class BaseServiceTest {

  @Inject('BaseDataBaseServiceTest')
  public db: BaseDataBaseServiceTest;

  public getConnection() {
    return this.db.connection;
  }

}
