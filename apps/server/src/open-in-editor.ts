import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import { parse as parseShell } from 'shell-quote';

export const DEFAULT_EDITOR = 'code --goto {path}';

async function findOnPath(program: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  if (isAbsolute(program)) return program;
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, program);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

/** Resolves the editor command template into argv; falls back to `open` on macOS. */
export async function resolveEditorCommand(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  const template = env.SUPTRON_EDITOR?.trim() || DEFAULT_EDITOR;
  const argv = parseShell(template).map((token) => (typeof token === 'string' ? token : ''));
  const rendered = argv.map((arg) => arg.replaceAll('{path}', path));
  if (rendered.length === 0 || !rendered.some((a) => a === path)) rendered.push(path);
  const program = rendered[0]!;
  if (await findOnPath(program, env)) return rendered;
  if (platform === 'darwin') return ['open', path];
  throw new Error(`Editor "${program}" is not on PATH; set SUPTRON_EDITOR`);
}

export async function openInEditor(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const [program, ...args] = await resolveEditorCommand(path, env);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program!, args, { detached: true, stdio: 'ignore', env });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
