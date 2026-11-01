const MAX_CAUSE_DEPTH = 10;

const describeValue = (value: unknown): string => {
  if (value instanceof Error) return value.message;

  if (typeof value === 'string') return value;

  return Bun.inspect(value, { compact: true });
};

/** `"@OnStart hook 'Db.open()' failed: connection refused"` - the message, then every cause's. */
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

/** A stack trace never includes the cause; this is what to append to one. */
export const describeCauses = (error: unknown): string => {
  if (!(error instanceof Error) || error.cause === undefined || error.cause === error) return '';

  return `\nCaused by: ${describeErrorChain(error.cause)}`;
};
