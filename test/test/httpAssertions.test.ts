import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { TestHttpCall } from '../../lib/test/http/TestHttpCall';
import { TestHttpResponse } from '../../lib/test/http/TestHttpResponse';

/**
 * Exercises the fluent HTTP chain against a bare Bun.serve echo server.
 *
 * Deliberately no Asena server here: this suite is about the assertion mechanics
 * (ordering, memoisation, failure messages), and a real socket round-trip is all it needs.
 */
describe('TestHttpCall', () => {
  let server: Server<any>;
  let baseUrl: string;
  let hits = 0;

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      routes: {
        '/json': () => Response.json({ id: '1', name: 'Ada', role: 'admin' }),
        '/text': () => new Response('hello world'),
        '/headers': () => new Response('ok', { headers: { 'x-custom': 'asena-1' } }),
        '/not-found': () => new Response('no such user', { status: 404 }),
        '/broken-json': () => new Response('<html>oops</html>', { headers: { 'content-type': 'application/json' } }),
        '/count': () => {
          hits += 1;

          return new Response(String(hits));
        },
        '/echo-method': (req) => new Response(req.method),
      },
    });

    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  const call = (path: string, init?: RequestInit) => new TestHttpCall(`${baseUrl}${path}`, init);

  describe('expectStatus', () => {
    test('should pass on a matching status', async () => {
      await call('/text').expectStatus(200);
    });

    test('should include the method, url and body when it fails', async () => {
      const failure = await call('/not-found')
        .expectStatus(200)
        .then(
          () => null,
          (error: Error) => error,
        );

      expect(failure.message).toContain('Expected status 200 but received 404');
      expect(failure.message).toContain('/not-found');
      expect(failure.message).toContain('no such user');
    });
  });

  describe('expectHeader', () => {
    test('should match an exact value', async () => {
      await call('/headers').expectHeader('x-custom', 'asena-1');
    });

    test('should match a pattern and be case-insensitive on the name', async () => {
      await call('/headers').expectHeader('X-Custom', /^asena-\d+$/);
    });

    test('should report the headers that were actually sent when missing', async () => {
      const failure = await call('/headers')
        .expectHeader('x-missing', 'anything')
        .then(
          () => null,
          (error: Error) => error,
        );

      expect(failure.message).toContain("Expected header 'x-missing' to be present");
      expect(failure.message).toContain('Received headers:');
    });
  });

  describe('body assertions', () => {
    test('expectJson should deep-equal the whole body', async () => {
      await call('/json').expectJson({ id: '1', name: 'Ada', role: 'admin' });
    });

    test('expectJson should fail on a partial match', async () => {
      const failure = await call('/json')
        .expectJson({ id: '1' })
        .then(
          () => null,
          (error: Error) => error,
        );

      expect(failure).toBeInstanceOf(Error);
    });

    test('expectJsonContains should accept a subset', async () => {
      await call('/json').expectJsonContains({ name: 'Ada' });
    });

    test('expectBody should match an exact string and a pattern', async () => {
      await call('/text').expectBody('hello world');
      await call('/text').expectBody(/^hello/);
    });

    test('expect should run a custom assertion', async () => {
      await call('/json').expect((response) => {
        expect(response.json<{ role: string }>().role).toBe('admin');
      });
    });

    test('should surface the raw body when JSON parsing fails', async () => {
      const failure = await call('/broken-json')
        .expectJsonContains({ any: 'thing' })
        .then(
          () => null,
          (error: Error) => error,
        );

      expect(failure.message).toContain('Expected a JSON body but parsing failed');
      expect(failure.message).toContain('<html>oops</html>');
    });
  });

  describe('sending', () => {
    test('should not send anything until awaited', async () => {
      const before = hits;

      const pending = call('/count').expectStatus(200);

      expect(hits).toBe(before);

      await pending;

      expect(hits).toBe(before + 1);
    });

    test('should memoize the request across multiple awaits', async () => {
      const before = hits;
      const pending = call('/count');

      const [first, second] = [await pending, await pending];

      expect(hits).toBe(before + 1);
      expect(first).toBe(second);
    });

    test('should apply the method passed through init', async () => {
      await call('/echo-method', { method: 'DELETE' }).expectBody('DELETE');
    });

    test('should run assertions in the order they were chained', async () => {
      const order: string[] = [];

      await call('/text')
        .expect(() => {
          order.push('first');
        })
        .expect(() => {
          order.push('second');
        })
        .expect(() => {
          order.push('third');
        });

      expect(order).toEqual(['first', 'second', 'third']);
    });

    test('should reject assertions added after the request was sent', async () => {
      const pending = call('/text');

      await pending;

      expect(() => pending.expectStatus(200)).toThrow(/already been sent/);
    });

    test('should resolve to a buffered response that can be read repeatedly', async () => {
      const response = await call('/json');

      expect(response).toBeInstanceOf(TestHttpResponse);
      expect(response.text()).toBe(response.text());
      expect(response.json<Record<string, string>>()).toEqual({ id: '1', name: 'Ada', role: 'admin' });
      expect(response.status).toBe(200);
      expect(response.raw).toBeInstanceOf(Response);
    });
  });
});
