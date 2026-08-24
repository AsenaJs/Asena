/**
 * Compile-time contract test for the AsenaContext / SSEMessage surface.
 *
 * Not a *.test.ts file: it is never executed, only type-checked. `bun run typecheck`
 * includes test/**, so removing `appendResponseHeader`, making `SSEMessage.data`
 * required again or dropping `comment` turns the gate red.
 *
 * The `getQuery` line is documentary only: with `strictNullChecks` off (this repo's
 * tsconfig) `string | undefined` collapses to `string`, and assignment is covariant
 * anyway, so no type expression here can pin the `| undefined` half. The adapters' tests
 * pin the runtime behaviour instead.
 */
import type { AsenaContext } from '../../lib/adapter';
import type { SSEMessage } from '../../lib/adapter/types';

declare const context: AsenaContext<Request, Response>;

export const absent: Promise<string | undefined> = context.getQuery('name');

context.appendResponseHeader?.('Vary', 'Origin');

export const heartbeat: SSEMessage = { comment: 'ping' };
