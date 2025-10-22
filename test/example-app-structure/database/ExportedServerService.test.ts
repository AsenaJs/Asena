import { PostConstruct } from '../../../lib/ioc/component';
import { Service } from '../../../lib/server/decorators';

@Service()
export class ExportedServerService {
  public testValue: string;

  @PostConstruct()
  protected async onStart() {
    this.testValue = 'Test Value';
  }
}
