/**
 * Pattern matching utility for global middleware routing
 *
 * Supports:
 * - Exact match: '/users'
 * - Wildcard: '/api/*'
 * - Parameters: '/users/:id'
 * - Multiple patterns: ['/api/*', '/admin/*']
 */

import type { GlobalMiddlewareRouteConfig } from '../server/config';

/**
 * Checks if a path matches a pattern
 *
 * @param path - Request path to test (e.g., '/api/users/123')
 * @param pattern - Pattern to match against (e.g., '/api/*', '/users/:id')
 * @returns true if path matches pattern
 *
 * @example
 * matchesPattern('/api/users', '/api/*') // => true
 * matchesPattern('/api/users/123', '/api/users/:id') // => true
 * matchesPattern('/health', '/api/*') // => false
 */
export function matchesPattern(path: string, pattern: string): boolean {
  // Exact match
  if (path === pattern) {
    return true;
  }

  // Wildcard pattern: /api/* matches /api/users, /api/users/123, etc.
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .split('/')
      .map((segment) => {
        if (segment === '*') {
          return '.*'; // Match any characters
        }

        if (segment.includes('*')) {
          return segment.replace(/\*/g, '.*'); // Partial wildcard
        }

        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
      })
      .join('\\/');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(path);
  }

  // Parameter pattern: /users/:id matches /users/123, /users/abc, etc.
  if (pattern.includes(':')) {
    const regexPattern = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          return '[^/]+'; // Match any non-slash characters
        }

        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
      })
      .join('\\/');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(path);
  }

  // No match
  return false;
}

/**
 * Checks if a path should have middleware applied based on include/exclude rules
 *
 * Rules:
 * 1. If no include patterns, default to ['*'] (all routes)
 * 2. Path must match at least one include pattern
 * 3. Exclude patterns take precedence (if matched, return false)
 *
 * @param path - Request path to test
 * @param config - Route configuration with include/exclude patterns
 * @returns true if middleware should be applied to this path
 *
 * @example
 * shouldApplyMiddleware('/api/users', { include: ['/api/*'] }) // => true
 * shouldApplyMiddleware('/health', { exclude: ['/health'] }) // => false
 * shouldApplyMiddleware('/api/health', { include: ['/api/*'], exclude: ['/api/health'] }) // => false
 */
export function shouldApplyMiddleware(path: string, config?: GlobalMiddlewareRouteConfig): boolean {
  // No config means apply to all routes
  if (!config) {
    return true;
  }

  const { include = ['*'], exclude = [] } = config;

  // Check exclusions first (they take precedence)
  for (const excludePattern of exclude) {
    if (matchesPattern(path, excludePattern)) {
      return false; // Excluded, don't apply
    }
  }

  // Check inclusions
  for (const includePattern of include) {
    if (matchesPattern(path, includePattern)) {
      return true; // Included and not excluded, apply
    }
  }

  // Not included, don't apply
  return false;
}
