import { describe, expect, it } from 'vitest';
import { evaluateCommand, evaluatePath, type CommandContext } from '../src/laws/index.js';

const ctx: CommandContext = {
  protectedBranch: 'main',
  checkoutPath: '/work/repo',
  taskPath: '/work/tasks/t1',
  configHome: '/home/me/.suptron',
  currentBranch: 'feature/x',
};
const onMain: CommandContext = { ...ctx, currentBranch: 'main' };

/** This table doubles as the readable specification of the Laws. */
const commandTable: [command: string, context: CommandContext, allowed: boolean][] = [
  // creating and switching branches, committing and pushing on a feature branch
  ['git checkout -b feature/x', onMain, true],
  ['git switch -c feature/x', onMain, true],
  ['git push -u origin feature/x', ctx, true],
  ['git commit -m "work"', ctx, true],
  ['git add -A && git commit -m "work" && git push', ctx, true],
  ['git status', onMain, true],
  ['git log --oneline -5', onMain, true],
  ['git fetch origin', onMain, true],
  ['git branch feature/y', onMain, true],
  ['git stash && git stash pop', ctx, true],
  // the protected branch is never changed
  ['git commit -m "oops"', onMain, false],
  ['git push', onMain, false],
  ['git push origin HEAD', onMain, false],
  ['git merge feature/x', onMain, false],
  ['git rebase feature/x', onMain, false],
  ['git cherry-pick abc123', onMain, false],
  ['git reset --hard HEAD~1', onMain, false],
  ['git push origin feature/x:main', ctx, false],
  ['git push origin main', ctx, false],
  ['git push origin HEAD:refs/heads/main', ctx, false],
  // force pushes
  ['git push --force', ctx, false],
  ['git push -f origin feature/x', ctx, false],
  ['git push --force-with-lease', ctx, false],
  ['git push origin +feature/x', ctx, false],
  ['git push --mirror origin', ctx, false],
  // no branch is ever deleted or renamed, not even the Mission's own
  ['git branch -D feature/x', ctx, false],
  ['git branch -d feature/x', ctx, false],
  ['git branch --delete feature/x', ctx, false],
  ['git branch -m feature/renamed', ctx, false],
  ['git branch -M main', ctx, false],
  ['git push origin :feature/x', ctx, false],
  ['git push origin --delete feature/x', ctx, false],
  ['git push -d origin feature/x', ctx, false],
  ['git update-ref -d refs/heads/feature/x', ctx, false],
  ['git worktree remove ../wt', ctx, false],
  ['git worktree prune', ctx, false],
  ['git worktree add ../wt feature/y', ctx, true],
  // remotes and hooks
  ['git remote set-url origin git@evil', ctx, false],
  ['git remote remove origin', ctx, false],
  ['git remote -v', ctx, true],
  ['git config remote.origin.url x', ctx, false],
  ['git config core.hooksPath /tmp', ctx, false],
  ['git config user.name "Bot"', ctx, true],
  // obfuscated forms
  ['/usr/bin/git push --force', ctx, false],
  ['cd /work/repo && /usr/bin/git branch -D x', ctx, false],
  ['GIT_TRACE=1 git push -f', ctx, false],
  ['env git push --force', ctx, false],
  ['git -C /work/repo push --delete origin x', ctx, false],
  ['pnpm test && git push origin feature/x', ctx, true],
  ['echo "git push --force"', ctx, true],
  ['git push origin feature/x | tee log.txt', ctx, true],
  // gh
  ['gh pr ready 12', ctx, false],
  ['gh pr merge 12 --squash', ctx, false],
  ['gh pr close 12', ctx, false],
  ['gh pr close 12 --delete-branch', ctx, false],
  ['gh pr view 12 --json state', ctx, true],
  ['gh pr create --draft --title t --body b', ctx, true],
  ['gh pr comment 12 --body "finding"', ctx, true],
  ['gh pr checks 12', ctx, true],
  ['gh repo edit --default-branch dev', ctx, false],
  ['gh repo delete', ctx, false],
  ['gh repo view', ctx, true],
  ['gh secret set X', ctx, false],
  ['gh variable list', ctx, false],
  ['gh workflow run ci.yml', ctx, false],
  ['gh run rerun 1', ctx, false],
  ['gh run cancel 1', ctx, false],
  ['gh run view 1', ctx, true],
  ['gh release create v1', ctx, false],
  ['gh api repos/o/r/pulls/12', ctx, true],
  ['gh api -X PUT repos/o/r/pulls/12/merge', ctx, false],
  ['gh api --method POST repos/o/r/merges -f base=main', ctx, false],
  ['gh api -X PUT repos/o/r/branches/main/protection', ctx, false],
  ['gh api -X POST repos/o/r/actions/workflows/ci.yml/dispatches', ctx, false],
  ['gh api repos/o/r/actions/runs', ctx, true],
  ['gh api -X DELETE repos/o/r/git/refs/heads/x', ctx, false],
  ['gh api -X PUT repos/o/r/actions/secrets/X', ctx, false],
  ['gh api -X POST repos/o/r/deployments', ctx, false],
  ['gh api -X POST repos/o/r/hooks', ctx, false],
  ['gh api -X POST repos/o/r/pulls/12/comments -f body=x', ctx, true],
  [
    'gh api graphql -f query="mutation { mergePullRequest(input: {}) { clientMutationId } }"',
    ctx,
    false,
  ],
  [
    'gh api graphql -f query="mutation { markPullRequestReadyForReview(input: {}) { clientMutationId } }"',
    ctx,
    false,
  ],
  ['gh api graphql -f query="mutation { deleteRef(input: {}) { clientMutationId } }"', ctx, false],
  [
    'gh api graphql -f query="{ repository(owner: \\"o\\", name: \\"r\\") { pullRequest(number: 1) { reviewThreads(first: 100) { nodes { isResolved } } } } }"',
    ctx,
    true,
  ],
  // unrelated commands
  ['pnpm test', onMain, true],
  ['ls -la', onMain, true],
];

describe('evaluateCommand', () => {
  it.each(commandTable)('%s → %s', (command, context, allowed) => {
    expect(evaluateCommand(command, context).allowed).toBe(allowed);
  });

  it('denies an unparseable git command', () => {
    const verdict = evaluateCommand('git push "unterminated', ctx);
    expect(verdict).toEqual({ allowed: false, reason: 'unparseable' });
  });

  it('names the reason of a denial', () => {
    const verdict = evaluateCommand('git commit -m x', onMain);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain('protected branch');
  });
});

const pathTable: [path: string, mode: 'read' | 'write' | 'create', allowed: boolean][] = [
  ['/work/repo/src/a.ts', 'write', true],
  ['/work/repo/src/new.ts', 'create', true],
  ['src/relative.ts', 'create', true],
  ['/work/repo/.git/config', 'write', false],
  ['/work/repo/.git/hooks/pre-commit', 'create', false],
  ['/work/tasks/t1/SPEC.md', 'read', true],
  ['/work/tasks/t1/SPEC.md', 'write', false],
  ['/work/tasks/t1/answers.md', 'create', true],
  ['/home/me/.suptron/hangar/analyst.md', 'read', false],
  ['/home/me/.suptron/hangar/analyst.md', 'write', false],
  ['/etc/hosts', 'write', false],
  ['/tmp/x', 'create', false],
  ['/etc/hosts', 'read', true],
  ['/work/repo-other/file', 'write', false],
];

describe('evaluatePath', () => {
  it.each(pathTable)('%s (%s) → %s', (path, mode, allowed) => {
    expect(evaluatePath(path, mode, ctx).allowed).toBe(allowed);
  });
});

describe('evaluatePath with a text Task stored in the configuration home', () => {
  const textTask: CommandContext = { ...ctx, taskPath: '/home/me/.suptron/missions/m1' };
  it.each([
    ['/home/me/.suptron/missions/m1/task.md', 'read', true],
    ['/home/me/.suptron/missions/m1/task.md', 'write', false],
    ['/home/me/.suptron/missions/m1/notes.md', 'create', true],
    ['/home/me/.suptron/missions/active.json', 'read', false],
    ['/home/me/.suptron/hangar/analyst.md', 'read', false],
  ] as [string, 'read' | 'write' | 'create', boolean][])('%s (%s) → %s', (path, mode, allowed) => {
    expect(evaluatePath(path, mode, textTask).allowed).toBe(allowed);
  });
});

describe('evaluatePath with symlinked roots', () => {
  it('treats a path through a symlink as inside the Checkout', async () => {
    const { mkdtemp, symlink, rm, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'suptron-laws-'));
    const real = join(root, 'real');
    await mkdir(real);
    const link = join(root, 'link');
    await symlink(real, link);
    const linked: CommandContext = {
      ...ctx,
      checkoutPath: link,
      taskPath: join(root, 'task'),
      configHome: join(root, 'home'),
    };
    expect(evaluatePath(join(real, 'new.txt'), 'create', linked).allowed).toBe(true);
    expect(evaluatePath(join(link, 'new.txt'), 'create', linked).allowed).toBe(true);
    expect(evaluatePath(join(real, '.git', 'config'), 'write', linked).allowed).toBe(false);
    expect(evaluatePath(join(root, 'elsewhere.txt'), 'create', linked).allowed).toBe(false);
    await rm(root, { recursive: true, force: true });
  });
});
