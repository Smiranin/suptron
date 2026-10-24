import { existsSync } from 'node:fs';
import type {
  HookCallback,
  HookCallbackMatcher,
  HookJSONOutput,
} from '@anthropic-ai/claude-agent-sdk';
import { evaluateCommand, evaluatePath, exec, type GuardContext } from '@suptron/runtime';

export const GUARDED_FILE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const;

export type ToolDecision = { allowed: true } | { allowed: false; reason: string };

function pathOf(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const input = toolInput as Record<string, unknown>;
  const candidate = input.file_path ?? input.notebook_path ?? input.path;
  return typeof candidate === 'string' && candidate !== '' ? candidate : null;
}

/**
 * The pure decision of the Laws hook: Bash commands go through `evaluateCommand`, file tools
 * through `evaluatePath`. `currentBranch` and `fileExists` are injected so this is testable
 * without git or a file system.
 */
export function decideToolUse(
  toolName: string,
  toolInput: unknown,
  ctx: GuardContext,
  currentBranch: string | null,
  fileExists: (path: string) => boolean,
): ToolDecision {
  if (toolName === 'Bash') {
    const command =
      toolInput && typeof toolInput === 'object'
        ? (toolInput as Record<string, unknown>).command
        : undefined;
    if (typeof command !== 'string') return { allowed: true };
    const verdict = evaluateCommand(command, { ...ctx, currentBranch });
    return verdict.allowed ? { allowed: true } : { allowed: false, reason: verdict.reason };
  }
  if ((GUARDED_FILE_TOOLS as readonly string[]).includes(toolName)) {
    const path = pathOf(toolInput);
    if (!path) return { allowed: true };
    const mode = toolName === 'Write' && !fileExists(path) ? 'create' : 'write';
    const verdict = evaluatePath(path, mode, ctx);
    return verdict.allowed
      ? { allowed: true }
      : { allowed: false, reason: verdict.reason ?? 'denied' };
  }
  return { allowed: true };
}

/** The branch the Checkout is on right now, or null on a detached HEAD or outside a repository. */
export async function readCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const result = await exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd,
      timeoutMs: 10_000,
    });
    const branch = result.stdout.trim();
    return result.code === 0 && branch !== '' ? branch : null;
  } catch {
    return null;
  }
}

export function denyOutput(reason: string): HookJSONOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Denied by the Laws: ${reason}`,
    },
  };
}

/** The PreToolUse hook that enforces the Laws, as the first of the two enforcement layers. */
export function createPreToolUseHook(ctx: GuardContext, cwd: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const currentBranch = input.tool_name === 'Bash' ? await readCurrentBranch(cwd) : null;
    const decision = decideToolUse(
      input.tool_name,
      input.tool_input,
      ctx,
      currentBranch,
      existsSync,
    );
    return decision.allowed ? {} : denyOutput(decision.reason);
  };
}

export function lawsHooks(ctx: GuardContext, cwd: string): HookCallbackMatcher[] {
  return [
    { matcher: ['Bash', ...GUARDED_FILE_TOOLS].join('|'), hooks: [createPreToolUseHook(ctx, cwd)] },
  ];
}
