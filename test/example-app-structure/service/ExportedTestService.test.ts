import { Component } from '../../../lib/server/decorators';
import { Scope } from '../../../lib/ioc/component';

@Component({
  name: 'ExportedTestService',
  scope: Scope.SINGLETON,
})
export class ExportedTestService {
  public getValue(): string {
    return 'test';
  }

  public setValue(value: string): string {
    return value;
  }

  public deleteValue(): string {
    return 'deleted';
  }
}
