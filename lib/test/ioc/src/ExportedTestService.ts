import { Component } from '../../../server/decorators';
import { Scope } from '../../../ioc/types';

@Component({
  name: 'ExportedTestService',
  scope: Scope.SINGLETON,
})
export class ExportedTestService {

  public getValue(): string {
    return 'test';
  }

}
