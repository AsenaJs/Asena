import { describe, expect, it } from 'bun:test';
import { HttpException } from '../../lib/adapter';
import { ClientErrorStatusCode, ServerErrorStatusCode } from '../../lib/server/web/types';

describe('HttpException', () => {
  describe('constructor', () => {
    it('should create HttpException with string body', () => {
      const exception = new HttpException(404, 'Not Found');

      expect(exception.status).toBe(404);
      expect(exception.body).toBe('Not Found');
      expect(exception.message).toBe('Not Found');
      expect(exception.name).toBe('HttpException');
    });

    it('should create HttpException with object body', () => {
      const body = { error: 'Invalid input', field: 'email' };
      const exception = new HttpException(400, body);

      expect(exception.status).toBe(400);
      expect(exception.body).toEqual(body);
      expect(exception.message).toBe(JSON.stringify(body));
      expect(exception.name).toBe('HttpException');
    });

    it('should create HttpException with custom headers', () => {
      const exception = new HttpException(429, 'Too Many Requests', {
        headers: { 'Retry-After': '60' },
      });

      expect(exception.status).toBe(429);
      expect(exception.body).toBe('Too Many Requests');
      expect(exception.options?.headers).toEqual({ 'Retry-After': '60' });
    });

    it('should create HttpException with empty body by default', () => {
      const exception = new HttpException(500);

      expect(exception.status).toBe(500);
      expect(exception.body).toBe('');
      expect(exception.message).toBe('');
    });

    it('should create HttpException with custom statusText', () => {
      const exception = new HttpException(200, 'Success', {
        statusText: 'Custom Status',
      });

      expect(exception.status).toBe(200);
      expect(exception.options?.statusText).toBe('Custom Status');
    });
  });

  describe('getResponse', () => {
    it('should convert string body to Response', () => {
      const exception = new HttpException(404, 'Not Found');
      const response = exception.getResponse();

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(404);
      expect(response.body).toBeDefined();
    });

    it('should convert object body to JSON Response', async () => {
      const body = { error: 'Validation failed', fields: ['email', 'password'] };
      const exception = new HttpException(400, body);
      const response = exception.getResponse();

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const responseBody = await response.json();

      expect(responseBody).toEqual(body);
    });

    it('should include custom headers in Response', () => {
      const exception = new HttpException(401, 'Unauthorized', {
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
      const response = exception.getResponse();

      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    });

    it('should set Content-Type to application/json for object bodies', () => {
      const exception = new HttpException(400, { error: 'Bad Request' });
      const response = exception.getResponse();

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should not override existing Content-Type header', () => {
      const exception = new HttpException(
        200,
        { data: 'test' },
        {
          headers: { 'Content-Type': 'application/vnd.api+json' },
        },
      );
      const response = exception.getResponse();

      expect(response.headers.get('Content-Type')).toBe('application/vnd.api+json');
    });

    it('should include custom statusText in Response', () => {
      const exception = new HttpException(200, 'OK', {
        statusText: 'Custom OK',
      });
      const response = exception.getResponse();

      expect(response.statusText).toBe('Custom OK');
    });

    it('should handle empty body', async () => {
      const exception = new HttpException(204);
      const response = exception.getResponse();

      expect(response.status).toBe(204);

      const text = await response.text();

      expect(text).toBe('');
    });

    it('should handle complex nested objects', async () => {
      const body = {
        error: 'Validation Error',
        details: {
          fields: [
            { name: 'email', errors: ['required', 'invalid format'] },
            { name: 'age', errors: ['must be positive'] },
          ],
        },
      };
      const exception = new HttpException(422, body);
      const response = exception.getResponse();

      const responseBody = await response.json();

      expect(responseBody).toEqual(body);
    });

    it('should handle multiple custom headers', () => {
      const exception = new HttpException(503, 'Service Unavailable', {
        headers: {
          'Retry-After': '120',
          'X-Rate-Limit': '100',
          'X-Custom-Header': 'value',
        },
      });
      const response = exception.getResponse();

      expect(response.headers.get('Retry-After')).toBe('120');
      expect(response.headers.get('X-Rate-Limit')).toBe('100');
      expect(response.headers.get('X-Custom-Header')).toBe('value');
    });
  });

  describe('Common HTTP status codes', () => {
    it('should handle 400 Bad Request', () => {
      const exception = new HttpException(400, 'Bad Request');

      expect(exception.status).toBe(400);

      const response = exception.getResponse();

      expect(response.status).toBe(400);
    });

    it('should handle 401 Unauthorized', () => {
      const exception = new HttpException(401, 'Unauthorized');

      expect(exception.status).toBe(401);

      const response = exception.getResponse();

      expect(response.status).toBe(401);
    });

    it('should handle 403 Forbidden', () => {
      const exception = new HttpException(403, 'Forbidden');

      expect(exception.status).toBe(403);

      const response = exception.getResponse();

      expect(response.status).toBe(403);
    });

    it('should handle 404 Not Found', () => {
      const exception = new HttpException(404, 'Not Found');

      expect(exception.status).toBe(404);

      const response = exception.getResponse();

      expect(response.status).toBe(404);
    });

    it('should handle 429 Too Many Requests', () => {
      const exception = new HttpException(429, 'Too Many Requests');

      expect(exception.status).toBe(429);

      const response = exception.getResponse();

      expect(response.status).toBe(429);
    });

    it('should handle 500 Internal Server Error', () => {
      const exception = new HttpException(500, 'Internal Server Error');

      expect(exception.status).toBe(500);

      const response = exception.getResponse();

      expect(response.status).toBe(500);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long string bodies', async () => {
      const longString = 'a'.repeat(10000);
      const exception = new HttpException(413, longString);
      const response = exception.getResponse();

      const text = await response.text();

      expect(text.length).toBe(10000);
    });

    it('should handle special characters in body', async () => {
      const body = 'Special chars: <>&"\'\n\t';
      const exception = new HttpException(400, body);
      const response = exception.getResponse();

      const text = await response.text();

      expect(text).toBe(body);
    });

    it('should handle unicode characters', async () => {
      const body = { message: '你好世界 🌍 مرحبا بالعالم' };
      const exception = new HttpException(200, body);
      const response = exception.getResponse();

      const responseBody = await response.json();

      expect(responseBody).toEqual(body);
    });

    it('should handle null values in object body', async () => {
      const body = { value: null, empty: null };
      const exception = new HttpException(200, body);
      const response = exception.getResponse();

      const responseBody = await response.json();

      expect(responseBody).toEqual(body);
    });

    it('should handle arrays in body', async () => {
      const body = { items: [1, 2, 3, 4, 5] };
      const exception = new HttpException(200, body);
      const response = exception.getResponse();

      const responseBody = await response.json();

      expect(responseBody).toEqual(body);
    });
  });

  describe('HttpStatusCode support', () => {
    it('should accept ClientErrorStatusCode enum', () => {
      const exception = new HttpException(ClientErrorStatusCode.NotFound, 'Not Found');

      expect(exception.status).toBe(404);
      expect(exception.body).toBe('Not Found');
    });

    it('should accept ServerErrorStatusCode enum', () => {
      const exception = new HttpException(ServerErrorStatusCode.InternalServerError, 'Server Error');

      expect(exception.status).toBe(500);

      const response = exception.getResponse();

      expect(response.status).toBe(500);
    });

    it('should still accept plain numbers', () => {
      const exception = new HttpException(418, "I'm a teapot");

      expect(exception.status).toBe(418);
    });
  });

  describe('cause support', () => {
    it('should support cause option', () => {
      const cause = new Error('original database error');
      const exception = new HttpException(500, 'Internal Server Error', { cause });

      expect(exception.cause).toBe(cause);
      expect(exception.status).toBe(500);
    });

    it('should support cause with headers', () => {
      const cause = new Error('db connection failed');
      const exception = new HttpException(500, 'Database Error', {
        cause,
        headers: { 'X-Error-Source': 'database' },
      });

      expect(exception.cause).toBe(cause);

      const response = exception.getResponse();

      expect(response.headers.get('X-Error-Source')).toBe('database');
      expect(response.status).toBe(500);
    });

    it('should work without cause (backward compatible)', () => {
      const exception = new HttpException(400, 'Bad Request', {
        headers: { 'X-Custom': 'value' },
      });

      expect(exception.cause).toBeUndefined();
      expect(exception.options?.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should support cause with HttpStatusCode enum', () => {
      const cause = new TypeError('invalid type');
      const exception = new HttpException(ClientErrorStatusCode.BadRequest, 'Validation Error', { cause });

      expect(exception.status).toBe(400);
      expect(exception.cause).toBe(cause);
    });
  });
});
