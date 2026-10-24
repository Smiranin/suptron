import { stat } from 'node:fs/promises';
import { exec as defaultExec, type ExecFn } from '../process/exec.js';
import type { Checkout, GitClient, RemoteDefaults } from './types.js';

/** Parses `git worktree list --porcelain`. */
export function parseWorktreeList(output: string): Checkout[] {
  const checkouts: Checkout[] = [];
  let current: { path?: string; branch: string | null } | null = null;
  const flush = () => {
    if (current?.path) {
      checkouts.push({
        path: current.path,
        branch: current.branch,
        isMainWorktree: checkouts.length === 0,
      });
    }
    current = null;
  };
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush();
      current = { path: line.slice('worktree '.length), branch: null };
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'detached' && current) {
      current.branch = null;
    } else if (line === '') {
      flush();
    }
  }
  flush();
  return checkouts;
}

export class RealGitClient implements GitClient {
  constructor(private readonly run: ExecFn = defaultExec) {}

  async listCheckouts(repositoryPath: string): Promise<Checkout[]> {
    // A missing directory would surface as a confusing "spawn git ENOENT" otherwise.
    const info = await stat(repositoryPath).catch(() => null);
    if (!info?.isDirectory())
      throw new Error(`The repository path does not exist: ${repositoryPath}`);
    const result = await this.run('git', ['worktree', 'list', '--porcelain'], {
      cwd: repositoryPath,
      timeoutMs: 15_000,
    });
    if (result.code !== 0) {
      throw new Error(`Cannot list the Checkouts of ${repositoryPath}: ${result.stderr.trim()}`);
    }
    return parseWorktreeList(result.stdout);
  }

  async currentBranch(checkoutPath: string): Promise<string | null> {
    const result = await this.run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: checkoutPath,
      timeoutMs: 15_000,
    });
    if (result.code !== 0) return null;
    const branch = result.stdout.trim();
    return branch === '' ? null : branch;
  }

  async readRemoteDefaults(repositoryPath: string, remote = 'origin'): Promise<RemoteDefaults> {
    const url = await this.run('git', ['remote', 'get-url', remote], {
      cwd: repositoryPath,
      timeoutMs: 15_000,
    });
    const head = await this.run(
      'git',
      ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`],
      {
        cwd: repositoryPath,
        timeoutMs: 15_000,
      },
    );
    const remoteUrl = url.code === 0 && url.stdout.trim() !== '' ? url.stdout.trim() : null;
    let headBranch: string | null = null;
    if (head.code === 0 && head.stdout.trim() !== '') {
      headBranch = head.stdout.trim().replace(new RegExp(`^${remote}/`), '');
    }
    return { remoteUrl, headBranch };
  }

  async diffSummary(checkoutPath: string, baseBranch: string): Promise<string> {
    const result = await this.run('git', ['diff', '--stat', baseBranch], {
      cwd: checkoutPath,
      timeoutMs: 30_000,
    });
    if (result.code !== 0)
      return `(diff against ${baseBranch} unavailable: ${result.stderr.trim()})`;
    return result.stdout.trim() || '(no changes)';
  }
}
