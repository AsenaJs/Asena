import type { Container } from '../../ioc';
import type { ServerLogger } from '../../logger';

export abstract class PrepareService {

  protected container: Container;

  protected logger: ServerLogger;

  public constructor(container: Container, logger: ServerLogger) {
    this.container = container;
    this.logger = logger;
  }

  public abstract prepare(...args: any[]): Promise<any> | any;

}
