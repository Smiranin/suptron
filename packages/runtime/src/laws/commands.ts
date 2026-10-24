import { parse as parseShell } from 'shell-quote';
import type { GuardContext } from '../engine/index.js';

export type Verdict = { allowed: true } | { allowed: false; reason: string };

/** The GuardContext plus the branch the Checkout is on when the command runs. */
export interface CommandContext extends GuardContext {
  currentBranch: string | null;
}

const allow: Verdict = { allowed: true };
const deny = (reason: string): Verdict => ({ allowed: false, reason });

const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '(', ')', ';;']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'nice', 'time', 'sudo', 'nohup', 'xargs']);
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

type Token = string | { op: string } | { pattern: string } | { comment: string };

/** shell-quote silently accepts an unterminated quote; such a line is not a command we can judge. */
function hasUnbalancedQuotes(command: string): boolean {
  let single = false;
  let double = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === '\\' && !single) {
      i++;
    } else if (c === "'" && !double) {
      single = !single;
    } else if (c === '"' && !single) {
      double = !double;
    }
  }
  return single || double;
}

/** Splits a shell line into simple commands (argv lists). Returns null when it cannot be tokenized. */
export function splitCommands(command: string): string[][] | null {
  if (hasUnbalancedQuotes(command)) return null;
  let tokens: Token[];
  try {
    tokens = parseShell(command) as Token[];
  } catch {
    return null;
  }
  const commands: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      current.push(token);
    } else if ('op' in token) {
      if (SEPARATORS.has(token.op)) {
        if (current.length > 0) commands.push(current);
        current = [];
      } else if (
        token.op === '>' ||
        token.op === '>>' ||
        token.op === '<' ||
        token.op === '2>' ||
        token.op === '&>'
      ) {
        // Redirection: the next token is a file, not an argument we care about.
        current.push(token.op);
      } else {
        return null;
      }
    } else if ('pattern' in token) {
      current.push(token.pattern);
    }
    // comments are dropped
  }
  if (current.length > 0) commands.push(current);
  return commands;
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** Strips env assignments and wrappers so `FOO=1 env /usr/bin/git ...` is seen as `git ...`. */
function programOf(argv: string[]): { program: string; args: string[] } | null {
  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (ENV_ASSIGNMENT.test(token)) {
      i++;
      continue;
    }
    const name = basename(token);
    if (WRAPPERS.has(name)) {
      i++;
      // skip the wrapper's own short options
      while (i < argv.length && argv[i]!.startsWith('-')) i++;
      continue;
    }
    return { program: name, args: argv.slice(i + 1) };
  }
  return null;
}

const GIT_GLOBAL_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
]);

/** Returns the git subcommand and its arguments, skipping global options such as `-C path`. */
function gitSubcommand(args: string[]): { sub: string; rest: string[] } | null {
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (!arg.startsWith('-')) return { sub: arg, rest: args.slice(i + 1) };
    const [flag] = arg.split('=');
    if (GIT_GLOBAL_WITH_VALUE.has(flag!) && !arg.includes('=')) i += 2;
    else i += 1;
  }
  return null;
}

function shortFlagsInclude(args: string[], letters: string): boolean {
  return args.some(
    (a) =>
      a.startsWith('-') && !a.startsWith('--') && [...letters].some((l) => a.slice(1).includes(l)),
  );
}

function refName(ref: string): string {
  return ref.replace(/^refs\/heads\//, '');
}

function evaluateGit(args: string[], ctx: CommandContext): Verdict {
  const parsed = gitSubcommand(args);
  if (!parsed) return allow;
  const { sub, rest } = parsed;
  const onDefault = ctx.currentBranch !== null && ctx.currentBranch === ctx.protectedBranch;

  switch (sub) {
    case 'branch': {
      if (
        rest.some((a) => ['--delete', '--move', '-D', '-d', '-M', '-m'].includes(a)) ||
        shortFlagsInclude(rest, 'dDmM')
      ) {
        return deny('The Laws forbid deleting or renaming branches (git branch -d/-D/-m/-M)');
      }
      return allow;
    }
    case 'push': {
      if (rest.some((a) => a === '--delete' || a === '-d') || shortFlagsInclude(rest, 'd')) {
        return deny('The Laws forbid deleting branches (git push --delete)');
      }
      if (
        rest.some(
          (a) =>
            a === '--force' ||
            a === '-f' ||
            a.startsWith('--force-with-lease') ||
            a === '--force-if-includes' ||
            a === '--mirror' ||
            a === '--prune' ||
            a === '--all',
        ) ||
        shortFlagsInclude(rest, 'f')
      ) {
        return deny(
          'The Laws forbid force-pushing, mirroring or pruning (git push --force/--mirror/--prune/--all)',
        );
      }
      const positional = rest.filter((a) => !a.startsWith('-'));
      // The first positional is the remote; the rest are refspecs.
      const refspecs = positional.slice(1);
      for (const spec of refspecs) {
        if (spec.startsWith('+')) return deny('The Laws forbid force-pushing (+refspec)');
        if (spec.startsWith(':')) return deny('The Laws forbid deleting branches (:ref refspec)');
        const [src, dst] = spec.split(':');
        const destination = refName(dst ?? src!);
        if (destination === ctx.protectedBranch) {
          return deny(`The Laws forbid pushing to the protected branch (${ctx.protectedBranch})`);
        }
        if (dst === undefined && src === 'HEAD' && onDefault) {
          return deny(`The Laws forbid pushing to the protected branch (${ctx.protectedBranch})`);
        }
      }
      if (refspecs.length === 0 && onDefault) {
        return deny(
          `The Laws forbid pushing to the protected branch (${ctx.protectedBranch}); create a feature branch first`,
        );
      }
      return allow;
    }
    case 'commit':
    case 'merge':
    case 'rebase':
    case 'cherry-pick':
    case 'reset':
    case 'am':
    case 'revert':
    case 'pull':
      if (onDefault) {
        return deny(
          `The Laws forbid changing the protected branch (${ctx.protectedBranch}); create a feature branch first`,
        );
      }
      return allow;
    case 'update-ref':
      if (rest.includes('-d') || rest.includes('--delete') || shortFlagsInclude(rest, 'd')) {
        return deny('The Laws forbid deleting refs (git update-ref -d)');
      }
      return allow;
    case 'symbolic-ref':
      if (rest.includes('-d') || rest.includes('--delete')) {
        return deny('The Laws forbid deleting refs (git symbolic-ref -d)');
      }
      return allow;
    case 'worktree':
      if (rest[0] === 'remove' || rest[0] === 'prune') {
        return deny('The Laws forbid removing Checkouts (git worktree remove/prune)');
      }
      return allow;
    case 'remote':
      if (['set-url', 'remove', 'rm', 'rename', 'prune'].includes(rest[0] ?? '')) {
        return deny(`The Laws forbid changing remotes (git remote ${rest[0]})`);
      }
      return allow;
    case 'config':
      if (
        rest.some(
          (a) => /^(--global|--system)$/.test(a) || /(^|\.)remote\./.test(a) || /hooks/i.test(a),
        )
      ) {
        return deny('The Laws forbid changing remote or hook settings (git config)');
      }
      return allow;
    default:
      return allow;
  }
}

const GH_PR_DENIED = new Set(['ready', 'merge', 'close', 'lock', 'unlock']);
const GH_REPO_DENIED = new Set([
  'edit',
  'delete',
  'archive',
  'unarchive',
  'rename',
  'sync',
  'set-default',
]);
const GH_GROUPS_DENIED = new Set([
  'secret',
  'variable',
  'workflow',
  'release',
  'ruleset',
  'ssh-key',
  'gpg-key',
]);
const GH_RUN_DENIED = new Set(['rerun', 'cancel', 'delete']);
const GH_API_DENIED_PATHS = [
  /\/merge(s)?(\/|$|\?)/,
  /\/branches\/[^/]+\/protection/,
  /\/actions\//,
  /\/secrets/,
  /\/deployments/,
  /\/hooks/,
];
const GH_GRAPHQL_DENIED = [
  'mergePullRequest',
  'markPullRequestReadyForReview',
  'deleteRef',
  'updateRef',
  'enablePullRequestAutoMerge',
  'closePullRequest',
  'deleteBranch',
];
const GH_API_BODY_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input']);

function ghApiMethod(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '-X' || arg === '--method') return (args[i + 1] ?? 'GET').toUpperCase();
    if (arg.startsWith('--method=')) return arg.slice('--method='.length).toUpperCase();
    if (arg.startsWith('-X') && arg.length > 2) return arg.slice(2).toUpperCase();
  }
  return args.some(
    (a) => GH_API_BODY_FLAGS.has(a) || a.startsWith('--field=') || a.startsWith('--raw-field='),
  )
    ? 'POST'
    : 'GET';
}

function evaluateGh(args: string[]): Verdict {
  const [group, sub, ...rest] = args;
  if (!group) return allow;
  if (group === 'pr' && sub && GH_PR_DENIED.has(sub)) {
    return deny(`The Laws forbid gh pr ${sub}`);
  }
  if (group === 'pr' && rest.includes('--delete-branch')) {
    return deny('The Laws forbid deleting branches (gh pr --delete-branch)');
  }
  if (group === 'repo' && sub && GH_REPO_DENIED.has(sub))
    return deny(`The Laws forbid gh repo ${sub}`);
  if (GH_GROUPS_DENIED.has(group)) return deny(`The Laws forbid gh ${group} commands`);
  if (group === 'run' && sub && GH_RUN_DENIED.has(sub))
    return deny(`The Laws forbid gh run ${sub}`);
  if (group === 'api') {
    const apiArgs = args.slice(1);
    const joined = apiArgs.join(' ');
    if (apiArgs[0] === 'graphql' || apiArgs.includes('graphql')) {
      const hit = GH_GRAPHQL_DENIED.find((m) => joined.includes(m));
      if (hit) return deny(`The Laws forbid the GraphQL mutation ${hit}`);
      return allow;
    }
    const method = ghApiMethod(apiArgs);
    const path =
      apiArgs.find(
        (a, i) =>
          !a.startsWith('-') &&
          !(
            i > 0 &&
            (apiArgs[i - 1] === '-X' ||
              apiArgs[i - 1] === '--method' ||
              GH_API_BODY_FLAGS.has(apiArgs[i - 1]!))
          ),
      ) ?? '';
    if (method === 'DELETE' && path.includes('/git/refs/')) {
      return deny('The Laws forbid deleting refs through the API');
    }
    if (method !== 'GET' && GH_API_DENIED_PATHS.some((re) => re.test(path))) {
      return deny(`The Laws forbid ${method} on ${path}`);
    }
  }
  return allow;
}

/**
 * Evaluates one shell command line against the Laws: every simple command whose program is
 * `git` or `gh` (by basename, so `/usr/bin/git` counts) is inspected; anything else is allowed.
 */
export function evaluateCommand(command: string, ctx: CommandContext): Verdict {
  const commands = splitCommands(command);
  if (commands === null) {
    return /\bg(it|h)\b/.test(command) ? deny('unparseable') : allow;
  }
  for (const argv of commands) {
    const parsed = programOf(argv);
    if (!parsed) continue;
    if (parsed.program === 'git') {
      const verdict = evaluateGit(parsed.args, ctx);
      if (!verdict.allowed) return verdict;
    } else if (parsed.program === 'gh') {
      const verdict = evaluateGh(parsed.args);
      if (!verdict.allowed) return verdict;
    }
  }
  return allow;
}
