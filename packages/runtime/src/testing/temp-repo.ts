import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec, execOk } from '../process/exec.js';

export interface TempRepo {
  root: string;
  /** A bare repository standing in for the remote. */
  remotePath: string;
  /** A clone of it on `main`, with one commit. */
  clonePath: string;
  git(args: string[], cwd?: string): Promise<string>;
  cleanup(): Promise<void>;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Suptron Test',
  GIT_AUTHOR_EMAIL: 'test@suptron.local',
  GIT_COMMITTER_NAME: 'Suptron Test',
  GIT_COMMITTER_EMAIL: 'test@suptron.local',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: tmpdir(),
};

/** Creates a bare "remote" plus a clone with a `main` branch so GitClient tests run real git. */
export async function tempRepo(branch = 'main'): Promise<TempRepo> {
  const root = await mkdtemp(join(tmpdir(), 'suptron-repo-'));
  const remotePath = join(root, 'remote.git');
  const clonePath = join(root, 'clone');
  const env = { ...process.env, ...GIT_ENV };
  const git = async (args: string[], cwd = clonePath) =>
    (await execOk('git', args, { cwd, env }, exec)).stdout;

  await execOk('git', ['init', '--bare', '-b', branch, remotePath], { env }, exec);
  await execOk('git', ['clone', '-q', remotePath, clonePath], { env }, exec);
  await git(['checkout', '-q', '-b', branch]);
  await git(['config', 'user.name', 'Suptron Test']);
  await git(['config', 'user.email', 'test@suptron.local']);
  await writeFile(join(clonePath, 'README.md'), '# temp repo\n');
  await git(['add', 'README.md']);
  await git(['commit', '-q', '-m', 'initial']);
  await git(['push', '-q', '-u', 'origin', branch]);
  await git(['remote', 'set-head', 'origin', branch]);

  return {
    root,
    remotePath,
    clonePath,
    git,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
