import { ServerService } from '../../../server/decorators';
import { AsenaService } from '../../../services';

@ServerService()
export class ExportedServerService extends AsenaService {

  public testValue: string;

  protected async onStart() {
    this.testValue = 'Test Value';
  }

}
