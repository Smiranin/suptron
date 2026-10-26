# Workspaces: Implementation Plan

**SPEC:** ./SPEC.md
**ADRs:** ../../adr/0005-workspaces.md (primary), ../../adr/0001-suptron-poc.md (the runtime), ../../adr/0004-robot-vocabulary.md (naming)
**Runtime plan:** ../suptron-poc/PLAN.md (configuration formats, Laws, HTTP contract; read it first)
**Editors plan:** ../assembly-editors/PLAN.md (`apps/web`, forms, the fake server)
**Missions plan:** ../missions-ui/PLAN.md (Start Mission dialog, Mission page, stores)
**Glossary:** ../../GLOSSARY.md
**API:** ../../api.md
**Status:** implemented (2026-10-26; the stages were applied in one pass, the expand → contract steps of Stages 2 and 6 collapsed)
**Scope note:** this plan replaces the assumption "every Project is a git repository" with one Workspace interface of three kinds (`none`, `folder`, `repository`), changes the Project Profile file format accordingly, makes Checks and context sources declare the capabilities they need, and adapts the server and the web screens. It assumes the three earlier plans are implemented in full. There is no backward compatibility for the Profile format.

## Summary

Today the runtime, the server and the web app all read `profile.repository` and `checkoutPath` directly: the Runner sets the Engine's working directory to the Checkout, the Checks diff against the protected branch, the Laws know one write root, the Start Mission dialog always asks for a Checkout. ADR-0005 decided that the Project Profile declares a **Workspace** of one kind and that everything else is derived. This plan implements that in four moves:

- **One interface, three classes.** `packages/runtime/src/workspace/` gains a `Workspace` interface and three implementations, `NoneWorkspace`, `FolderWorkspace`, `RepositoryWorkspace`, created by one function `openWorkspace(profile, missionInput, deps)` at Mission start. The Runner, the Check runners, the context bundle, the Laws and the report composition ask the instance (`cwd`, `writeRoots`, `busyKey`, `fragment`, `changeSummary()`, `pullRequest()`, `refresh()`) and never look at the kind. Polymorphism replaces every `if (repository)` the optional-fields design would have needed (NFR-1).
- **Capabilities, declared by the system.** Each Check descriptor in the catalogue and each context source carries a `requires` list over `'files' | 'git' | 'host'`; `capabilitiesOf(profile.workspace)` is the one pure function that maps a kind to what it provides. `validateAssembly` takes the Project's capabilities as a third argument, so the loader, the server's PUT and the editor all reject what the Project cannot run, and the editor simply does not offer it.
- **The Mission folder is universal.** `missions/<id>/` is created for every Mission before the Workspace is opened; for kind `none` it is the Engine's working directory. It is removed on Dismiss, as today.
- **Expand, migrate, contract where the change fans out.** The Profile format flip touches every package, so the plan first moves the runtime, the server and the web app onto the Workspace interface and onto `MissionSummary.workspace` while the Profile still has one kind, then flips the format in one stage, then adds the `none` and `folder` behaviour and screens. Each stage leaves `mise run check` green.

Decisions taken during /to-plan that the SPEC did not settle:

1. **The `checkout` context source is removed; the Workspace fragment is always in the bundle.** `DEFAULTS.slot.context.checkout` is `true` today, so under SPEC FR-6 every hand-written Assembly of a `none` Project would be invalid by default. Instead the Core receives the Workspace fragment of FR-15 for every Slot (the Checkout path and branch for `repository`, the folder path, or the Mission folder) and the only git-dependent context source left is `gitConventions`. SPEC FR-6, FR-15 and editors FR-33 are amended in Stage 7.
2. **Busy is one rule over one key.** Every Workspace instance exposes `busyKey: string | null` (the realpath of the Checkout, the realpath of the folder, `null` for `none`); the registry refuses a start when an active Mission has the same key. FR-10 follows without the registry knowing kinds.
3. **`MissionSummary.workspace` replaces `branch` and `checkoutPath`** as `{ kind, path: string | null, branch: string | null }`. The two display rules of FR-18 and FR-19 read it; the list row shows `branch ?? path`, the header shows `path` and ` @ branch` when present, the Completed view shows the Pull Request, else `path`, else the Task location. The old fields are kept populated during Stage 2 and removed in Stage 6 (expand → contract).
4. **The Laws take write roots.** `GuardContext` becomes `{ cwd, writeRoots, protectedBranch: string | null, taskPath, configHome }`; `evaluatePath` resolves relative paths against `cwd`, allows writes inside any write root or the Task location, and denies writes into any `.git` directory under a write root. The protected-branch rules of `evaluateCommand` apply only when `protectedBranch` is not null. The shim environment follows (`SUPTRON_GUARD_WRITE_ROOTS`, `SUPTRON_GUARD_CWD`).
5. **The Start request keeps a flat optional `checkoutPath`.** `openWorkspace` is the one place that requires it for `repository` and rejects it for the other kinds, reporting `field: 'checkoutPath'`. `409 checkout_busy` becomes `409 workspace_busy`.
6. **Knowledge Sources reach the Core as references.** `ContextBundle.knowledgeSources` becomes a list of `{ kind: 'path', path, title? } | { kind: 'text', text, title? }`; a relative path is resolved against `workspace.cwd` by the registry; the Core's prompt formatter prints a text source under its title.
7. **The example home gains a `research` Project of kind `none`** with two new Units (`researcher`, `brief-writer`) and one Assembly `brief`; the `examples.test.ts` assertion "units equal `primaryUnits()`" becomes "contains `primaryUnits()` and `briefUnits()`".

## Current State

Facts an implementer starts from (paths relative to the repository root):

- **Profile.** `packages/runtime/src/config/schemas.ts` `profileFileSchema` requires `repository: { path, remote, protectedBranch }`, `knowledgeSources: string[]`, `git: { branchNameTemplate, pullRequestTemplate, labels, reviewers }`, `host: 'github'`, `engine: 'claude-code'`, `ciWaitTimeoutMinutes`. `defaults.ts` `DEFAULTS.profile`, `serialize.ts` `serializeProfile` and `testing/primary-scenario.ts` `primaryProfile(repositoryPath)` mirror it. `examples/suptron-home/projects/my-app/profile.yaml` is the only example; `test/examples.test.ts` asserts `profile.repository.path`.
- **Validation.** `config/validate-assembly.ts` `validateAssembly(assembly, units): ValidationResult` knows nothing about the Project. `config/load.ts` `loadProject` loads the Profile and the Assemblies independently and calls `parseAssemblyText(name, text, unitNames)`. Callers: `load.ts`, `apps/server/src/routes/projects.ts` (PUT), `apps/web/src/features/assembly-editor/model/validate.ts`, `apps/web/test/fake-server.ts`.
- **Checks.** `checks/catalogue.ts` `CHECK_CATALOGUE: CheckDescriptor[]` (`kind`, `label`, `description`, `params`, `summarize`), no capability field. `checks/runners.ts` `CheckContext { checkoutPath, protectedBranch, host, git, core, slotOutput, ciWaitTimeoutMs, ... }`; `command` runs in `checkoutPath`, `pr_*`/`ci_green` go through `currentPullRequest(ctx)` (`git.currentBranch` + `host.findPullRequest`), `llm_judgment` calls `git.diffSummary(checkoutPath, protectedBranch)` then `core.judge({ criterion, slotOutput, diffSummary })`.
- **Runner.** `runner/runner.ts` `MissionMeta { ..., checkoutPath, configHome, gitConventions, branch }`, `RunnerDeps { engine, host, git, core, emit, ci* }`; `executeSlot` creates the Pilot with `cwd: meta.checkoutPath`, `additionalDirectories: [meta.taskPath]`, `guard: this.guard()`; `refreshBranch()` after every Slot; `complete()` looks up the Pull Request by branch; `summary.branch` and `summary.checkoutPath` come from `MissionSummary` (`domain/mission.ts`). `runner/context.ts` `buildContextBundle(slot, snapshot, locations, slotOutputs)` resolves relative Knowledge Sources against `profile.repository.path` and emits `checkoutPath` and `gitConventions` when the Slot asks. `core-agent/index.ts` `ContextBundle { taskDocuments, knowledgeSources: string[], checkoutPath, gitConventions, slotOutputs }`, `CoreAgent.judge({ criterion, slotOutput, diffSummary })`, `finalReport({ slots, pr? })`.
- **Registry.** `runner/mission-registry.ts` `StartMissionInput.checkoutPath: string` required; `start()` validates the Checkout with `git.listCheckouts(profile.repository.path)`, `isCheckoutBusy(path)`, stores a text Task with `storeTaskText(home, id, text)` (only text Tasks get `missions/<id>/`), renders Git conventions, builds the Core's guard `{ protectedBranch, checkoutPath, taskPath, configHome }`, creates the Runner. `listCheckouts(project)` adds `busyMissionId`. `dismiss()` always calls `removeMissionFolder`. `CheckoutBusyError`.
- **Laws.** `laws/paths.ts` `evaluatePath(path, mode, ctx: GuardContext)` resolves relative paths against `ctx.checkoutPath`, allows create (not write) under `taskPath`, denies `configHome`, denies writes outside `checkoutPath`, denies the Checkout's `.git` internals; the Task-location rule runs before the `configHome` rule, which is what lets a text Task inside `SUPTRON_HOME/missions/<id>` work. `laws/commands.ts` `evaluateCommand(command, ctx: CommandContext)` uses `protectedBranch` and `currentBranch`. `GuardContext` lives in `engine/index.ts`. `packages/engine-claude/src/hooks.ts` (`decideToolUse`, `lawsHooks`) and `shim.ts` (`guardEnv`: `SUPTRON_GUARD_PROTECTED_BRANCH`, `SUPTRON_GUARD_CHECKOUT`, `SUPTRON_GUARD_TASK`, `SUPTRON_GUARD_CONFIG_HOME`) and `shim-main.ts` (active when protected branch and checkout are both set) wire it.
- **Server.** `apps/server/src/routes/missions.ts` `startSchema.checkoutPath` required, `CheckoutBusyError → 409 checkout_busy`; `routes/projects.ts` `GET /api/projects/:project/checkouts` through `registry.listCheckouts`, PUT Assembly calls `validateAssembly(assembly, units)`; `routes/tools.ts` `GET /api/git/remote-defaults`. `apps/server/test/helpers.ts` `testServer()` writes `primaryProfile(repo.clonePath)` into a temp home and uses `FakeEngine`, `FakeHost`, `RealGitClient`.
- **Web.** `apps/web/src/features/projects/ProfileForm.tsx` (react-hook-form + `zodResolver(profileFileSchema)`, fields `repository.*`, `knowledgeSources` as `PathField` rows with `base = repository.path`, git defaults through `useRemoteDefaults`), `ProjectPage.tsx`, `NewProjectDialog.tsx`, `ProjectsPage.tsx` (subtitle `profile.repository.path`, Launch per valid Assembly). `src/components/check-list-editor.tsx` lists the whole `CHECK_CATALOGUE`; `assembly-editor/inspector/Inspector.tsx` Context tab hard-codes `taskDocuments`, `knowledgeSources`, `checkout`, `gitConventions`; `AssemblyEditorPage.tsx` does not load the Project. `missions/start/StartMissionDialog.tsx` always renders `CheckoutSelect` and requires a Checkout in `canStart`; `useStartMissionPrefill.ts` stores `{ checkoutPath, taskPath }`; `page/MissionHeader.tsx` prints `checkoutPath @ branch` and the Pull Request link; `list/MissionsListPage.tsx` `MissionRow` prints `branch`; `panel/MissionLevelView.tsx` prints the Pull Request or "No Pull Request was opened." `test/fake-server.ts` `FakeHome.primary()`, `test/fixtures/primary.ts`, `test/fixtures/missions/index.ts`.

## Target Architecture

### Modules and Responsibilities

**`packages/runtime/src/workspace/`** (new)

- `kinds.ts` (browser-safe, re-exported from `browser.ts`): `WorkspaceKind`, `Capability`, `WORKSPACE_KINDS` (kind, label, description, for the Profile form and the Projects page), `capabilitiesOf(workspace: WorkspaceFile): ReadonlySet<Capability>`, `CONTEXT_SOURCE_REQUIREMENTS`, `missingCapabilities(required, provided)`. Owns the kind → capabilities mapping and nothing else.
- `workspace.ts`: the `Workspace` interface, `WorkspaceSummary`, `RepositoryFacet`, `HostFacet`, `WorkspaceOpenError`.
- `open.ts` (node): `openWorkspace(profile, input, deps)`: validates the input for the Profile's kind, creates one of the three classes, and is the only place in the runtime that switches on `profile.workspace.kind` (NFR-1). `buildGuard(workspace, { taskPath, configHome }): GuardContext`.
- `none.ts`, `folder.ts`, `repository.ts`: one class each. `RepositoryWorkspace` owns the Git conventions rendering (via `templates/`), the branch refresh, the diff summary, the Pull Request lookup and the host facet; `FolderWorkspace` owns the folder path and nothing git; `NoneWorkspace` owns the Mission folder as working directory.

**`packages/runtime/src/config/`**: `schemas.ts` gains `workspaceFileSchema` (discriminated union, strict objects), `knowledgeSourceSchema` (path or text), a reshaped `profileFileSchema` with a `superRefine` that rejects a relative path for kind `none`; `slotContextSchema` loses `checkout`. `defaults.ts`, `serialize.ts`, `snapshot.ts` (`ResolvedContext` without `checkout`) follow. `validate-assembly.ts` takes capabilities. `load.ts` loads the Profile first and validates the Assemblies against it.

**`packages/runtime/src/checks/`**: `catalogue.ts` adds `requires: readonly Capability[]` per descriptor. `runners.ts` `CheckContext` carries `workspace: Workspace` instead of `checkoutPath`, `protectedBranch`, `host`, `git`, `ciWaitTimeoutMs`.

**`packages/runtime/src/runner/`**: `runner.ts` receives the `Workspace` in `RunnerDeps`, drops `host` and `git`; `context.ts` resolves Knowledge Source references and emits the Workspace fragment; `mission-registry.ts` creates the Mission folder, opens the Workspace, applies the busy rule over `busyKey`; `task.ts` gains `createMissionFolder(home, id)`.

**`packages/runtime/src/laws/`** and **`packages/engine-claude/src/`**: `GuardContext` with write roots; `hooks.ts`, `shim.ts`, `shim-main.ts` carry the new fields.

**`packages/runtime/src/core-agent/`**: `ContextBundle.workspace: string` (the fragment), `knowledgeSources: KnowledgeSourceRef[]`, `judge` accepts `diffSummary: string | null`, `finalReport` receives `workspace: string` so the report says where the result is.

**`apps/server`**: routes adapt to the optional `checkoutPath`, `WorkspaceBusyError`, capabilities in Assembly PUT, `404` for Checkouts of a Project without git. No new modules.

**`apps/web`**: `features/projects/ProfileForm.tsx` becomes kind-first with one section component per kind (`workspace/NoneFields`, `FolderFields`, `RepositoryFields` under `features/projects/workspace/`) and a `KnowledgeSourcesField` of path-or-text rows; `features/assembly-editor` receives capabilities; `features/missions` reads `summary.workspace` and shows the Checkout select by capability. The web app switches on `kind` only inside the Profile form (which section to render) and the Projects page badge.

### Relations and Data Flow

```
Profile file ──parse──▶ ProfileFile ──capabilitiesOf──▶ Set<Capability> ──▶ validateAssembly (loader, server PUT, editor)
                                   │
          Start request ───────────┼──▶ openWorkspace(profile, { missionDir, checkoutPath? }, { git, host })
                                   │              │
                                   ▼              ▼
                             MissionRegistry ◀── Workspace { cwd, writeRoots, busyKey, fragment, summary, protectedBranch,
                                   │                         gitConventions(values), knowledgeRoot, refresh(), changeSummary(), pullRequest() }
                                   ▼                       ▲          ▲              ▲
                                 Runner ── Pilot spec ─────┘          │              │
                                   ├── buildContextBundle ────────────┘              │
                                   ├── evaluate(Checks) ── CheckContext.workspace ───┘
                                   └── complete() ── workspace.pullRequest(), core.finalReport({ ..., workspace })
```

Direction of dependencies: `workspace/` depends on `git/`, `host/`, `templates/`, `config/schemas`; `runner/` and `checks/` depend on `workspace/`; nothing depends on the three classes except `open.ts`. `kinds.ts` has no node imports and is the only part the web app sees.

### Patterns and Technologies

- **Discriminated union in the file, polymorphism in the runtime.** The Profile is a zod discriminated union on `workspace.kind`; the runtime instance is an interface with three classes. The single switch is `openWorkspace`.
- **Capabilities as data.** `requires` on descriptors and the `CONTEXT_SOURCE_REQUIREMENTS` table are plain arrays, so the editor filters and the validator checks with the same data.
- **Expand → migrate → contract** for `MissionSummary` (Stage 2 adds `workspace`, Stage 6 removes `branch` and `checkoutPath`) and for the Profile format (Stages 1 to 3 prepare consumers, Stage 4 flips).
- **No new fakes.** `FakeEngine`, `FakeHost`, `RealGitClient` with `tempRepo()`, and a plain `mkdtemp` folder for `folder` and `none`.
- Libraries unchanged: zod v4, react-hook-form with `zodResolver`, msw, Vitest.

## Interfaces and Contracts

### Profile file (`packages/runtime/src/config/schemas.ts`)

```yaml
name: my-app
workspace:
  kind: repository                      # none | folder | repository
  path: /absolute/path/to/your/repository
  remote: origin                        # default
  protectedBranch: main                 # default
  host: github                          # github | none, default github
  git:
    branchNameTemplate: feature/{work_item_id}-{task_slug}
    pullRequestTemplate: |
      ...
    labels: []
    reviewers: []
  ciWaitTimeoutMinutes: 30              # default
knowledgeSources:
  - path: README.md                     # relative: resolved against the Workspace root; invalid for kind none
  - path: /Users/me/Docs/conventions.md
  - title: House style
    text: |
      ...
engine: claude-code
```

```ts
export const workspaceFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('folder'), path: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('repository'),
    path: z.string().min(1),
    remote: z.string().min(1).default('origin'),
    protectedBranch: z.string().min(1).default('main'),
    host: z.enum(['github', 'none']).default('github'),
    git: z.object({ branchNameTemplate: z.string().min(1), pullRequestTemplate: z.string().default(''), labels: z.array(z.string()).default([]), reviewers: z.array(z.string()).default([]) }),
    ciWaitTimeoutMinutes: z.number().int().positive().default(30),
  }),
]);
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;
export const knowledgeSourceSchema = z.union([
  z.strictObject({ path: z.string().min(1), title: z.string().optional() }),
  z.strictObject({ text: z.string().min(1), title: z.string().optional() }),
]);
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export const profileFileSchema = z.object({ name: nameSchema, workspace: workspaceFileSchema, knowledgeSources: z.array(knowledgeSourceSchema).default([]), engine: z.literal('claude-code').default('claude-code') })
  .superRefine(/* relative path with kind none → issue code 'relative_path_without_workspace' at ['knowledgeSources', i, 'path'] */);
```

Existence of `path` is not a schema concern (the schema runs in the browser): the Profile form checks it with `PathField`, `openWorkspace` checks it at Mission start. `slotContextSchema` becomes `{ taskDocuments?, knowledgeSources?, gitConventions?, slotOutputs? }`; `DEFAULTS.slot.context` loses `checkout`; `serializeProfile` writes `workspace` with defaults omitted and Knowledge Sources as objects.

### Capabilities (`packages/runtime/src/workspace/kinds.ts`, browser-safe)

```ts
export type WorkspaceKind = 'none' | 'folder' | 'repository';
export type Capability = 'files' | 'git' | 'host';
export const WORKSPACE_KINDS: readonly { kind: WorkspaceKind; label: string; description: string }[];
export function capabilitiesOf(workspace: WorkspaceFile): ReadonlySet<Capability>;   // none → {}, folder → {files}, repository → {files, git} + host when host !== 'none'
export type ContextSource = 'taskDocuments' | 'knowledgeSources' | 'gitConventions' | 'slotOutputs';
export const CONTEXT_SOURCE_REQUIREMENTS: Readonly<Record<ContextSource, readonly Capability[]>>;   // gitConventions: ['git'], the rest []
export function missingCapabilities(required: readonly Capability[], provided: ReadonlySet<Capability>): Capability[];
```

`CheckDescriptor` (`checks/catalogue.ts`) gains `requires: readonly Capability[]`: `command` and `llm_judgment` `[]`, `pr_exists`, `pr_no_open_comments`, `ci_green` `['host']`.

### Validation (`packages/runtime/src/config/validate-assembly.ts`)

```ts
export function validateAssembly(
  assembly: AssemblyFile,
  units: readonly Pick<{ name: string }, 'name'>[],
  capabilities: ReadonlySet<Capability> | null,   // null: the Profile is invalid, capability rules are skipped
): ValidationResult;
```

New error codes: `check_unavailable` (`slotName`, `path: 'doneCondition[i]' | 'exitCondition[i]'`, message `Slot "reviewer" uses the Check "Pull Request exists", which needs a host this Project's Workspace does not provide`), `context_source_unavailable` (`slotName`, `path: 'context.gitConventions'`). `parseAssemblyText(name, text, unitNames, capabilities)` and `loadAssembly(path, unitNames, capabilities)` take the same argument; `loadProject` parses the Profile first and passes `profile ? capabilitiesOf(profile.workspace) : null`. A Unit's default Done Condition is not validated here (FR-8); the placed Slot's resolved Done Condition is, so `validateAssembly` must look at `slot.doneCondition ?? unit.doneCondition`, which means `units` grows to `Pick<UnitFile, 'name' | 'doneCondition'>[]` for every caller (`load.ts`, server PUT, web `validate.ts`, fake server).

### Workspace instance (`packages/runtime/src/workspace/workspace.ts`)

```ts
export interface WorkspaceSummary { kind: WorkspaceKind; path: string | null; branch: string | null }
export interface HostFacet {
  ciWaitTimeoutMs: number;
  findPullRequest(): Promise<PullRequestRef | null>;          // for the current branch; null when detached
  ciStatus(pr: PullRequestRef): Promise<CiStatus>;
  unresolvedThreads(pr: PullRequestRef): Promise<number>;
}
export interface RepositoryFacet { checkoutPath: string; protectedBranch: string; currentBranch(): Promise<string | null> }
export interface Workspace {
  readonly kind: WorkspaceKind;
  readonly capabilities: ReadonlySet<Capability>;
  readonly cwd: string;                      // the Engine's working directory (FR-12)
  readonly writeRoots: readonly string[];    // the Laws allow writes here, plus the Task location (FR-13)
  readonly protectedBranch: string | null;   // for the Laws on commands
  readonly busyKey: string | null;           // FR-10
  readonly fragment: string;                 // FR-15, always in the Core's bundle
  readonly summary: WorkspaceSummary;        // FR-18; refreshed by refresh()
  readonly repository: RepositoryFacet | null;
  readonly host: HostFacet | null;
  gitConventions(values: MissionValues): string | null;   // rendered conventions for repository, null otherwise
  refresh(): Promise<void>;                  // re-reads the branch; no-op otherwise
  changeSummary(): Promise<string | null>;   // FR-14: diff against the protected branch, null otherwise
  pullRequest(): Promise<PullRequestRef | null>;   // FR-16: via the host facet, null otherwise or on error
}
export interface OpenWorkspaceInput { missionDir: string; checkoutPath?: string }
export interface OpenWorkspaceDeps { git: GitClient; host: RepoHost }
export class WorkspaceOpenError extends Error { issues: { field: 'checkoutPath'; message: string }[] }
export function openWorkspace(profile: ProfileFile, input: OpenWorkspaceInput, deps: OpenWorkspaceDeps): Promise<Workspace>;
export function buildGuard(workspace: Workspace, locations: { cwd?: string; taskPath: string; configHome: string }): GuardContext;
```

Per kind: `NoneWorkspace` (`cwd = writeRoots[0] = missionDir`, `busyKey = null`, `summary.path = null`, fragment "No Workspace. The working directory is the Mission folder <dir>; write results next to the Task."), `FolderWorkspace` (`cwd = path`, must be an existing directory, `busyKey = realpath(path)`, `summary.path = path`), `RepositoryWorkspace` (requires `checkoutPath` among `git.listCheckouts(path)` matched by realpath, `cwd = checkoutPath`, `busyKey = realpath(checkoutPath)`, `summary = { path: checkoutPath, branch }`, `repository` facet, `host` facet when `host === 'github'`, fragment lists Checkout, branch and protected branch). `openWorkspace` reports a `checkoutPath` given to a non-repository kind as `WorkspaceOpenError` ("This Project has no Checkouts").

### Laws (`packages/runtime/src/engine/index.ts`, `laws/`)

```ts
export interface GuardContext { cwd: string; writeRoots: readonly string[]; protectedBranch: string | null; taskPath: string; configHome: string }
```

`evaluatePath`: resolve relative against `cwd`; inside `taskPath` → create allowed, write denied; inside a write root → allowed unless a path segment is `.git`; inside `configHome` otherwise → denied; write/create elsewhere → denied; reads elsewhere → allowed. The Task rule and the write-root rule run before the `configHome` rule, because the Mission folder is inside `configHome`. `evaluateCommand`: the protected-branch rules are skipped when `ctx.protectedBranch === null`; every other rule is unchanged. Shim environment: `SUPTRON_GUARD_CWD`, `SUPTRON_GUARD_WRITE_ROOTS` (joined with `path.delimiter`), `SUPTRON_GUARD_PROTECTED_BRANCH` (empty string for null), `SUPTRON_GUARD_TASK`, `SUPTRON_GUARD_CONFIG_HOME`; `shim-main.ts` is active when `SUPTRON_GUARD_CONFIG_HOME` is set.

### Runner, Checks, Core

```ts
// runner/runner.ts
export interface MissionMeta { id; projectName; assemblyName; taskPath; taskTitle; taskDocuments: string[]; workItemId?; configHome; gitConventions: string | null; knowledgeSources: KnowledgeSourceRef[]; startedAt }
export interface RunnerDeps { engine: Engine; workspace: Workspace; core: CoreAgent; emit; ciPollIntervalMs?; ciNoneGraceMs?; ciWaitTimeoutMs? }
// checks/runners.ts
export interface CheckContext { workspace: Workspace; core: CoreAgent; slotOutput: string; ciPollIntervalMs?; ciNoneGraceMs?; ciWaitTimeoutMs?; commandTimeoutMs?; signal?; exec? }
// core-agent/index.ts
export type KnowledgeSourceRef = { kind: 'path'; path: string; title?: string } | { kind: 'text'; text: string; title?: string };
export interface ContextBundle { taskDocuments: string[]; knowledgeSources: KnowledgeSourceRef[]; workspace: string; gitConventions: string | null; slotOutputs: { slotName: string; output: string }[] }
judge(input: { criterion: string; slotOutput: string; diffSummary: string | null }): Promise<{ holds: boolean; reason: string }>;
finalReport(input: { slots: SlotRecord[]; pr?: PullRequestRef | null; workspace: string }): Promise<string>;
```

The `pr_*` and `ci_green` runners call a private `requireHost(ctx)` that returns `ctx.workspace.host` or fails the Check with `detail: 'This Workspace has no host'` (validation makes this unreachable; the runner stays total). `command` runs in `ctx.workspace.cwd`. The Runner's `refreshBranch()` becomes `await workspace.refresh(); summary.workspace = workspace.summary`.

### Mission model (`packages/runtime/src/domain/mission.ts`)

```ts
export interface MissionSummary { id; projectName; assemblyName; taskPath; taskTitle; workItemId?; state; currentSlot; workspace: WorkspaceSummary; startedAt; cost; pr?; note? }
```

`branch` and `checkoutPath` exist alongside `workspace` after Stage 2 and are removed in Stage 6. `MissionResult` and `mission.completed` keep `pr`.

### Registry and HTTP

```ts
// runner/mission-registry.ts
export interface StartMissionInput { project; assembly; task: MissionTask; workItemId?; checkoutPath?: string; mayAskCommander? }
export class WorkspaceBusyError extends Error { constructor(public missionId: string) }
listCheckouts(project: string): Promise<CheckoutStatus[] | null>;   // null when the Project's Workspace has no git capability
```

`start()` order: config and Task validation as today → `id` → `createMissionFolder(home, id)` → `storeTaskText` for a text Task (into that folder) → `openWorkspace` (its issues join `MissionStartError`; the folder is removed on any start failure) → busy check over `busyKey` → snapshot, Core, Runner as today with `buildGuard`.

HTTP (`docs/api.md` amendments, Stage 7):

```
POST /api/missions                 { project, assembly, task, workItemId?, checkoutPath?, mayAskCommander? }
                                   400 issues as today; 409 { reason: 'workspace_busy', missionId }
GET  /api/projects/:project/checkouts   ... | 404 { reason: 'not_found', message: 'This Project has no Checkouts' }
MissionSummary.workspace: { kind, path, branch }   (replaces branch and checkoutPath)
ProfileFile: workspace, knowledgeSources as objects, engine
```

### Web

- `apps/web/src/features/projects/ProfileForm.tsx`: a `Select` "Project type" (aria-label `Project type`) bound to `workspace.kind`; `WorkspaceFields` renders `NoneFields | FolderFields | RepositoryFields` by `kind` (this is the permitted switch); `useProfileForm` keeps the zod resolver; `usePathStatuses` keys become `'workspace'` and `` `knowledgeSource:${i}` ``; `emptyWorkspace(kind): WorkspaceFile` provides defaults when the kind changes; changing the kind of an existing Project opens an `AlertDialog` ("The fields of the <old> type are dropped") before `form.setValue('workspace', emptyWorkspace(kind), { shouldDirty: true })`; the git defaults effect and the "Read from git" button render only inside `RepositoryFields`.
- `KnowledgeSourcesField`: rows with a `Select` (aria-label `Knowledge Source N type`: Path / Text), a `PathField` (`base` = the Workspace path for `folder` and `repository`, none for `none`) or a `Textarea`, an optional title `Input`, Remove; "Add Knowledge Source".
- After a successful save `ProjectEditor` compares the Assembly statuses before and after the refetch and shows a `sonner` toast "N Assemblies are now invalid" (FR-3).
- `ProjectsPage`: a `Badge` with the kind label next to the name; subtitle = the Workspace path or "No folder".
- `AssemblyEditorPage` calls `useProject(project)` and derives `capabilities`; `validate(doc, units, capabilities)`; `Inspector` gets `capabilities: ReadonlySet<Capability> | null`; `CheckListEditor` gets the same prop and lists only descriptors whose `requires` are provided (`null` = all, used by `UnitForm`); the Context tab renders the `gitConventions` switch only when `git` is provided and loses `checkout`.
- `StartMissionDialog`: `useProject(project)`; `hasCheckouts = capabilities.has('git')`; `CheckoutSelect` and `useCheckouts(project, open && hasCheckouts)` only then; `canStart` drops the Checkout clause otherwise; the request omits `checkoutPath`; `StartMissionPrefill { checkoutPath?: string; taskPath: string }`; `api/missions.ts` `StartMissionRequest.checkoutPath?`, `WorkspaceBusyError` (`reason: 'workspace_busy'`).
- `MissionRow`: `workspace.branch ?? workspace.path` in mono when not null. `MissionHeader`: `workspace.path` and ` @ branch` when not null. `MissionLevelView` (Completed): the Pull Request link, else "Produced in <workspace.path>", else "Produced next to the Task: <taskPath>".

## Testing Strategy

Seams (agreed): the runtime `MissionRegistry` harness, the server's `testServer()` with `fastify.inject()`, the web's msw `FakeHome`. Pure modules get unit tests. No new fakes; `folder` and `none` Missions use a `mkdtemp` directory and the `FakeEngine` `shell` step to write files.

- **Pure**: `workspace/kinds.ts` (`capabilitiesOf` per kind and host, `missingCapabilities`), `validate-assembly.ts` (`it.each` over codes as in `packages/runtime/test/config.test.ts`, with `check_unavailable` and `context_source_unavailable` for `none` and for `repository` with `host: none`), `laws.test.ts` tables with `writeRoots` of one and two roots, a `.git` under a root, a null `protectedBranch` (commit on `main` allowed), serializer round-trips of all three kinds and of path/text sources.
- **Workspace classes**: `packages/runtime/test/workspace.test.ts`: `openWorkspace` with `tempRepo()` for `repository` (Checkout matched by realpath, wrong path rejected, `checkoutPath` missing rejected, `host: none` gives no host facet), with `mkdtemp` for `folder` (missing directory rejected, `checkoutPath` rejected, `busyKey` is the realpath), and `none` (`cwd` is the Mission folder).
- **Runner**: extend the harness in `packages/runtime/test/runner.test.ts` with a `kind` option that writes `folderProfile(dir)` or `noneProfile()` instead of `primaryProfile(repo.clonePath)`; prior art: the text Task test (~line 191), the busy Checkout test (~483), the host Checks test (~507). New cases: a `none` Mission of `command` + `llm_judgment` Checks reaches Completed with `summary.workspace = { kind: 'none', path: null, branch: null }` and `judge` received `diffSummary: null`; a `folder` Project refuses a second Mission with `WorkspaceBusyError` and allows one after the first stops; a `none` Project runs two Missions at once; the Mission folder exists for a path Task and is removed on Dismiss; a text Knowledge Source reaches the Core's bundle verbatim; `repository` behaviour and events unchanged (existing tests).
- **engine-claude**: `hooks.test.ts` and `shim.test.ts` fixtures move to the new `GuardContext`; one new case per file for a second write root and for a null protected branch.
- **Server**: `apps/server/test/missions.test.ts` gains a `none` start without `checkoutPath` (201, `summary.workspace.kind === 'none'`) and a `repository` start with a `checkoutPath` for a `folder` Project (400, field `checkoutPath`); `projects.test.ts` gains the `404` for Checkouts of a `none` Project and a PUT of an Assembly with `pr_exists` on a `none` Project (400, `check_unavailable`); `helpers.ts` `testServer({ projects? })` accepts extra Projects.
- **Web**: `projects.test.tsx`: create a `none` Project (POST body has `workspace: { kind: 'none' }`, no git fields rendered), change the kind of `my-app` with the confirmation, Knowledge Source text row in the PUT body; `assembly-editor/editor-page.test.tsx`: on a `none` Project the Check kind select lists `command` and `llm_judgment` only and the Context tab has no Git conventions switch; `missions/start.test.tsx`: no Checkout combobox for the `notes` Project, POST body without `checkoutPath`; `missions/page.test.tsx` and the list test: header and row text per kind, Completed view without a Pull Request shows the path. `FakeHome.primary()` gains Projects `notes` (`folder`, `/notes`) and `research` (`none`).
- **Examples**: `examples.test.ts` loads the rewritten `my-app` and the new `research` Project with zero issues.

## Stages

### Stage 1: Laws on write roots

- **Goal:** the Laws and the shims take `GuardContext { cwd, writeRoots, protectedBranch | null, taskPath, configHome }`; behaviour for one root and a protected branch is unchanged.
- **Depends on:** none.
- **Touches:** `packages/runtime/src/engine/index.ts`, `laws/paths.ts`, `laws/commands.ts`, `runner/runner.ts` (`guard()`), `runner/mission-registry.ts` (the Core's guard), `packages/engine-claude/src/hooks.ts`, `shim.ts`, `shim-main.ts`, tests `laws.test.ts`, `hooks.test.ts`, `shim.test.ts`, `live.test.ts` fixtures.
- **Steps:** change the type; rewrite `evaluatePath` with the rule order of Interfaces; gate the protected-branch rules on null; build the context in the Runner and the registry from the Checkout (`writeRoots: [checkoutPath]`); rename the shim variables and the activation condition; update tests and add the two new cases.
- **Verify:** `mise run check`; `laws.test.ts` has cases for two roots, `.git` under a root, null protected branch.

### Stage 2: The Workspace interface, one kind

- **Goal:** the runtime talks to a `Workspace`; `openWorkspace` still maps every Profile to a `RepositoryWorkspace`; `NoneWorkspace` and `FolderWorkspace` exist and are unit-tested; every Mission has a Mission folder; `MissionSummary.workspace` is added (expand).
- **Depends on:** Stage 1.
- **Touches:** new `packages/runtime/src/workspace/*`; `checks/runners.ts`; `runner/runner.ts`, `context.ts`, `mission-registry.ts`, `task.ts`; `core-agent/index.ts` (`ContextBundle.workspace`, `judge` with nullable diff, `finalReport` with `workspace`, the prompt texts); `config/schemas.ts` + `defaults.ts` + `serialize.ts` + `snapshot.ts` (drop `checkout` from the Slot context); `domain/mission.ts`; `index.ts` and `browser.ts` exports; `apps/server/src/routes/missions.ts` (`checkoutPath` optional in the schema, `WorkspaceBusyError → 409 workspace_busy`); `apps/web/src/api/missions.ts` (`WorkspaceBusyError`), `apps/web/src/features/assembly-editor/inspector/Inspector.tsx` (remove the Checkout switch), `apps/web/test/fake-server.ts` (409 reason), web mission fixtures (add `workspace`), `examples/suptron-home/projects/my-app/assemblies/feature.yaml` if it sets `checkout`.
- **Steps:** write `kinds.ts`, `workspace.ts`, the three classes, `open.ts` (mapping the current `profile.repository` to `repository` kind, host always `github`); add `createMissionFolder`; rewrite `start()` in the order of Interfaces; move the Runner, the Check runners and the context bundle onto the instance; keep `summary.branch` and `summary.checkoutPath` populated from `workspace.summary`; add `workspace.test.ts`; adapt the server route and the web items listed.
- **Verify:** `mise run check`; the existing runner, server e2e and web tests pass unchanged except for the 409 reason and the removed Checkout switch; `workspace.test.ts` covers the three classes.

### Stage 3: Capabilities and validation against the Project

- **Goal:** Checks and context sources declare requirements; `validateAssembly` takes capabilities; the loader, the server and the editor pass them; the editor filters its pickers. With the current one-kind Profile every Project provides `files`, `git`, `host`, so no existing Assembly changes status.
- **Depends on:** Stage 2.
- **Touches:** `checks/catalogue.ts`, `config/validate-assembly.ts`, `config/load.ts`, `browser.ts`; `apps/server/src/routes/projects.ts` (PUT), `apps/server/src/config-service.ts` if the loader signature changes; `apps/web/src/features/assembly-editor/model/validate.ts`, `AssemblyEditorPage.tsx` (`useProject`), `inspector/Inspector.tsx`, `src/components/check-list-editor.tsx`, `features/hangar/UnitForm.tsx` (passes `null`), `apps/web/test/fake-server.ts` (`assemblyStatus` with capabilities); tests `config.test.ts`, `projects.test.ts` (server), `editor-page.test.tsx`.
- **Steps:** add `requires` and `CONTEXT_SOURCE_REQUIREMENTS`; implement the two new error codes over resolved Done and Exit Conditions (Unit default considered); thread `capabilities` through `parseAssemblyText`, `loadAssembly`, `loadProject`; server PUT computes it from the Project's Profile; editor loads the Project and filters; unit tests for `none`-like and `host: none`-like capability sets (built directly as sets, since the Profile cannot express them yet).
- **Verify:** `mise run check`; `config.test.ts` has `check_unavailable` and `context_source_unavailable` cases; `editor-page.test.tsx` has a filtered Check picker case driven by a fake Project whose capabilities the fake server exposes (the fake server computes them from the fixture Profile with `capabilitiesOf` once Stage 4 lands; in this stage the test uses a stubbed capability set through `FakeHome`).

### Stage 4: The Profile format

- **Goal:** the Profile file has `workspace`, Knowledge Sources as path-or-text, `engine`; `capabilitiesOf` and `openWorkspace` read the real kind; fixtures, examples, the Profile form and the Projects page follow; the GLOSSARY is updated.
- **Depends on:** Stage 3.
- **Touches:** `config/schemas.ts`, `defaults.ts`, `serialize.ts`; `workspace/kinds.ts`, `open.ts`, `repository.ts` (reads `workspace.*`, `templates/renderGitConventions(workspace, values)`); `templates/index.ts`; `testing/primary-scenario.ts` (`primaryProfile`), new `testing/workspace-scenarios.ts` (`folderProfile(path, name = 'notes')`, `noneProfile(name = 'research')`, `briefUnits()`, `briefAssembly()`); `examples/suptron-home/projects/my-app/profile.yaml`; `test/examples.test.ts`, `config.test.ts`; `apps/server/test/helpers.ts`, `projects.test.ts`; `apps/web/src/features/projects/ProfileForm.tsx`, new `features/projects/workspace/{NoneFields,FolderFields,RepositoryFields}.tsx`, `KnowledgeSourcesField.tsx`, `ProjectPage.tsx`, `NewProjectDialog.tsx`, `ProjectsPage.tsx`; `apps/web/test/fixtures/primary.ts`, `fake-server.ts` (`FakeHome.primary()` gains `notes` and `research`), `projects.test.tsx`; `docs/GLOSSARY.md`.
- **Steps:** schemas and serializer with round-trip tests for all three kinds; `DEFAULTS.profile`; the real `capabilitiesOf`; `openWorkspace` switching on `profile.workspace.kind`; fixtures and the example rewrite; the Profile form (kind first, sections, Knowledge Source rows, kind-change confirmation, git defaults only in `RepositoryFields`, the toast after save); the Projects page badge and subtitle; GLOSSARY entries (Project, Project Profile, Knowledge Source, Mission, Checkout, Laws; new Workspace; "workspace" leaves the Avoid list of Checkout).
- **Verify:** `mise run check`; `examples.test.ts` passes on the rewritten `my-app`; `projects.test.tsx` creates a `none` Project and changes a kind with the confirmation; the server's `projects.test.ts` PUT of a Profile with an unknown field returns 400.

### Stage 5: `none` and `folder` end to end in the runtime and the server

- **Goal:** Missions of the other two kinds run: validation per kind at start, the busy rule, Knowledge Source references, the Completed report naming the place, the `research` example.
- **Depends on:** Stage 4.
- **Touches:** `workspace/none.ts`, `folder.ts`, `open.ts` (per-kind input checks), `runner/mission-registry.ts` (`listCheckouts` returning `null`, Knowledge Source resolution against `workspace.cwd`), `runner/context.ts`, `core-agent/index.ts` (prompt formatting of text sources, "what was produced and where" in `finalReport`), `examples/suptron-home/hangar/researcher.md`, `brief-writer.md`, `projects/research/profile.yaml`, `projects/research/assemblies/brief.yaml`; `apps/server/src/routes/projects.ts` (Checkouts `404`), `apps/server/test/helpers.ts` (`testServer({ projects })`), `missions.test.ts`, `projects.test.ts`; `test/runner.test.ts`, `examples.test.ts`.
- **Steps:** finish the per-kind checks in `openWorkspace`; resolve Knowledge Sources into `KnowledgeSourceRef[]` in the registry; format them in the Core prompt; write the example Units and Assembly (`researcher`: sonnet, `llm_judgment` "RESEARCH.md next to the Task lists at least three dated sources"; `brief-writer`: sonnet, `llm_judgment` "BRIEF.md answers the Task using only RESEARCH.md sources", Loop → `researcher` limit 2, Exit Point); the runner and server cases of Testing Strategy.
- **Verify:** `mise run check`; the new runner cases pass; `examples.test.ts` loads `research` with zero issues and `brief` as `valid`.

### Stage 6: Missions screens per Workspace (contract)

- **Goal:** the Start Mission dialog asks for a Checkout only when the Project has git; list, header and Completed view read `summary.workspace`; `branch` and `checkoutPath` leave `MissionSummary`.
- **Depends on:** Stage 5.
- **Touches:** `packages/runtime/src/domain/mission.ts`, `runner/runner.ts` (drop the old fields), `apps/server` tests asserting `branch`; `apps/web/src/api/missions.ts`, `features/missions/start/StartMissionDialog.tsx`, `start/useStartMissionPrefill.ts`, `start/schema.ts`, `page/MissionHeader.tsx`, `list/MissionsListPage.tsx`, `panel/MissionLevelView.tsx`, `model/selectors.ts` if it reads `branch`; `apps/web/test/fixtures/missions/index.ts`, `fake-server.ts` (start validation per Project kind), `missions/start.test.tsx`, `missions/page.test.tsx`, the list test.
- **Steps:** remove the two fields and fix every reader; dialog by capability; prefill with optional `checkoutPath`; the three display rules; fixtures for a `folder` and a `none` Mission; tests of Testing Strategy.
- **Verify:** `mise run check`; `grep -rn "checkoutPath" apps/web/src packages/runtime/src/domain` finds only the Start request field; the web tests for the three kinds pass.

### Stage 7: Contract amendments in the documents

- **Goal:** the documents say what the code does.
- **Depends on:** Stage 6.
- **Touches:** `docs/api.md`; `docs/features/suptron-poc/SPEC.md` FR-4, FR-6, FR-16 to FR-19, FR-41, FR-43 and its PLAN's Laws and HTTP sections; `docs/features/assembly-editors/SPEC.md` FR-14, FR-15, FR-33; `docs/features/missions-ui/SPEC.md` FR-2, FR-3, FR-7, FR-14; `docs/features/workspaces/SPEC.md` FR-6, FR-15 (decision 1 above), FR-10 wording (busy key); `docs/adr/0005-workspaces.md` status → accepted; `docs/scenarios/interview-content.md` F-1 closed.
- **Steps:** apply the amendments with an "Amended: <date> by ../workspaces/SPEC.md" line in the style of the earlier plans; record the `checkout` context source removal and the `workspace_busy` reason.
- **Verify:** `grep -rn "checkout_busy\|checkoutPath: string;" docs` finds only historical mentions marked as amended.

## Risks and Rollback

- **The Laws rewrite (Stage 1) could open a hole or close the Mission folder.** Detect with the `laws.test.ts` tables (the text-Task-inside-`configHome` block must stay green) and `shim.test.ts` against a real repository. Roll back by reverting the stage; nothing later depends on the data format.
- **Claude Code in a `none` Mission runs inside `SUPTRON_HOME/missions/<id>`.** `settingSources: ['project']` finds no `.claude/` there, which is intended, but `permissionMode: 'acceptEdits'` only covers `cwd`; the Task location is an additional directory as today. Detect with the live test (`SUPTRON_LIVE=1`) extended by one `none` case in Stage 5. Mitigation if writes into the Task location prompt: the Mission folder and the Task location coincide for a text Task, which is the common `none` case.
- **`validateAssembly` grows a Unit dependency (Done Condition defaults).** Every caller must pass Units with their `doneCondition`; the web's `UnitIndex` already has full Units, the server loader too. Detect with the type checker; the signature change is deliberate.
- **The Profile flip (Stage 4) is the widest stage.** It is isolated to "readers of the Profile shape" because Stages 2 and 3 moved every behavioural consumer onto the Workspace and the capability set. If it stalls, Stages 1 to 3 stay shippable on their own.
- **Busy by realpath.** A folder reached through a symlink and through its real path must count as one; `busyKey` is always a realpath, and the test harness covers a symlinked folder once (prior art: the symlink case in `laws.test.ts`).
- **Recovered Missions after a restart** keep `summary.workspace` from the ledger; their `busyKey` is not reconstructed, which is correct because they are Stopped.

## Out of Scope

- Tools or MCP servers per Project; browser automation.
- Persisting transcripts into the Mission folder.
- Hosts other than GitHub; `host: none` only removes the capability.
- Several Workspaces per Project or per Mission; a Workspace chosen at Launch.
- Migration tooling or compatibility reading of the old Profile format.
- Discovering git inside a `folder` Workspace (OQ-1: no warning).
- Reworking the Hangar's Unit form beyond passing `null` capabilities.
