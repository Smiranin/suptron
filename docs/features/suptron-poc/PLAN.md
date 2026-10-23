# Suptron POC: Implementation Plan

**SPEC:** ./SPEC.md
**ADR:** ../../adr/0001-suptron-poc.md (primary), ../../adr/0002-assembly-editors.md (vocabulary and Check catalogue)
**Glossary:** ../../GLOSSARY.md
**Status:** draft
**Amended:** 2026-10-22 by ../missions-ui/SPEC.md: `GET /api/missions` returns every Mission known since start (terminal Missions stay until Dismiss); `DELETE /api/missions/:id` (Dismiss) added.
**Amended:** 2026-10-22 by ../missions-ui/PLAN.md: `MissionSummary` gains `taskPath`, `workItemId?` and `cost.estimated`; the transcript model (`ExecutionKey`, `TranscriptEntry`, `TranscriptSection`, `Question`) is defined; `GET /api/missions/:id` returns `MissionDetail`; every `MissionEvent` carries `seq`, with new fields on `slot.started`, `question.answered`, `mission.state`, `mission.completed` and a new `mission.dismissed`; `GET /api/events` accepts `after=` and may send `resync`; error bodies of `POST /api/missions` and `DELETE /api/missions/:id` fixed; the ledger entry is `{ summary, assembly, slots }`. Details in the sections marked "(missions-ui)".
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Scope note:** this plan covers the runtime (configuration loading, Runner, Core, Checks, Engine Adapter, GitHub host, Laws) and the local server API that a UI will consume. The UI (Missions screens) and the editors for Units, Assemblies and Project Profiles are planned separately (../assembly-editors/SPEC.md and a dedicated UI SPEC). This plan fixes the API contract they will build on.

## Summary

We build a local TypeScript application that turns a Task into a draft Pull Request by running an Assembly of Units under a Core on top of Claude Code (the Engine). The repository starts from the environment skeleton (workspace, tooling and empty packages, see the root README); no domain code exists yet.

The shape of the solution is a pnpm monorepo with one domain package and thin adapters around it:

- `packages/runtime` owns everything the product is about: the domain model, the configuration file formats, Assembly validation, the Runner (the deterministic state machine that executes a Mission), the Core client, the Check catalogue, the Laws policy and the typed event stream. It knows nothing about the Claude Agent SDK, GitHub or HTTP. It talks to the outside world only through three interfaces it defines: `Engine`, `RepoHost` and `GitClient`.
- `packages/engine-claude` implements `Engine` with `@anthropic-ai/claude-agent-sdk`. It is the only package that imports the SDK.
- `packages/host-github` implements `RepoHost` with the `gh` CLI, so the Commander's existing GitHub authentication is used (SPEC constraint).
- `apps/server` is the composition root: it loads configuration, wires the adapters into the Runner, and exposes REST commands plus a Server-Sent Events stream for a UI.

Why this shape. ADR-0001 asks for an LLM Core whose judgment is free but whose structure is locked: it can never reorder, skip or add Slots, and never declares a Mission Completed. We get that by splitting the two concerns in code. The Runner (plain code) owns the state machine: Slot order, Attempt and Loop limits, Exit Points, Completed and Needs Attention. The Core (an LLM session, one per Mission) is consulted only at four fixed points: compose a Slot's prompt from the configured context, judge an `llm_judgment` Check, explain a Needs Attention, and write the final report. ADR-0001 rejected a purely deterministic orchestrator because it cannot judge free-form situations; it rejected a free LLM because Completed must mean something. The split gives both.

The single testing seam is the `Engine` interface (together with `RepoHost`). A scripted `FakeEngine` plays every agent, including the Core, so the whole Runner is tested as a black box through its public API and event stream, against a real temporary git repository.

Decisions taken during /to-plan that the SPECs did not settle:

1. **Loop feedback is implicit.** POC FR-25 says a Slot receives earlier Slot Outputs only when named, and the editors SPEC (FR-37) forbids a context reference to a later Slot. The implementer sits before the reviewer, so it could never see the review. Resolution: when a Loop fires, the target Slot automatically receives the Slot Output of the Slot that looped plus the failed Check results, as "Loop feedback". When a Slot is re-attempted, it receives the failed Check results and the Commander's Retry note, if any. POC FR-25 was amended accordingly on 2026-10-22.
2. **Retry grants one Attempt.** From Needs Attention, Retry runs exactly one more Attempt of the current Slot, with the note. Limits are not reset. If that Attempt fails its Done Condition the Mission returns to Needs Attention.
3. **Authentication is the Commander's environment.** The SDK documents `ANTHROPIC_API_KEY` (or Bedrock/Vertex/Foundry variables); whether it picks up a claude.ai login is unverified and Anthropic's terms forbid third-party products from relying on subscription login. The application passes the process environment through untouched and never stores credentials. A startup health check reports Engine availability.
4. **The system performs no git operations.** It never creates, switches or pushes branches and never checks whether the Checkout is clean. The Project Profile's Git conventions (branch name template, Pull Request description template, labels, reviewers) are rendered with the Mission's values and handed to every Slot as part of its context; the Slot that the Assembly author chooses (typically the implementer, or a dedicated Unit) creates the branch by following its Instructions. The Commander may also start the Mission in a Checkout that is already on the right branch. POC FR-19 and the glossary entry for Mission were amended accordingly on 2026-10-22.
5. **Placeholders** for the Project Profile templates: `{work_item_id}`, `{task_slug}` and `{task_title}`. An empty `{work_item_id}` disappears together with one adjacent separator character (`-`, `_`, `/`). Rendering happens once at Mission start, into the conventions text given to Slots.
6. **No branch is ever deleted.** The Laws deny every form of branch deletion, local or remote, with no exception for the Mission's own branch. POC FR-42 and the glossary entry for Laws were amended accordingly on 2026-10-22. Pushing to or committing on the default branch and force-pushing are denied always.

## Current State

The repository holds the environment skeleton only: the pnpm workspace with `packages/runtime`, `packages/engine-claude`, `packages/host-github`, `apps/server` and `apps/web` as empty packages with their dependencies installed, TypeScript, Vitest, ESLint and Prettier configured, and the mise tasks. The project documents live in `docs/` (the glossary, the ADRs and the SPEC and PLAN of each feature). No domain code exists. The Commander's other repositories on the machine are not part of this work and must not be touched.

External facts the implementer relies on (verified 2026-10-22 against the official docs at https://code.claude.com/docs/en/agent-sdk/):

- Package `@anthropic-ai/claude-agent-sdk` (0.3.x, Node 18+) bundles the Claude Code binary as an optional dependency; `pathToClaudeCodeExecutable` is the fallback. Pin the exact version in `package.json`.
- `query({ prompt, options })` returns an async generator of `SDKMessage`. `interrupt()` is available only when `prompt` is an `AsyncIterable<SDKUserMessage>` (streaming-input mode). Every agent we start uses streaming-input mode for that reason.
- `session_id` is on the `system/init` message and on the `result` message. `options.resume: sessionId` continues a session. `persistSession` defaults to true.
- The `result` message carries `total_cost_usd`, `usage`, `modelUsage` (per model, includes subagents), `num_turns`, `duration_ms`, `structured_output`.
- `AskUserQuestion` reaches the host through `options.canUseTool`; the host answers with `{ behavior: 'allow', updatedInput: { questions, answers } }`. A tool listed in `disallowedTools` is removed from the agent.
- `options.hooks.PreToolUse` callbacks receive `tool_name` and `tool_input` and may return `{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason } }`. Hooks apply even in `bypassPermissions`.
- `permissionMode: 'bypassPermissions'` requires `allowDangerouslySkipPermissions: true`. `additionalDirectories`, `settingSources`, `env`, `cwd`, `model`, `systemPrompt` (`{ type: 'preset', preset: 'claude_code', append }` or custom string), `outputFormat: { type: 'json_schema', schema }`, `abortController` exist as named.
- `Query.supportedModels()` exists; the exact `ModelInfo` fields are unverified, read them from the package's `.d.ts`.

## Target Architecture

### Modules and Responsibilities

Repository layout (pnpm workspaces, TypeScript strict, Vitest, ESLint; Slot 26):

```
suptron/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  vitest.config.ts
  packages/
    runtime/            domain, config, validation, Runner, Core client, Checks, Laws, events, interfaces, fakes
    engine-claude/   Engine implementation on the Claude Agent SDK, hooks, PATH shim
    host-github/     RepoHost implementation on the gh CLI
  apps/
    server/          composition root, REST + SSE, Mission registry, active-missions ledger
  examples/
    suptron-home/        a complete SUPTRON_HOME with the primary-scenario Units, one Project Profile and one Assembly
  docs/
    api.md           the HTTP and SSE contract for the UI (generated section + prose)
```

`packages/runtime/src/`:

| Folder | Responsibility | Must not know about |
|---|---|---|
| `domain/` | Types for Unit, Slot, Assembly, CoreDirectives, ProjectProfile, Check, Mission, MissionState, SlotRecord, Cost. Pure types and small pure helpers. | Files, HTTP, SDK. |
| `config/` | File formats, zod schemas, loading from `SUPTRON_HOME`, Assembly validation, resolution of an Assembly + Units + Profile into a `MissionSnapshot`. | Missions, agents. |
| `laws/` | Pure `evaluateCommand()` and `evaluatePath()` policy used by the Engine hook and by the PATH shim. | How a command is intercepted. |
| `engine/` | The `Engine`, `AgentHandle`, `AgentSpec`, `AgentEvent` interfaces. No implementation. | Any concrete SDK. |
| `host/` | The `RepoHost` interface and `PullRequestRef`, `CiStatus` types. | GitHub specifics. |
| `git/` | `GitClient` interface and its real implementation on `git` subprocesses, read-only: discover Checkouts, current branch, read remote and default branch. | Hosting; it never writes to a repository. |
| `templates/` | Placeholder rendering and `slugify()`. | Everything else. |
| `checks/` | Check catalogue: one `CheckRunner` per `CheckKind`, `evaluateCondition()`. | The Runner's state machine. |
| `core-agent/` | `CoreAgent` client: four typed calls over an `AgentHandle`, structured output schemas. | Slot order, limits. |
| `runner/` | `Runner`: the state machine for one Mission; `MissionRegistry`: all active Missions, Checkout busy-ness, active-missions ledger. | SDK, gh, HTTP. |
| `events/` | `MissionEvent` union, `TypedEmitter`. | Transport. |
| `testing/` | `FakeEngine`, `FakeHost`, `tempRepo()`, config fixtures builders. Exported for other packages' tests. | Production wiring. |

`packages/engine-claude/src/`: `ClaudeEngine implements Engine`; `hooks.ts` (PreToolUse guard built from `laws`); `events.ts` (SDK message → `AgentEvent` mapping); `bin/git`, `bin/gh` (Slot shims) and `shim.ts` (installs a temp shim directory and returns the `PATH`).

`packages/host-github/src/`: `GitHubHost implements RepoHost` via `gh` subprocesses (`gh pr create --draft`, `gh pr view --json`, `gh pr checks --json`, `gh api graphql` for unresolved review threads).

`apps/server/src/`: `main.ts` (composition root), `routes/` (REST), `sse.ts`, `config-service.ts` (loads and validates `SUPTRON_HOME` on demand), `ledger.ts`.

### Relations and Data Flow

```
            apps/server (Fastify)
   REST commands │            ▲ SSE MissionEvents
                 ▼            │
       runtime/runner  MissionRegistry ── Runner (one per Mission) ── events/TypedEmitter
                 │                 │          │
    config/ (snapshot)     core-agent/CoreAgent  checks/
                 │                 │          │      \
                 ▼                 ▼          ▼       ▼
             git/GitClient    engine/Engine ◄── engine-claude      host/RepoHost ◄── host-github
                                               (Agent SDK)                          (gh CLI)
```

Dependencies point inward: `apps/server` → `runtime`, `engine-claude`, `host-github`; `engine-claude` → `runtime` (interfaces, laws); `host-github` → `runtime` (interfaces). `runtime` depends on nothing in the workspace.

One Mission, end to end:

1. `POST /api/missions` with Assembly, Task location, optional Work Item ID, Checkout and the per-Slot "may ask the Commander" toggles.
2. `MissionRegistry.start()` loads and validates configuration, builds the `MissionSnapshot` (Assembly with every Slot resolved against its Unit, plus the Profile), checks the Checkout is known and not busy, renders the Git conventions text from the Profile templates, writes the active-missions ledger and constructs a `Runner`. It does not touch the repository.
3. `Runner.run()` executes the state machine (below). For each Slot it asks `CoreAgent.composeSlotPrompt()`, starts or resumes a Pilot through `Engine.createAgent()`, forwards every `AgentEvent` as a `MissionEvent`, collects the Slot Output, evaluates the Done Condition with `checks/`, then applies Exit Point, Loop or Attempt rules.
4. Human Checkpoint: the `AgentEvent` of type `question` carries a `respond()` function. The Runner sets the state to Waiting for Commander, emits the question, and resolves `respond()` when `POST /api/missions/:id/answer` arrives. Stop while waiting denies the question with `interrupt: true`.
5. Needs Attention: the Runner interrupts the Pilot, asks `CoreAgent.explainNeedsAttention()` for a readable reason, emits it and waits for `retry(note)` or `stop()`.
6. Completed: when a done Slot is an Exit Point whose Exit Condition holds, the Runner asks `CoreAgent.finalReport()`, looks up the Pull Request for the Checkout's current branch through `RepoHost.findPullRequest()` (null when the Assembly opened none), emits `mission.completed` with the report, costs and PR link, and releases the Checkout.

The Runner state machine (states are the SPEC's Mission states; `i` is the current Slot index):

```
Running(i, attempt[i], loopCount[i])
  prompt   = compose(slot i, context, feedback)
  output   = execute slot agent (fresh: new session; persistent: resume session[i])
  done     = evaluate slot.doneCondition
  if done:
     slotOutputs[i] = output
     if slot.exitPoint and evaluate(slot.exitCondition): → Completed
     if i is last:                                       → NeedsAttention(lastExitConditionFailed)
     i = i + 1; feedback = none                          → Running
  else if slot.loop:
     loopCount[i]++ ; if loopCount[i] > slot.loop.limit  → NeedsAttention(loopLimit)
     feedback = loopFeedback(output, failedChecks); i = index(slot.loop.target) → Running
  else:
     attempt[i]++ ; if attempt[i] > slot.attemptLimit    → NeedsAttention(attemptLimit)
     feedback = attemptFeedback(failedChecks)            → Running (same i)

WaitingForCommander: entered from a question event; answer → back to Running; stop → Stopped.
NeedsAttention: retry(note) → attempt[i]++ (no limit check), feedback = note + failedChecks → Running; stop → Stopped.
Any state: stop() interrupts the agent, leaves branch/Checkout/PR untouched → Stopped.
CI timeout inside a Check → NeedsAttention(ciTimeout). Engine error → NeedsAttention(engineError).
```

Attempt counting: `attempt[i]` counts executions of Slot `i` since it was last entered through a forward move or a Loop; a Loop back to a Slot resets that Slot's `attempt` but not its `loopCount`. Loop counts are per looping Slot, for the whole Mission.

### Patterns and Technologies

- **Ports and adapters.** `runtime` defines `Engine`, `RepoHost`, `GitClient`; adapters live in their own packages. No DI container; the composition root in `apps/server/src/main.ts` passes instances by constructor.
- **Deterministic state machine, LLM at fixed points.** The Runner never asks the Core whether to retry, loop, exit or complete. It asks only for text (prompts, reasons, report) and for one boolean (an `llm_judgment` Check).
- **Snapshots.** `MissionSnapshot` is a deep-frozen plain object built at start; the Runner never reads configuration files again (FR-20).
- **Typed events, no broker.** `MissionEvent` is a discriminated union; `TypedEmitter` wraps `node:events`. The server maps the emitter to SSE. No RxJS in `runtime`.
- **Structured output for the Core.** Every Core call uses `outputFormat: { type: 'json_schema' }` with a zod schema converted with `z.toJSONSchema(schema, { target: 'draft-7' })`, so the Runner never parses free text.
- **Policy in one place.** `laws/evaluateCommand()` is used by the PreToolUse hook (first layer) and by the `git`/`gh` PATH shims (second layer). Scoped `disallowedTools` rules are not used for the Laws because they match prefixes only.
- **Subprocesses, not libraries,** for `git` and `gh`: a tiny `exec()` helper in `runtime/src/process/exec.ts` on `node:child_process` with timeout and captured output. No simple-git, no Octokit. The system's own `git` calls are read-only; all writes to a repository are made by Pilots.
- **Libraries:** `zod` (schemas), `yaml` (YAML files), `shell-quote` (command parsing in laws), `fastify` + `@fastify/cors` (server), `vitest` (tests), `tsx` (dev run), `@anthropic-ai/claude-agent-sdk` (engine-claude only).
- **Deliberately not applied:** SQLite or any database (no Mission history in scope), WebSocket (clients only receive), file watching (configuration is read on each request that needs it), a plugin system for Checks (fixed catalogue).

## Interfaces and Contracts

### Configuration files (`runtime/src/config/`)

`SUPTRON_HOME` defaults to `~/.suptron`. Layout:

```
$SUPTRON_HOME/
  hangar/<unit-name>.md
  projects/<project-name>/profile.yaml
  projects/<project-name>/assemblies/<assembly-name>.yaml
  missions/active.json              (ledger, written by the server, not configuration)
```

Names are the file basenames; a `name` field inside a file must equal the basename or the file is invalid.

Unit: Markdown with YAML frontmatter; the body has exactly two second-level sections, `## Rules` and `## Instructions`.

```md
---
name: reviewer
model: sonnet
mayAskCommander: false
doneCondition:
  - kind: command
    command: pnpm test
---
## Rules
Never edit source files. ...
## Instructions
Review the diff against the default branch ...
```

Project Profile (`profile.yaml`):

```yaml
name: my-app
repository:
  path: /absolute/path/to/main/clone
  remote: origin
  defaultBranch: main
knowledgeSources:            # paths relative to the repository root, files or folders
  - CLAUDE.md
  - docs/adr
git:                         # conventions only; rendered and given to Slots, never executed by the system
  branchNameTemplate: "feature/{work_item_id}-{task_slug}"
  pullRequestTemplate: |
    ## {task_title}
    ### Summary
    ### Testing
  labels: []                 # optional
  reviewers: []              # optional
host: github
engine: claude-code
ciWaitTimeoutMinutes: 30
```

Assembly (`assemblies/<name>.yaml`):

```yaml
name: feature
core:
  model: opus
  defaultAttemptLimit: 2
  defaultLoopLimit: 3
  instructions: |           # free text: context composition, judgment, when to go to Needs Attention, reporting
slots:
  - name: analyst
    unit: analyst
    mayAskCommander: true
  - name: implementer
    unit: implementer
    memoryMode: persistent  # default fresh
    context:
      taskDocuments: true   # default true
      knowledgeSources: true
      checkout: true
      slotOutputs: [analyst]  # earlier Slots only
  - name: reviewer
    unit: reviewer
    model: opus             # override
    instructions: |         # additional Instructions, appended to the Unit's
    doneCondition:          # override, replaces the Unit's list
      - kind: llm_judgment
        criterion: "No blocking findings remain."
    attemptLimit: 1
    loop: { target: implementer, limit: 3 }
  - name: pr-reviewer
    unit: pr-reviewer
    loop: { target: implementer, limit: 3 }
    exitPoint: true         # forced true on the last Slot
    exitCondition: []       # optional on the last Slot
```

Check (`domain/check.ts`), the fixed catalogue:

```ts
type Check =
  | { kind: 'command'; command: string; timeoutSeconds?: number }   // exit code 0 in the Checkout
  | { kind: 'ci_green' }                                             // waits up to profile.ciWaitTimeoutMinutes
  | { kind: 'pr_exists' }
  | { kind: 'pr_no_open_comments' }                                  // no unresolved review threads
  | { kind: 'llm_judgment'; criterion: string };
type Condition = Check[];                                           // all must hold
```

Validation (`config/validate-assembly.ts`) returns `{ errors: Issue[]; warnings: Issue[] }` with `Issue = { code, message, slotName? }`. Hard errors mirror the editors SPEC FR-37: unknown Unit; duplicate Slot name; Loop to itself or a later Slot; context reference to a later or missing Slot; non-last Exit Point with empty Exit Condition; no Slots; last Slot not an Exit Point (the loader sets `exitPoint: true` on the last Slot when the field is absent, and reports an error only when it is explicitly `false`). An Assembly with errors loads as `{ status: 'invalid' }` and cannot start a Mission.

`MissionSnapshot` (`config/snapshot.ts`): `{ profile: ProjectProfile; assembly: { name; core: CoreDirectives; slots: ResolvedSlot[] } }` where `ResolvedSlot` has every Unit field merged (`model`, `rules`, `instructions` = Unit's + Slot's additional, `doneCondition`, `mayAskCommander` after the Mission's toggles, `attemptLimit`, `memoryMode`, `context`, `loop?`, `exitPoint`, `exitCondition`).

### Engine port (`runtime/src/engine/`)

```ts
interface Engine {
  listModels(): Promise<ModelInfo[]>;                 // { id, displayName }
  healthCheck(): Promise<{ ok: true } | { ok: false; reason: string }>;
  createAgent(spec: AgentSpec): AgentHandle;
}

interface AgentSpec {
  role: 'pilot' | 'core';
  model: string;
  systemPrompt: { rules: string; instructions: string };   // 'pilot' appends to the Claude Code preset; 'core' is a custom prompt with no file tools
  cwd: string;                                             // the Checkout for 'pilot'; the Task folder for 'core'
  additionalDirectories: string[];                         // Task location for 'pilot'
  allowQuestions: boolean;                                 // false removes AskUserQuestion
  resumeSessionId?: string;                                // persistent Memory Mode
  guard: GuardContext;                                     // for the Laws hook and shim
  outputSchema?: JsonSchema;                               // structured output ('core' calls)
}

interface GuardContext { defaultBranch: string; checkoutPath: string; taskPath: string; configHome: string; }

interface AgentHandle {
  readonly sessionId: Promise<string>;
  send(prompt: string): void;                              // one user turn; the handle supports exactly one turn per Slot execution
  events(): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
}

type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; output: string; isError: boolean }
  | { type: 'question'; id: string; questions: Question[]; respond(answers: Record<string, string>): void; dismiss(): void }
  | { type: 'result'; output: string; structured?: unknown; cost: Cost; sessionId: string }
  | { type: 'error'; message: string };

interface Cost { usd: number; inputTokens: number; outputTokens: number; }
```

### Host and Git ports

```ts
interface RepoHost {
  createDraftPullRequest(args: { checkoutPath; branch; baseBranch; title; body; labels?; reviewers? }): Promise<PullRequestRef>;
  findPullRequest(args: { checkoutPath; branch }): Promise<PullRequestRef | null>;
  getCiStatus(pr: PullRequestRef): Promise<'pending' | 'success' | 'failure' | 'none'>;
  countUnresolvedReviewThreads(pr: PullRequestRef): Promise<number>;
}
interface PullRequestRef { number: number; url: string; }

interface GitClient {                                               // read-only by design
  listCheckouts(repositoryPath: string): Promise<Checkout[]>;      // from `git worktree list --porcelain`
  currentBranch(checkoutPath: string): Promise<string | null>;     // null when HEAD is detached
  readRemoteDefaults(repositoryPath: string): Promise<{ remoteUrl: string | null; defaultBranch: string | null }>;  // for the future Profile editor
}
interface Checkout { path: string; branch: string | null; isMainWorktree: boolean; }
```

### Core client (`runtime/src/core-agent/`)

```ts
interface CoreAgent {
  composeSlotPrompt(input: { slot: ResolvedSlot; bundle: ContextBundle; feedback?: Feedback }): Promise<string>;
  judge(input: { criterion: string; slotOutput: string; diffSummary: string }): Promise<{ holds: boolean; reason: string }>;
  explainNeedsAttention(input: { cause: NeedsAttentionCause; slot: ResolvedSlot; failedChecks: CheckResult[] }): Promise<string>;
  finalReport(input: { slots: SlotRecord[]; pr?: PullRequestRef }): Promise<string>;
}
type ContextBundle = { taskDocuments: string[]; knowledgeSources: string[]; checkoutPath: string | null; gitConventions: string; slotOutputs: { slotName: string; output: string }[] };
// gitConventions: the Profile's Git conventions rendered with the Mission's values (suggested branch name, PR description template, labels, reviewers, default branch), as text
type Feedback = { kind: 'loop'; fromSlot: string; output: string; failedChecks: CheckResult[] } | { kind: 'attempt'; failedChecks: CheckResult[]; note?: string };
```

The Core is one persistent session per Mission (`resumeSessionId`), created from `core.model` and `core.instructions`, with a system-provided preamble that states its role and its limits. Its cost is recorded under a pseudo-Slot named `core`. `ContextBundle` contains paths, not file contents: Pilots read files themselves from the Checkout and the Task location.

### Mission model and events (`runtime/src/domain/mission.ts`, `runtime/src/events/`)

```ts
type MissionState = 'running' | 'waiting_for_owner' | 'needs_attention' | 'stopped' | 'completed';
type NeedsAttentionCause = 'attempt_limit' | 'loop_limit' | 'last_exit_condition_failed' | 'ci_timeout' | 'engine_error';

interface MissionSummary { id; projectName; assemblyName; taskPath: string; workItemId?: string; state; currentSlot: string | null; branch: string | null; checkoutPath; startedAt; cost: Cost & { estimated: true }; pr?: PullRequestRef; note?: string }
// branch: the Checkout's current branch, read at start and refreshed after every Slot
interface SlotRecord { name; attempts: number; loops: number; lastOutput?: string; cost: Cost; checkResults: CheckResult[] }

// (missions-ui) every event carries seq: number, monotonic per Mission from 1; the server assigns it at emission
type MissionEvent =
  | { type: 'mission.started'; seq; mission: MissionSummary }
  | { type: 'mission.state'; missionId; seq; state: MissionState; cause?: NeedsAttentionCause; reason?: string; slot?: string; failedChecks?: CheckResult[] }   // slot on waiting_for_owner and needs_attention; failedChecks on needs_attention
  | { type: 'slot.started'; missionId; seq; slot; attempt; loopIteration?: number; loopFrom?: string; note?: string }   // loopFrom when entered through a Loop; note = the Commander's Retry note
  | { type: 'slot.done'; missionId; seq; slot; output }
  | { type: 'agent.text' | 'agent.tool_call' | 'agent.tool_result' | 'agent.error'; missionId; seq; slot; payload }
  | { type: 'check.evaluated'; missionId; seq; slot; check: Check; holds: boolean; detail: string }
  | { type: 'question.asked'; missionId; seq; slot; questionId; questions: Question[] }
  | { type: 'question.answered'; missionId; seq; slot; questionId; answers: Record<string, string> }
  | { type: 'cost.updated'; missionId; seq; slot; cost: Cost; missionTotal: Cost }
  | { type: 'mission.completed'; missionId; seq; report: string; pr: PullRequestRef | null; exitSlot: string; slots: SlotRecord[]; cost: Cost }
  | { type: 'mission.stopped'; missionId; seq; note?: 'interrupted' }
  | { type: 'mission.dismissed'; missionId; seq };                                                   // global stream only
```

Transcript model (missions-ui; `runtime/src/domain/transcript.ts`, exported from `@suptron/runtime/browser`):

```ts
interface ExecutionKey { slot: string; attempt: number; loopIteration?: number; loopFrom?: string }
// sectionTitle(key): loopFrom && attempt === 1 → "Loop {loopIteration} from {loopFrom}"; loopFrom && attempt > 1 → "… · Attempt {attempt}"; else "Attempt {attempt}"
interface Question { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }
// answers: Record<question text, string>; multiple choice joins the chosen labels with ", "; a free answer is any other string
type TranscriptEntry = { id: string; at: string } & (
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; toolCallId: string; name: string; input: unknown; result?: { output: string; isError: boolean } }
  | { kind: 'check'; check: Check; holds: boolean; detail: string }
  | { kind: 'question'; questionId: string; questions: Question[] }
  | { kind: 'answer'; questionId: string; answers: Record<string, string> }
  | { kind: 'note'; text: string }                 // the Commander's Retry note; first entry of the Attempt that received it
  | { kind: 'error'; message: string });
interface TranscriptSection { execution: ExecutionKey; entries: TranscriptEntry[]; dropped: number }

interface MissionDetail {
  summary: MissionSummary; assembly: AssemblyFile /* the document at start */; slots: SlotRecord[] /* Assembly order, then 'core' */;
  transcript: TranscriptSection[]; transcriptLost: boolean /* true for Missions recovered from the ledger */;
  pendingQuestion?: { id: string; slot: string; questions: Question[] };
  attention?: { cause: NeedsAttentionCause; reason: string; slot: string; failedChecks: CheckResult[] };
  result?: { report: string; pr: PullRequestRef | null; exitSlot: string };
  seq: number;                                     // last event applied to this detail
}
```

### HTTP and SSE contract (`apps/server`, documented in `docs/api.md`)

```
GET  /api/health                         { engine: { ok, reason? }, configHome }
GET  /api/models                         ModelInfo[]
GET  /api/units                         Unit[] (+ per-file validation issues)
GET  /api/projects                       { profile, assemblies: [{ name, status: 'valid'|'invalid', issues }] }[]
GET  /api/projects/:project/checkouts    { path, branch, busyMissionId: string | null }[]
GET  /api/missions                           MissionSummary[]                      (every Mission known since start; Completed, Stopped and interrupted stay until Dismiss)
POST /api/missions                           { project, assembly, taskPath, workItemId?, checkoutPath, mayAskCommander: Record<slotName, boolean> } → 201 MissionSummary
                                         400 { issues: { field: 'taskPath' | 'checkoutPath' | 'assembly' | 'workItemId'; message }[] }; 409 { reason: 'checkout_busy', missionId }
GET  /api/missions/:id                       MissionDetail | 404                   (missions-ui; see the transcript model above)
POST /api/missions/:id/stop                  204
POST /api/missions/:id/retry                 { note?: string } → 204           (409 unless Needs Attention)
POST /api/missions/:id/answer                { questionId, answers: Record<string,string> } → 204
DELETE /api/missions/:id                     204 | 404 | 409 { reason: 'not_finished' }   (Dismiss; Completed, Stopped and interrupted only)
GET  /api/events?mission=<id>&after=<seq>    text/event-stream of MissionEvent; replays buffered events with seq > after, then streams; sends `event: resync` first when
                                         `after` is older than the buffer. Without ?mission: every Mission's events except agent.* and check.* (including mission.dismissed)
```

Transcripts are kept in memory per Mission as `TranscriptSection`s, one per execution of a Slot: the current section in full, every earlier section trimmed to its last 200 entries with `dropped` counting what was removed. They stay until the Mission is Dismissed. SSE sends `id:` (the event's `seq`) and supports `Last-Event-ID` and `?after=` replay from the in-memory buffer.

### Laws policy (`runtime/src/laws/`)

```ts
evaluateCommand(command: string, ctx: GuardContext): { allowed: true } | { allowed: false; reason: string }
evaluatePath(path: string, mode: 'read' | 'write' | 'create', ctx: GuardContext): { allowed: boolean; reason?: string }
```

`evaluateCommand` tokenizes with `shell-quote`, splits on `&&`, `||`, `;`, `|`, and inspects every simple command whose program basename is `git` or `gh` (so `/usr/bin/git` is caught too). Deny rules:

- git: any branch deletion, without exception: `branch -D|-d|--delete`, `push --delete`/`-d`, any `:ref` refspec (empty source), `update-ref -d`, `worktree remove|prune`, `branch -m|-M` (rename removes the old name); `push` with `--force`, `-f`, `--force-with-lease`, a `+` refspec, `--mirror`; `push` whose destination ref is `ctx.defaultBranch` explicitly, or implicitly (no refspec, or `HEAD`, while the current branch is `defaultBranch`; the hook reads the current branch in `cwd` before evaluating and passes it in); `commit`, `merge`, `rebase`, `cherry-pick`, `reset`, `am` while the current branch is `defaultBranch` (a Slot that forgot to create a branch fails here, and its Done Condition fails with a readable denial); `remote set-url`/`remote remove`; `config` touching `remote.*` or `hooks*`. Creating and switching branches, committing and pushing on any other branch are allowed.
- gh: `pr ready`, `pr merge`, `pr close`, `repo edit|delete|archive|rename`, `secret *`, `variable *`, `workflow *`, `run rerun|cancel`, `release *`, `api` with a method other than GET whose path contains `/merge`, `/merges`, `/branches/*/protection`, `/actions/`, `/secrets`, `/deployments`, `/hooks`; `api` with method DELETE on any path containing `/git/refs/`; `api graphql` whose input contains `mergePullRequest`, `markPullRequestReadyForReview`, `deleteRef`, `updateRef`, `enablePullRequestAutoMerge`; `pr close --delete-branch` or `pr merge` in any form (the latter is already denied above).
- A `git`/`gh` command that cannot be tokenized is denied with reason `unparseable`.

`evaluatePath` denies any access to `ctx.configHome`, denies `write` to existing files under `ctx.taskPath` (FR-27: new files only), and denies `write`/`create` outside `ctx.checkoutPath` and `ctx.taskPath`.

The policy is enforced twice: in the Engine's PreToolUse hook for `Bash`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, and by the `git`/`gh` shims on `PATH`, which read `ctx` from environment variables (`SUPTRON_GUARD_DEFAULT_BRANCH`, `SUPTRON_GUARD_RUN_BRANCH`, `SUPTRON_GUARD_CHECKOUT`, `SUPTRON_GUARD_TASK`, `SUPTRON_GUARD_CONFIG_HOME`, `SUPTRON_REAL_GIT`, `SUPTRON_REAL_GH`) and `exec` the real binary when allowed.

## Testing Strategy

**The seam** is the `Engine` interface (with `RepoHost` beside it). `runtime/src/testing/FakeEngine` is scripted per agent: a test registers scripts keyed by `AgentSpec.role` and the Slot's name (passed through `systemPrompt.instructions` marker or an explicit `label` on the spec), and each script is a list of steps: emit text, emit a tool call and its result, run a shell command in `cwd` (to create a real commit in the temp repo), ask a question and wait for the answer, finish with an output and a cost. Core scripts return canned structured outputs. `FakeHost` keeps PR state in memory and lets the test set CI status and unresolved thread counts between steps. `tempRepo()` creates a bare "remote" plus a clone with a `main` branch and returns both paths, so `GitClient` runs real git.

A good test here reads like the SPEC: "reviewer's Done Condition fails three times, the Assembly loops to implementer each time, on the fourth failure the Mission is in Needs Attention with cause loop_limit, and the implementer was resumed with the same session id each time". Tests drive `MissionRegistry.start()` / `stop()` / `retry()` / `answer()` and assert on the collected `MissionEvent` list and on the git repository. They never inspect Runner internals.

What gets tests, and where:

- `runtime/config`: schema parsing, every validation error code, snapshot merging of Unit and Slot fields, placeholder rendering. Fixtures under `packages/runtime/test/fixtures/suptron-home/`.
- `runtime/laws`: table-driven commands and paths, allowed and denied, including obfuscated forms (`/usr/bin/git`, chained `&&`, `gh api graphql -f query=...`).
- `runtime/git`: against `tempRepo()`.
- `runtime/runner`: the scenario suite (happy path, Attempt limit, Loop limit, Loop feedback delivery, early Exit Point, last Exit Condition failing, Human Checkpoint, Stop in each state, Retry with note, persistent vs fresh Memory Mode, Slot Output visibility, cost aggregation, CI timeout, engine error, busy Checkout refused, Mission on a pre-existing branch, ledger marks interrupted Missions).
- `engine-claude`: unit tests of `events.ts` mapping on recorded SDK message fixtures and of the hook with the policy; one live smoke test (`SUPTRON_LIVE=1`) that runs a trivial agent and asserts a `result` with cost, skipped by default.
- `host-github`: unit tests with a captured `exec` asserting the exact `gh` argv and parsing recorded JSON; no live test in CI.
- `apps/server`: route tests with `fastify.inject()` and the fakes, plus one end-to-end test of the primary scenario through HTTP and SSE.

Prior art to copy from: none in this repository (it is new). The first scenario test written in Stage 6 is the template for all later Runner tests.

## Stages

### Stage 1: Repository bootstrap and domain types

- **Goal:** a green monorepo with the domain vocabulary as types.
- **Depends on:** none.
- **Touches:** root config, `packages/runtime/src/domain/`, `packages/runtime/src/events/`.
- **Steps:**
  1. Already in place from the environment skeleton: pnpm workspace, TypeScript strict `tsconfig.base.json`, Vitest projects config, ESLint, Prettier, `.editorconfig`, mise tasks, `README.md` with the glossary pointer and `SUPTRON_HOME` explanation. Check that it is green and extend it rather than recreating it.
  2. Create `packages/runtime` with `domain/` types (Unit, Slot, Assembly, CoreDirectives, ProjectProfile, Check, Condition, MissionState, MissionSummary, SlotRecord, Cost, NeedsAttentionCause), `events/MissionEvent` and `TypedEmitter`.
  3. Add `scripts`: `pnpm typecheck`, `pnpm test`, `pnpm lint` at the root running across packages.
- **Verify:** `pnpm typecheck && pnpm test && pnpm lint` pass with one trivial `TypedEmitter` test.

### Stage 2: Configuration formats, loader, validation and snapshot

- **Goal:** `SUPTRON_HOME` can be read into validated objects and resolved into a `MissionSnapshot`.
- **Depends on:** Stage 1.
- **Touches:** `packages/runtime/src/config/`, `packages/runtime/src/templates/`, `packages/runtime/test/fixtures/suptron-home/`.
- **Steps:**
  1. zod schemas for Unit frontmatter, Profile, Assembly, Check; Markdown frontmatter + `## Rules` / `## Instructions` parser for Units.
  2. `loadConfig(home)` returning units, projects, assemblies with per-file `issues`; names must equal basenames.
  3. `validateAssembly()` with the error codes listed in Interfaces; `warnings` for an unread Slot Output.
  4. `buildSnapshot(profile, assembly, units, mayAskCommanderToggles)` producing deep-frozen `MissionSnapshot` with defaults applied (attemptLimit from `core.defaultAttemptLimit`, loop limit default 3, last Slot `exitPoint: true`).
  5. `templates/render()` and `slugify()` with the placeholder rules from Summary decision 5, and `renderGitConventions(profile, missionValues)` producing the conventions text for Slots.
- **Verify:** tests for each error code and for merge precedence (Slot override beats Unit, additional Instructions are appended, Done Condition override replaces). Fixture `suptron-home` loads with zero issues.

### Stage 3: Laws policy

- **Goal:** the pure policy both enforcement layers will share.
- **Depends on:** Stage 1.
- **Touches:** `packages/runtime/src/laws/`.
- **Steps:**
  1. `evaluateCommand()` with `shell-quote` tokenization, command splitting, program basename detection, and the git/gh deny rules from Interfaces.
  2. `evaluatePath()` with the config-home, Task-folder and Checkout rules.
  3. A table-driven test file that doubles as the readable specification of the Laws.
- **Verify:** every row of the table passes; `git checkout -b feature/x` and `git push -u origin feature/x` are allowed, `git commit` and `git push` with current branch `main` are denied, `git branch -D feature/x` and `git push origin :feature/x` are denied even for a branch the Mission created, `gh pr ready 12` is denied, `gh pr view` is allowed.

### Stage 4: Ports, fakes, real GitClient

- **Goal:** the seam exists and real git operations work on a temporary repository.
- **Depends on:** Stage 2.
- **Touches:** `packages/runtime/src/engine/`, `host/`, `git/`, `process/`, `testing/`.
- **Steps:**
  1. Declare `Engine`, `AgentHandle`, `AgentSpec`, `AgentEvent`, `RepoHost`, `GitClient` exactly as in Interfaces.
  2. `process/exec.ts` with timeout, cwd, env, captured stdout/stderr.
  3. `git/GitClient` read-only implementation: `listCheckouts` via `git worktree list --porcelain`, `currentBranch` via `git rev-parse --abbrev-ref HEAD`, `readRemoteDefaults` via `git remote get-url` and `git symbolic-ref refs/remotes/<remote>/HEAD`.
  4. `testing/tempRepo()`, `testing/FakeEngine` (scripted agents, question support, cost), `testing/FakeHost`.
- **Verify:** GitClient tests on `tempRepo()`: lists the main worktree and an added worktree, reports the current branch and null on detached HEAD, reads the remote URL and default branch. FakeEngine test: a script that asks a question blocks until answered.

### Stage 5: Check catalogue and Core client

- **Goal:** every Check kind is runnable and the four Core calls are typed and schema-checked.
- **Depends on:** Stage 4.
- **Touches:** `packages/runtime/src/checks/`, `packages/runtime/src/core-agent/`.
- **Steps:**
  1. `CheckRunner` registry: `command` (exec in Checkout, exit code 0, timeout default 10 minutes), `pr_exists` and `pr_no_open_comments` via `RepoHost`, `ci_green` polling `getCiStatus` every 15 seconds until `success`, `failure` or the Profile's timeout (`failure` → check fails; timeout → special result `timedOut: true`), `llm_judgment` via `CoreAgent.judge`. `evaluateCondition()` runs Checks in order and stops at the first failure.
  2. `CoreAgent` client over `Engine.createAgent({ role: 'core', ... })`: system preamble (role, forbidden actions, output discipline) + `core.instructions`; one method per call, each with a zod output schema and `outputSchema` passed to the Engine; persistent session via the returned `sessionId`.
  3. Cost accounting helper that sums `Cost` and keeps a per-Slot and per-Mission total.
- **Verify:** tests with `FakeHost` for each host Check including timeout with fake timers; `FakeEngine` returning structured outputs for each Core call; a malformed structured output is reported as an `engine_error`.

### Stage 6: Runner: forward execution, Attempts, Loops, Exit Points

- **Goal:** a Mission executes Slots in order and reaches Completed or Needs Attention by the state machine, with events.
- **Depends on:** Stage 5.
- **Touches:** `packages/runtime/src/runner/Runner.ts`, `runner/context.ts`, `runner/feedback.ts`.
- **Steps:**
  1. `Runner` constructed with `MissionSnapshot`, `Engine`, `RepoHost`, `GitClient`, `CoreAgent`, `TypedEmitter`, Mission metadata (branch, Checkout, Task path).
  2. Context assembly (`ContextBundle` from Slot `context` settings, the rendered Git conventions and Slot Outputs) and feedback construction (Loop and Attempt).
  3. Slot execution: fresh vs persistent sessions keyed by Slot name; mapping of `AgentEvent` to `MissionEvent`; Slot Output = the `result` output; cost events.
  4. State machine transitions exactly as in Relations and Data Flow, including Attempt reset on Loop entry, Completed through Exit Points only, Needs Attention causes.
  5. Final report through `CoreAgent.finalReport()` on Completed.
- **Verify:** scenario tests: linear three-Slot Assembly completes; Done Condition failing → second Attempt with attempt feedback → Needs Attention at the limit; Loop to an earlier Slot delivers the loop feedback and resumes the persistent implementer session; early Exit Point with a holding Exit Condition skips the remaining Slots; last Slot's non-empty Exit Condition failing → Needs Attention `last_exit_condition_failed`; a Slot that names an earlier Slot Output sees it, one that does not, does not.

### Stage 7: Runner: Human Checkpoint, Stop, Retry, MissionRegistry and ledger

- **Goal:** the Commander's controls and the multi-Mission registry.
- **Depends on:** Stage 6.
- **Touches:** `packages/runtime/src/runner/MissionRegistry.ts`, `runner/ledger.ts`, `Runner.ts`.
- **Steps:**
  1. Human Checkpoint: `question` events for Slots with `mayAskCommander`; state Waiting for Commander; `answer()`; Stop while waiting dismisses the question and interrupts.
  2. `stop()` from every state: interrupt the current agent, no git or host action, emit `mission.stopped`, release the Checkout.
  3. `retry(note)` only from Needs Attention: one more Attempt with `attempt` feedback carrying the note.
  4. `MissionRegistry`: `start()` (load + validate + snapshot + Checkout known and not busy + render Git conventions + Runner), `list()`, `get()`, busy Checkout tracking, 409 conditions; `branch` in `MissionSummary` refreshed after every Slot.
  5. Ledger `missions/active.json`: `Record<missionId, { summary, assembly: AssemblyFile, slots: SlotRecord[] }>`, rewritten on start, on every `slot.started` and `slot.done` and on terminal states, removed on Dismiss; `MissionRegistry.recoverInterrupted()` at startup turns leftover entries into Stopped Missions with note `interrupted`, `currentSlot: null`, an empty transcript and `transcriptLost: true`, exposed in `GET /api/missions` until Dismissed or the server restarts again. (missions-ui)
  6. `MissionRegistry.dismiss(id)`: removes a Completed, Stopped or interrupted Mission and its ledger entry, emits `mission.dismissed`; refuses any other state. `list()` returns every Mission since start; Checkout busy-ness and the editors' `activeMissions` counts consider active states only. (missions-ui)
- **Verify:** scenario tests for each control in each state; two Missions on the same Project in two Checkouts run concurrently; a Checkout in use is refused; a Mission started on a pre-existing feature branch keeps working on it; a ledger with a stale entry yields a Stopped `interrupted` Mission.

### Stage 8: Engine Adapter on the Claude Agent SDK

- **Goal:** real agents run through the same `Engine` interface, with the Laws enforced.
- **Depends on:** Stages 3 and 4.
- **Touches:** `packages/engine-claude/`.
- **Steps:**
  1. `ClaudeEngine.createAgent()`: streaming-input `query()`; `cwd`, `model`, `additionalDirectories`; `systemPrompt` preset `claude_code` with `append` for `role: 'pilot'`, custom string for `role: 'core'`; `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true` for `slot`; `role: 'core'` gets `tools: []` (or `disallowedTools` for every built-in) and `outputFormat` when `outputSchema` is given; `settingSources: ['project']`; `resume` when `resumeSessionId` is set; `disallowedTools: ['AskUserQuestion']` when `allowQuestions` is false.
  2. `canUseTool` for `AskUserQuestion` → `question` event with `respond()`/`dismiss()`; `interrupt()` → `Query.interrupt()` plus `AbortController` fallback.
  3. `hooks.ts`: PreToolUse on `Bash` → `evaluateCommand` (with the current branch read from `git rev-parse --abbrev-ref HEAD` in `cwd` just before evaluating); on `Edit|Write|MultiEdit|NotebookEdit` → `evaluatePath`.
  4. `shim.ts` + `bin/git`, `bin/gh`: a temp directory with executable Slot scripts that call `evaluateCommand` and `exec` the real binary; `env.PATH` prepended; `SUPTRON_GUARD_*` variables set from `GuardContext`.
  5. `events.ts`: SDK messages → `AgentEvent` (text blocks, `tool_use`, `tool_result` by `tool_use_id`, `result` with `modelUsage` summed into `Cost`; `StructuredOutput` tool calls filtered out).
  6. `listModels()` via `supportedModels()` on a throwaway query; `healthCheck()` via a one-turn query with `maxTurns: 1`.
- **Verify:** unit tests on recorded message fixtures and on the hook; `SUPTRON_LIVE=1 pnpm test --filter engine-claude` runs a real agent that creates a file in a temp dir, attempts `git push --force` and is denied, and reports cost. Document the live test in the package README.

### Stage 9: GitHub host

- **Goal:** `RepoHost` on `gh`.
- **Depends on:** Stage 4.
- **Touches:** `packages/host-github/`.
- **Steps:**
  1. `createDraftPullRequest` → `gh pr create --draft --base --head --title --body-file` (+ labels, reviewers), parse the URL and number.
  2. `findPullRequest` → `gh pr view <branch> --json number,url`; `getCiStatus` → `gh pr checks --json` reduced to one status (`none` when no checks exist).
  3. `countUnresolvedReviewThreads` → `gh api graphql` on `pullRequest(number).reviewThreads(first: 100) { slots { isResolved } }` with pagination.
  4. Preflight `gh auth status` surfaced in `healthCheck()`-style method used by the server's `/api/health`.
- **Verify:** argv and parsing tests with a captured `exec`; a manual checklist in the package README for a live run against a scratch repository.

### Stage 10: Server, API and SSE

- **Goal:** everything reachable over HTTP for the UI; `docs/api.md` complete.
- **Depends on:** Stages 7, 8, 9.
- **Touches:** `apps/server/`, `docs/api.md`.
- **Steps:**
  1. `main.ts` composition root: `SUPTRON_HOME`, `ClaudeEngine`, `GitHubHost`, `GitClient`, `MissionRegistry`, `recoverInterrupted()`, Fastify on `127.0.0.1:4777` (configurable via `SUPTRON_PORT`).
  2. Routes exactly as in the contract; request bodies validated with the zod schemas from `runtime`; error mapping (400 validation, 404, 409 state conflicts).
  3. SSE endpoint with per-client filter, `seq` assigned per Mission at emission and sent as the event id, in-memory replay buffer per Mission, `Last-Event-ID` and `?after=` replay, `resync` when the requested position precedes the buffer, heartbeat comment every 15 seconds.
  4. Transcript store per Mission as `TranscriptSection`s keyed by `ExecutionKey` (opened on `slot.started`; entries from `agent.*`, `check.evaluated`, `question.asked`, `question.answered` and the Retry note; `agent.tool_result` merged into its `tool_call` by `toolCallId`; non-current sections trimmed to 200 with `dropped`). `GET /api/missions/:id` assembles `MissionDetail` from the registry, the store and the Assembly document stored at start.
  5. `docs/api.md` with the routes, the `MissionEvent` schema and a sequence diagram of a Mission.
- **Verify:** `fastify.inject()` tests with fakes for every route and conflict; an SSE test that starts a Mission and receives `mission.started` … `mission.completed` in order; `pnpm dev` starts the server and `curl` returns health and projects for `examples/suptron-home`.

### Stage 11: Primary scenario example and end-to-end run

- **Goal:** the test configuration of the SPEC exists as files and the whole system runs it.
- **Depends on:** Stage 10.
- **Touches:** `examples/suptron-home/`, `apps/server/test/e2e/`.
- **Steps:**
  1. Units: `analyst` (mayAskCommander, records answers in a new file next to the Task), `implementer` (its Instructions include: if the Checkout is on the default branch, create the branch named in the Git conventions from the fresh default branch before changing anything; commit as it goes), `reviewer`, `tester`, `publisher` (pushes the branch and opens a draft PR with `gh pr create --draft` using the PR template from the conventions; Done Condition `pr_exists`), `pr-reviewer` (comments on the PR; Done Condition `pr_no_open_comments` + `ci_green`).
  2. Profile for a placeholder repository path and the `feature` Assembly: analyst → implementer (persistent) → reviewer ⟲ implementer → tester ⟲ implementer → publisher → pr-reviewer ⟲ implementer, last Slot Exit Point.
  3. End-to-end test through HTTP with `FakeEngine` and `FakeHost` that walks the Assembly including one Loop from reviewer and one from pr-reviewer, and ends Completed with the PR link and the report.
  4. README "First Mission" section: set `SUPTRON_HOME`, copy the example, edit the repository path, start the server, call the API.
- **Verify:** the e2e test passes; `pnpm dev` with `SUPTRON_HOME=examples/suptron-home` lists the Assembly as valid and lists the Checkouts of the configured repository.

## Risks and Rollback

- **Engine authentication.** The SDK may not reuse a claude.ai login. Detect: `/api/health` shows `engine.ok = false` with the SDK's error. Back out: the Commander sets `ANTHROPIC_API_KEY` or a provider variable; no code change. Stage 8 is the first point where this bites; Stages 1 to 7 are unaffected.
- **SDK API churn.** Option names and message shapes change between 0.3.x versions. Detect: typecheck failures in `engine-claude` after an upgrade. Back out: pin the version in Stage 8; upgrade in its own commit.
- **`interrupt()` semantics.** Whether a session can continue after `interrupt()` is unverified. The design never continues an interrupted handle: Stop ends the Mission, Needs Attention + Retry starts a new handle, resuming the session id for persistent Slots. If resume after interrupt fails, Retry falls back to a fresh session and emits a warning event.
- **Laws bypass.** An agent can call a language runtime that calls git without the shimmed `PATH` (rare, since child processes inherit `PATH`) or edit `.git` internals. Detect: the hook denies writes under `.git/` and the shim logs every denial to the transcript. This is a POC floor, not a sandbox; the SPEC's Laws are still "enforced by the system" for every path the agent normally takes. Windows `.cmd` shims are out of scope.
- **Cost accuracy.** `total_cost_usd` is an estimate. Shown as such in the API (`cost.estimated: true`).
- **CI polling and rate limits.** 15-second polling for up to the Profile timeout. Detect: `gh` errors in the Check detail. Back out: the Commander raises the interval via `SUPTRON_CI_POLL_SECONDS`.
- **A Slot never creates a branch.** The Laws deny `commit` on the default branch, so the Slot's work stops at the first commit and its Done Condition fails; the Mission goes to Needs Attention with the denial in the transcript. Detect: `check.evaluated` detail mentions the Laws denial. Back out: the Commander fixes the Unit's Instructions or starts the Mission in a Checkout already on a feature branch.
- **Commander's own uncommitted changes in the Checkout.** The system does not check cleanliness (SPEC: not policed). Detect: the Slot's commits include unexpected files. Back out: the Commander's responsibility, as the SPEC states.
- **Rolling back a stage.** Every stage is one commit on `main`; `git revert` of that commit leaves the previous stage green because stages only add modules and tests until Stage 10 wires them.

## Out of Scope

- Any UI, including the Missions screens and the Units/Assemblies/Project Profile editors (separate SPECs and PLANs). This plan only fixes the API they consume.
- Writing configuration files from the server (editors will add `PUT` routes later; the validation module here is reused).
- Mission history, persistence of transcripts, metrics.
- Parallel Slots, conditional branches, pausing or resuming Stopped Missions.
- Other Engines and hosts; Bedrock/Vertex specifics beyond passing the environment through.
- Windows support for the `git`/`gh` shims; the hook layer still works there.
- Per-Mission budget limits, notifications outside the API, multi-user features.
- Creating or deleting worktrees, and any other write to a repository by the system itself (branches, commits, pushes are Pilots' work).
