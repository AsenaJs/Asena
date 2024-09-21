/*
 * @H is handler type of each validator controller
 *
 *
 */
export abstract class ValidationService<H> {

  public abstract json?(): H;

  public abstract form?(): H;

  public abstract query?(): H;

  public abstract param?(): H;

  public abstract header?(): H;

}
