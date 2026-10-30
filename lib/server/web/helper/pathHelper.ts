/**
 * Throws when a path-mounted component decorator was given no path.
 *
 * Runs before the component is defined, so a rejected class is never registered.
 *
 * @param {string} decorator - Decorator name as written, e.g. `'@Controller'`
 * @param {Function} target - The decorated class
 * @param {unknown} path - The path the decorator received
 */
export const assertPathGiven = (decorator: string, target: Function, path: unknown): void => {
  if (typeof path !== 'string') {
    throw new Error(`${decorator} on ${target.name}: "path" is required - use path: '/' for root-level routes`);
  }
};
