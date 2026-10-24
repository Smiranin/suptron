import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

/** The editors import `@suptron/runtime/browser`; nothing behind it may pull in Node built-ins. */
describe('browser entry', () => {
  it('bundles for the browser without node: or child_process imports', async () => {
    const entry = fileURLToPath(new URL('../src/browser.ts', import.meta.url));
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      logLevel: 'silent',
    });
    const text = result.outputFiles[0]!.text;
    expect(text).not.toMatch(/from\s+["']node:/);
    expect(text).not.toMatch(/require\(["']node:/);
    expect(text).not.toContain('child_process');
    expect(text).not.toContain('node:fs');
  }, 30_000);
});
