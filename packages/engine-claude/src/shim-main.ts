// Entry point of the git/gh PATH shims. Bundled by shim.ts with esbuild into the shim directory
// and run with plain `node`, so it must not rely on tsx or on the workspace layout at runtime.
import { spawnSync } from 'node:child_process';
import { evaluateCommand, type CommandContext } from '@suptron/runtime';
import { quote } from 'shell-quote';

function fail(message: string, code = 1): never {
  process.stderr.write(`suptron: ${message}\n`);
  process.exit(code);
}

function currentBranch(realGit: string): string | null {
  const result = spawnSync(realGit, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
    encoding: 'utf8',
  });
  const branch = (result.stdout ?? '').trim();
  return result.status === 0 && branch !== '' ? branch : null;
}

const [program, ...args] = process.argv.slice(2);
if (program !== 'git' && program !== 'gh') fail(`unknown shim program: ${String(program)}`, 2);

const env = process.env;
const real = program === 'git' ? env.SUPTRON_REAL_GIT : env.SUPTRON_REAL_GH;
if (!real) fail(`the real ${program} binary was not found on PATH`, 127);

const ctx: CommandContext | null =
  env.SUPTRON_GUARD_PROTECTED_BRANCH && env.SUPTRON_GUARD_CHECKOUT
    ? {
        protectedBranch: env.SUPTRON_GUARD_PROTECTED_BRANCH,
        checkoutPath: env.SUPTRON_GUARD_CHECKOUT,
        taskPath: env.SUPTRON_GUARD_TASK ?? '',
        configHome: env.SUPTRON_GUARD_CONFIG_HOME ?? '',
        currentBranch: currentBranch(env.SUPTRON_REAL_GIT ?? 'git'),
      }
    : null;

// Outside a Mission (no guard context) the shim is transparent.
if (ctx) {
  const verdict = evaluateCommand(quote([program, ...args]), ctx);
  if (!verdict.allowed) fail(`denied by the Laws: ${verdict.reason}`);
}

const result = spawnSync(real, args, { stdio: 'inherit' });
if (result.error) fail(`cannot run ${real}: ${result.error.message}`, 127);
process.exit(result.status ?? (result.signal ? 1 : 0));
