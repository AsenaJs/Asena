import { ServerService } from '../../../server/decorators';
import { PostConstruct } from '../../../ioc/component/decorators/PostConstruct';

@ServerService()
export class ExportedServerServiceTest {

  public testValue: string;

  @PostConstruct()
  protected async onStart() {
    this.testValue = 'Test Value';
  }

}
