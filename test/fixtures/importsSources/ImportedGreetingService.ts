import { Service } from '../../../lib/server/decorators';

/**
 * Lives outside every scanned folder on purpose: it reaches the container only when a
 * test hands it in through `imports`, never through the filesystem scan.
 */
@Service('ImportedGreetingService')
export class ImportedGreetingService {
  public greet(): string {
    return 'imported';
  }
}
