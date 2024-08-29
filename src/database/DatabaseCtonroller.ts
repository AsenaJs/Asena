import type { DB } from './DB';

export type SourceType = DB<any> | any;

export class DataBaseController<T = SourceType> {

  private readonly connection: boolean = false;

  private source: SourceType;

  private database: DB<T>;

  public constructor(database: DB<T>) {
    this.database = database;
  }

  public getConnection(): T {
    return this.source;
  }

  public async startConnection(): Promise<void> {
    if (!this.connection) {
      this.source = await this.database.initialize();
    }
  }

}
