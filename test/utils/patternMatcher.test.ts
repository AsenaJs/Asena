import { describe, expect, test } from 'bun:test';
import { matchesPattern, shouldApplyMiddleware } from '../../lib/utils/patternMatcher';

describe('matchesPattern', () => {
  test('exact match', () => {
    expect(matchesPattern('/users', '/users')).toBe(true);
    expect(matchesPattern('/users', '/posts')).toBe(false);
  });

  test('wildcard patterns', () => {
    expect(matchesPattern('/api/users', '/api/*')).toBe(true);
    expect(matchesPattern('/api/users/123', '/api/*')).toBe(true);
    expect(matchesPattern('/api', '/api/*')).toBe(false); // No trailing segment
    expect(matchesPattern('/health', '/api/*')).toBe(false);
  });

  test('parameter patterns', () => {
    expect(matchesPattern('/users/123', '/users/:id')).toBe(true);
    expect(matchesPattern('/users/abc', '/users/:id')).toBe(true);
    expect(matchesPattern('/users', '/users/:id')).toBe(false); // Missing param
    expect(matchesPattern('/users/123/posts/456', '/users/:id/posts/:postId')).toBe(true);
  });

  test('root path', () => {
    expect(matchesPattern('/', '/')).toBe(true);
    expect(matchesPattern('/', '*')).toBe(true);
  });

  test('complex wildcard patterns', () => {
    expect(matchesPattern('/api/v1/users', '/api/*/users')).toBe(true);
    expect(matchesPattern('/api/v2/users', '/api/*/users')).toBe(true);
    expect(matchesPattern('/api/v1/posts', '/api/*/users')).toBe(false);
  });

  test('mixed parameter and wildcard', () => {
    expect(matchesPattern('/api/users/123', '/api/users/:id')).toBe(true);
    expect(matchesPattern('/api/posts/456', '/api/*/456')).toBe(true);
  });
});

describe('shouldApplyMiddleware', () => {
  test('no config - apply to all', () => {
    expect(shouldApplyMiddleware('/any/path')).toBe(true);
    expect(shouldApplyMiddleware('/')).toBe(true);
    expect(shouldApplyMiddleware('/api/users/123')).toBe(true);
  });

  test('include patterns', () => {
    expect(shouldApplyMiddleware('/api/users', { include: ['/api/*'] })).toBe(true);
    expect(shouldApplyMiddleware('/health', { include: ['/api/*'] })).toBe(false);
    expect(shouldApplyMiddleware('/admin/users', { include: ['/api/*'] })).toBe(false);
  });

  test('exclude patterns', () => {
    expect(shouldApplyMiddleware('/health', { exclude: ['/health'] })).toBe(false);
    expect(shouldApplyMiddleware('/metrics', { exclude: ['/health'] })).toBe(true);
    expect(shouldApplyMiddleware('/api/users', { exclude: ['/health'] })).toBe(true);
  });

  test('include + exclude (exclude takes precedence)', () => {
    expect(
      shouldApplyMiddleware('/api/users', {
        include: ['/api/*'],
        exclude: ['/api/health'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/api/health', {
        include: ['/api/*'],
        exclude: ['/api/health'],
      }),
    ).toBe(false); // Excluded wins
  });

  test('multiple include patterns', () => {
    expect(
      shouldApplyMiddleware('/api/users', {
        include: ['/api/*', '/admin/*'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/admin/users', {
        include: ['/api/*', '/admin/*'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/public/users', {
        include: ['/api/*', '/admin/*'],
      }),
    ).toBe(false);
  });

  test('multiple exclude patterns', () => {
    expect(
      shouldApplyMiddleware('/health', {
        exclude: ['/health', '/metrics', '/ping'],
      }),
    ).toBe(false);

    expect(
      shouldApplyMiddleware('/metrics', {
        exclude: ['/health', '/metrics', '/ping'],
      }),
    ).toBe(false);

    expect(
      shouldApplyMiddleware('/api/users', {
        exclude: ['/health', '/metrics', '/ping'],
      }),
    ).toBe(true);
  });

  test('wildcard include with exact exclude', () => {
    expect(
      shouldApplyMiddleware('/api/users', {
        include: ['/api/*'],
        exclude: ['/api/health', '/api/metrics'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/api/health', {
        include: ['/api/*'],
        exclude: ['/api/health', '/api/metrics'],
      }),
    ).toBe(false);

    expect(
      shouldApplyMiddleware('/api/metrics', {
        include: ['/api/*'],
        exclude: ['/api/health', '/api/metrics'],
      }),
    ).toBe(false);
  });

  test('parameter patterns in include', () => {
    expect(
      shouldApplyMiddleware('/users/123', {
        include: ['/users/:id'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/users/abc', {
        include: ['/users/:id'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/posts/123', {
        include: ['/users/:id'],
      }),
    ).toBe(false);
  });

  test('default include behavior (wildcard)', () => {
    // When no include specified, default is ['*'] (all routes)
    expect(
      shouldApplyMiddleware('/any/path', {
        exclude: ['/health'],
      }),
    ).toBe(true);

    expect(
      shouldApplyMiddleware('/health', {
        exclude: ['/health'],
      }),
    ).toBe(false);
  });

  test('empty include array - nothing matches', () => {
    expect(
      shouldApplyMiddleware('/api/users', {
        include: [],
      }),
    ).toBe(false);

    expect(
      shouldApplyMiddleware('/any/path', {
        include: [],
      }),
    ).toBe(false);
  });

  test('complex real-world scenarios', () => {
    // Scenario 1: API routes with auth, except public endpoints
    const apiAuthConfig = {
      include: ['/api/*'],
      exclude: ['/api/public/*', '/api/health'],
    };

    expect(shouldApplyMiddleware('/api/users', apiAuthConfig)).toBe(true);
    expect(shouldApplyMiddleware('/api/posts/123', apiAuthConfig)).toBe(true);
    expect(shouldApplyMiddleware('/api/public/docs', apiAuthConfig)).toBe(false);
    expect(shouldApplyMiddleware('/api/health', apiAuthConfig)).toBe(false);

    // Scenario 2: Rate limiting on all routes except monitoring
    const rateLimitConfig = {
      exclude: ['/health', '/metrics', '/ping'],
    };

    expect(shouldApplyMiddleware('/api/users', rateLimitConfig)).toBe(true);
    expect(shouldApplyMiddleware('/health', rateLimitConfig)).toBe(false);
    expect(shouldApplyMiddleware('/metrics', rateLimitConfig)).toBe(false);

    // Scenario 3: CORS only on API and GraphQL
    const corsConfig = {
      include: ['/api/*', '/graphql/*'],
    };

    expect(shouldApplyMiddleware('/api/users', corsConfig)).toBe(true);
    expect(shouldApplyMiddleware('/graphql/query', corsConfig)).toBe(true);
    expect(shouldApplyMiddleware('/admin/dashboard', corsConfig)).toBe(false);
  });
});
