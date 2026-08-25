import { Service } from '../../../lib/server/decorators';

@Service()
export class ScannedGreeterService {
  public greet(): string {
    return 'scanned';
  }
}
