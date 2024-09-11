/*
 * @H is handler type of each validator controller
 *
 *
 */
export interface ValidationService<H> {
  json?: H;
  form?: H;
  query?: H;
  param?: H;
  header?: H;
}
