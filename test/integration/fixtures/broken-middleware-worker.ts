/**
 * A headless worker that imports a middleware without handle(), run as a real process by
 * MiddlewareDefinition.test.ts.
 *
 * The question it answers: does a broken middleware fail the process, or does the process
 * report success? A CI job that runs this file must go red, not green.
 *
 * Not a *.test.ts file, so the test runner does not pick it up on its own.
 */
import { Middleware } from '../../../lib/server/decorators';

@Middleware()
class BrokenMiddleware {}

console.log('LOADED_WITHOUT_ERROR');
void BrokenMiddleware;
