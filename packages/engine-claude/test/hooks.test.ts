import type { GuardContext } from '@suptron/runtime';
import { describe, expect, it } from 'vitest';
import { createPreToolUseHook, decideToolUse } from '../src/hooks.js';

const ctx: GuardContext = {
  protectedBranch: 'main',
  checkoutPath: '/work/repo',
  taskPath: '/work/tasks/t1',
  configHome: '/home/me/.suptron',
};
const exists = (path: string) =>
  path === '/work/repo/src/existing.ts' || path === '/work/tasks/t1/SPEC.md';

describe('decideToolUse', () => {
  it('denies git push --force', () => {
    const decision = decideToolUse(
      'Bash',
      { command: 'git push --force' },
      ctx,
      'feature/x',
      exists,
    );
    expect(decision.allowed).toBe(false);
  });

  it('allows a push of a feature branch', () => {
    expect(
      decideToolUse('Bash', { command: 'git push origin feature/x' }, ctx, 'feature/x', exists),
    ).toEqual({ allowed: true });
  });

  it('denies a commit on the protected branch', () => {
    expect(decideToolUse('Bash', { command: 'git commit -m x' }, ctx, 'main', exists).allowed).toBe(
      false,
    );
  });

  it('denies a Write into the configuration home', () => {
    const decision = decideToolUse(
      'Write',
      { file_path: '/home/me/.suptron/hangar/x.md', content: '' },
      ctx,
      null,
      exists,
    );
    expect(decision.allowed).toBe(false);
  });

  it('denies an Edit of an existing Task document', () => {
    const decision = decideToolUse(
      'Edit',
      { file_path: '/work/tasks/t1/SPEC.md', old_string: 'a', new_string: 'b' },
      ctx,
      null,
      exists,
    );
    expect(decision.allowed).toBe(false);
  });

  it('allows writing a new file next to the Task and in the Checkout', () => {
    expect(
      decideToolUse(
        'Write',
        { file_path: '/work/tasks/t1/ANALYSIS.md', content: '' },
        ctx,
        null,
        exists,
      ),
    ).toEqual({ allowed: true });
    expect(
      decideToolUse(
        'Write',
        { file_path: '/work/repo/src/new.ts', content: '' },
        ctx,
        null,
        exists,
      ),
    ).toEqual({ allowed: true });
    expect(
      decideToolUse('Edit', { file_path: '/work/repo/src/existing.ts' }, ctx, null, exists),
    ).toEqual({ allowed: true });
  });

  it('denies NotebookEdit outside the Checkout and ignores other tools', () => {
    expect(
      decideToolUse('NotebookEdit', { notebook_path: '/tmp/x.ipynb' }, ctx, null, exists).allowed,
    ).toBe(false);
    expect(decideToolUse('Read', { file_path: '/home/me/.suptron/x' }, ctx, null, exists)).toEqual({
      allowed: true,
    });
  });
});

describe('createPreToolUseHook', () => {
  it('returns the SDK deny shape for a denied Write', async () => {
    const hook = createPreToolUseHook(ctx, '/work/repo');
    const output = await hook(
      {
        hook_event_name: 'PreToolUse',
        session_id: 's',
        transcript_path: '',
        cwd: '/work/repo',
        tool_name: 'Write',
        tool_input: { file_path: '/etc/hosts', content: '' },
        tool_use_id: 't1',
      },
      't1',
      { signal: new AbortController().signal },
    );
    expect(output).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    });
  });
});
