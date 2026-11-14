import { describe, expect, test } from 'bun:test';
import { generateHandlerParams } from '../../../lib/server/web/decorators/http.base';

describe('generateHandlerParams', () => {
  test('explicit undefined optional fields fall back to the defaults', () => {
    const params = generateHandlerParams({
      path: '/items',
      middlewares: undefined,
      summary: undefined,
      description: undefined,
    });

    expect(params.middlewares).toEqual([]);
    expect(params.summary).toBe('');
    expect(params.description).toBe('');
  });
});
