import { Service } from '../../../lib/server/decorators';

/**
 * Claims the name of a class inside the scanned folder, so registering both must be a
 * duplicate-name error. Declared here, not inside the test file, so it can only arrive
 * through `imports`.
 */
@Service('ScannedGreeterService')
export class ClashingImport {
  public greet(): string {
    return 'clashing';
  }
}
