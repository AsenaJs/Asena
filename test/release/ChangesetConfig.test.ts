import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('.changeset/config.json', () => {
  it('disables Prettier so changesets never rewrites CHANGELOG.md with Prettier defaults', () => {
    const config = JSON.parse(readFileSync(join(import.meta.dir, '../../.changeset/config.json'), 'utf8'));

    expect(config.prettier).toBe(false);
  });
});
