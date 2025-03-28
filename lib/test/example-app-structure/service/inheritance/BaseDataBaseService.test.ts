import { Service } from '../../../../server/decorators';
import { PostConstruct } from '../../../../ioc/component';

@Service()
export class BaseDataBaseServiceTest {

  public connection = false;

  @PostConstruct()
  public async execute(): Promise<void> {
    this.connection = true;
  }

}
