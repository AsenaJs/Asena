const MAX_CAUSE_DEPTH = 10;

const describeValue = (value: unknown): string => {
  if (value instanceof Error) return value.message;

  if (typeof value === 'string') return value;

  return Bun.inspect(value, { compact: true });
};

/**
 * The message of an error followed by the message of every `cause` under it, joined with `': '`.
 *
 * @param {unknown} error - Whatever was thrown
 * @returns {string} For example `"@OnStart hook 'Db.open()' failed: connection refused"`
 */
export const describeErrorChain = (error: unknown): string => {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (parts.length < MAX_CAUSE_DEPTH && !seen.has(current)) {
    seen.add(current);
    parts.push(describeValue(current));

    if (!(current instanceof Error) || current.cause === undefined) break;

    current = current.cause;
  }

  return parts.join(': ');
};

/**
 * Only the `cause` part of {@link describeErrorChain}, prefixed for appending to a stack trace.
 *
 * @param {unknown} error - Whatever was thrown
 * @returns {string} `''` when there is no cause, otherwise `'\nCaused by: ...'`
 */
export const describeCauses = (error: unknown): string => {
  if (!(error instanceof Error) || error.cause === undefined || error.cause === error) return '';

  return `\nCaused by: ${describeErrorChain(error.cause)}`;
};
