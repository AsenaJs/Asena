import { describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('bun fmt configuration', () => {
  it('ignores an ancestor .editorconfig that sets tabs and CRLF', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bun-fmt-'));

    try {
      copyFileSync(join(import.meta.dir, '../../bunfig.toml'), join(dir, 'bunfig.toml'));
      writeFileSync(join(dir, '.editorconfig'), 'root = true\n\n[*]\nindent_style = tab\nend_of_line = crlf\n');
      writeFileSync(join(dir, 'sample.ts'), 'export function f() {\n  return 1;\n}\n');

      const proc = Bun.spawn([process.execPath, 'fmt', '--check'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });

      expect(await proc.exited).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
