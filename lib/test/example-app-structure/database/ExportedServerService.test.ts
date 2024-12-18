import { PostConstruct } from '../../../ioc/component';
import { Service } from '../../../server/decorators';

@Service()
export class ExportedServerService {

  public testValue: string;

  @PostConstruct()
  protected async onStart() {
    this.testValue = 'Test Value';
  }

}
