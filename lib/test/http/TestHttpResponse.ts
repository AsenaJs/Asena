/**
 * A response whose body has already been read.
 *
 * `Response` bodies can only be consumed once, which makes them awkward to assert against
 * more than one way. This buffers the body at construction so `text()` and `json()` are
 * synchronous and repeatable.
 */
export class TestHttpResponse {
  /**
   * The underlying fetch Response. Its body stream is already consumed.
   */
  public readonly raw: Response;

  private readonly body: string;

  private constructor(raw: Response, body: string) {
    this.raw = raw;
    this.body = body;
  }

  /**
   * Buffers a fetch Response into a TestHttpResponse
   *
   * @param raw - Response to consume
   * @returns The buffered response
   */
  public static async from(raw: Response): Promise<TestHttpResponse> {
    return new TestHttpResponse(raw, await raw.text());
  }

  public get status(): number {
    return this.raw.status;
  }

  public get headers(): Headers {
    return this.raw.headers;
  }

  /**
   * The response body as text
   *
   * @returns Body string
   */
  public text(): string {
    return this.body;
  }

  /**
   * The response body parsed as JSON
   *
   * @returns Parsed body
   * @throws When the body is not valid JSON - the message includes the raw body
   */
  public json<T = any>(): T {
    try {
      return JSON.parse(this.body) as T;
    } catch {
      throw new Error(`Expected a JSON body but parsing failed. Received: ${truncate(this.body)}`);
    }
  }
}

/**
 * Shortens a body for error messages so a large HTML page cannot bury the failure
 *
 * @param value - Body text
 * @returns Truncated text
 *
 * @internal
 */
export function truncate(value: string, limit = 500): string {
  if (value.length <= limit) {
    return value.length ? value : '<empty body>';
  }

  return `${value.slice(0, limit)}... (${value.length} bytes total)`;
}
