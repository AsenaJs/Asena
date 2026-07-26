export interface IocConfig {
  sourceFolder: string;
  rootFile: string;

  /**
   * Milliseconds a single component file may take to import before the engine
   * warns about it. Set to 0 to disable the warning.
   *
   * @default 10000
   */
  importTimeout?: number;
}
