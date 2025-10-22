import { Service } from '../../../../lib/server/decorators';
import { PostConstruct } from '../../../../lib/ioc/component';

@Service()
export class BaseDataBaseServiceTest {
  public connection = false;

  @PostConstruct()
  public async execute(): Promise<void> {
    this.connection = true;
  }
}
