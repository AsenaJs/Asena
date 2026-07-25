import { expect } from 'bun:test';
import { TestHttpResponse, truncate } from './TestHttpResponse';

/**
 * A pending HTTP call with a fluent assertion chain.
 *
 * Nothing is sent until the call is awaited. Assertions queue up in the order they were
 * chained and run against the buffered response; the send is memoized, so awaiting the
 * same call twice does not issue a second request.
 *
 * @example
 * ```typescript
 * await app.get('/users/1').expectStatus(200).expectJson({ id: '1', name: 'Ada' });
 *
 * const res = await app.post('/users', { body: JSON.stringify({ name: 'Ada' }) }).expectStatus(201);
 * expect(res.json().id).toBeString();
 * ```
 */
export class TestHttpCall implements PromiseLike<TestHttpResponse> {
  private readonly assertions: ((response: TestHttpResponse) => void | Promise<void>)[] = [];

  private pending?: Promise<TestHttpResponse>;

  private readonly url: string;

  private readonly init?: RequestInit;

  public constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.init = init;
  }

  /**
   * Asserts the response status code
   *
   * @param expected - Expected status
   * @returns this, for chaining
   */
  public expectStatus(expected: number): this {
    // Deliberately not `expect(status).toBe(n)`: a bare number mismatch is the least
    // useful failure in an HTTP test. The body almost always explains why.
    return this.enqueue((response) => {
      if (response.status !== expected) {
        throw new Error(
          `Expected status ${expected} but received ${response.status} for ${this.describeRequest()}\n` +
            `Body: ${truncate(response.text())}`,
        );
      }
    });
  }

  /**
   * Asserts a response header
   *
   * @param name - Header name (case-insensitive)
   * @param expected - Exact value, or a pattern to match
   * @returns this, for chaining
   */
  public expectHeader(name: string, expected: string | RegExp): this {
    return this.enqueue((response) => {
      const actual = response.headers.get(name);

      if (actual === null) {
        const received: string[] = [];

        response.headers.forEach((_value, key) => received.push(key));

        throw new Error(
          `Expected header '${name}' to be present for ${this.describeRequest()}, but it was not sent.\n` +
            `Received headers: ${received.join(', ') || '<none>'}`,
        );
      }

      if (expected instanceof RegExp) {
        expect(actual).toMatch(expected);
      } else {
        expect(actual).toBe(expected);
      }
    });
  }

  /**
   * Asserts the whole JSON body deep-equals the expected value
   *
   * @param expected - Expected body
   * @returns this, for chaining
   */
  public expectJson<T>(expected: T): this {
    return this.enqueue((response) => {
      expect(response.json()).toEqual(expected as any);
    });
  }

  /**
   * Asserts the JSON body contains at least the given properties
   *
   * @param partial - Subset the body must match
   * @returns this, for chaining
   */
  public expectJsonContains(partial: object): this {
    return this.enqueue((response) => {
      expect(response.json()).toMatchObject(partial);
    });
  }

  /**
   * Asserts the raw text body
   *
   * @param expected - Exact body, or a pattern to match
   * @returns this, for chaining
   */
  public expectBody(expected: string | RegExp): this {
    return this.enqueue((response) => {
      if (expected instanceof RegExp) {
        expect(response.text()).toMatch(expected);
      } else {
        expect(response.text()).toBe(expected);
      }
    });
  }

  /**
   * Escape hatch for assertions the chain does not cover
   *
   * @param assertion - Runs against the buffered response, may be async
   * @returns this, for chaining
   *
   * @example
   * ```typescript
   * await app.get('/users').expect((res) => {
   *   expect(res.json<User[]>()).toHaveLength(3);
   * });
   * ```
   */
  public expect(assertion: (response: TestHttpResponse) => void | Promise<void>): this {
    return this.enqueue(assertion);
  }

  public then<TResult1 = TestHttpResponse, TResult2 = never>(
    onfulfilled?: ((value: TestHttpResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.send().then(onfulfilled, onrejected);
  }

  private enqueue(assertion: (response: TestHttpResponse) => void | Promise<void>): this {
    if (this.pending !== undefined) {
      throw new Error(
        'Cannot add assertions to a TestHttpCall that has already been sent. ' +
          'Chain every expect* call before awaiting the request.',
      );
    }

    this.assertions.push(assertion);

    return this;
  }

  private send(): Promise<TestHttpResponse> {
    if (this.pending === undefined) {
      this.pending = this.run();
    }

    return this.pending;
  }

  private async run(): Promise<TestHttpResponse> {
    const response = await TestHttpResponse.from(await fetch(this.url, this.init));

    for (const assertion of this.assertions) {
      await assertion(response);
    }

    return response;
  }

  private describeRequest(): string {
    return `${(this.init?.method ?? 'GET').toUpperCase()} ${this.url}`;
  }
}
