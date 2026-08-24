/**
 * Compile-time contract test for the AsenaContext / SSEMessage surface.
 *
 * Not a *.test.ts file: it is never executed, only type-checked. `bun run typecheck`
 * includes test/**, so reverting any member this file relies on turns the gate red -
 * which is the only way to test a type-level contract.
 */
import type { AsenaContext } from '../../lib/adapter';
import type { SSEMessage } from '../../lib/adapter/types';

declare const context: AsenaContext<Request, Response>;

export const absent: Promise<string | undefined> = context.getQuery('name');

context.appendResponseHeader?.('Vary', 'Origin');

export const heartbeat: SSEMessage = { comment: 'ping' };
