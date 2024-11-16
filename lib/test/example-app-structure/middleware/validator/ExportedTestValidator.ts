import { AsenaValidationService } from '../../../../server/web/middleware';

export class ExportedTestValidator extends AsenaValidationService<boolean> {

  public form(): boolean {
    return true;
  }

  public header(): boolean {
    return true;
  }

  public json(): boolean {
    return true;
  }

  public param(): boolean {
    return true;
  }

  public query(): boolean {
    return true;
  }

}
