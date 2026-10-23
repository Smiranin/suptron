# UI editors for Units, Assemblies and Project Profiles: Implementation Plan

**SPEC:** ./SPEC.md
**ADR:** ../../adr/0002-assembly-editors.md (primary), ../../adr/0001-suptron-poc.md (architecture this builds on)
**Runtime plan:** ../suptron-poc/PLAN.md (the runtime, the configuration formats and the server this plan extends; read it first)
**Glossary:** ../../GLOSSARY.md
**Status:** draft
**Amended:** 2026-10-22 by ../missions-ui/PLAN.md: its Stage 3 extracts the pure clock primitives of `features/assembly-editor/canvas/` (viewport, ring, Core circle, arrows, chords, card shell) and `layoutClock` into `features/clock/`, which the editor then composes; its Stage 6 rewrites `ProjectsPage` to show every Project expanded with its Assemblies and a Launch button, and adds a Launch button to the editor header. Build the canvas with that split in mind: keep drawing and interaction in separate components.
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Scope note:** this plan adds the write side of the configuration API to `apps/server`, creates the React web application `apps/web` (its shell plus the Units and Projects areas), and implements the three editors. The Missions screens (POC SPEC FR-36 to FR-41) are a separate SPEC and PLAN; this plan leaves them a route and nothing else.

## Summary

We build the Commander's configuration UI on top of the monorepo defined by the POC plan. Two things are added to the server and one application is created:

- `packages/runtime` gains a browser-safe entry point (`@suptron/runtime/browser`) with the domain types, the zod schemas of the configuration files, `validateAssembly()` and a descriptor of the fixed Check catalogue, so the editors validate with exactly the function the server and the Runner use. It also gains canonical serializers (object → file text) and a `ConfigWriter` for atomic writes with content hashes.
- `apps/server` gains `PUT`, `POST` and `DELETE` routes for Units, Project Profiles and Assemblies, optimistic concurrency through ETags, usage lookups (which Assemblies use a Unit, how many active Missions hold a snapshot), an "open in editor" command, a git-defaults lookup, and static serving of the built web application.
- `apps/web` is a Vite + React + TypeScript single-page application: a shell with the areas Hangar, Projects and Missions (placeholder), form editors for Units and Project Profiles, and the clock-shaped Assembly editor.

The Assembly editor is the heart of the work. Its state is the Assembly file itself (the `AssemblyFile` object the YAML parses into), changed only through a reducer of named commands (`addSlot`, `moveSlot`, `setLoop`, ...). The clock is a pure function of that object: `layoutClock(slots, viewport)` turns the ordered Slot list into position angles, arc arrows, Loop chords and Exit arrows; nothing about the layout is ever stored (ADR-0002). The canvas is rendered as SVG for ring, arrows and chords with Slot cards as HTML elements, all inside one container whose CSS `transform` carries zoom and pan. We chose this over the Commander's initial Canvas-API preference because text, hit-testing, keyboard handling and accessibility come free from the DOM, CSS transitions animate reordering, and, decisive for an autonomous implementer, the result can be tested in jsdom and Playwright, while a `<canvas>` cannot.

Decisions taken during /to-plan that the SPEC did not settle:

1. **SVG + HTML overlay, not Canvas API.** Reasons above. Pan by dragging empty space or with Space held; zoom with the wheel around the centre of the clock; Fit recomputes the transform. 3D effects are out of scope.
2. **Paths are typed, not picked.** The repository path and the Knowledge Sources are text fields; the server checks that the path exists (`GET /api/fs/stat`). SPEC FR-14 and FR-15 were amended on 2026-10-22. No native dialogs, no in-app file browser.
3. **Saving rewrites the file canonically.** Fixed key order, defaults omitted, comments and hand formatting lost; every setting preserved. Success criterion 2 of the SPEC was amended accordingly. There is no raw-file view in the UI, read-only or otherwise; "Open in editor" is the only way to the file.
4. **Optimistic concurrency with content ETags.** `GET` returns `{ data, etag }`, `etag` being the SHA-256 of the file text. `PUT` with `If-Match` fails with `412` when the file changed; the UI then offers Reload or Overwrite, and Overwrite repeats the `PUT` with `?force=1`. The check happens only on Save; there is no file watching.
5. **Front-end stack:** Vite, React 19, TypeScript strict, Tailwind CSS, shadcn/ui components (Radix primitives copied into the repository), react-hook-form with the zod resolver, TanStack Query for server data, react-router. No drag-and-drop library and no zoom library: the ring-constrained drag and the centre-anchored zoom are a few lines of geometry on pointer events.
6. **One validation function.** `validateAssembly()` from `@suptron/runtime/browser` runs in the editor on every change and on the server on every `PUT`. The server refuses hard errors with `400`; the UI disables Save while they exist.
7. **Renaming a Unit in use is refused** exactly like deleting it (SPEC FR-9), with the list of Assemblies. Renaming an Assembly is always allowed; active Missions keep their snapshot.
8. **"Open in editor"** runs the command template in `SUPTRON_EDITOR` (default `code --goto {path}`); when the program is not on `PATH`, falls back to `open {path}` on macOS.
9. **The Missions area is a placeholder route.** Its SPEC and PLAN come later and plug into the shell built here.
10. OQ-1 of the SPEC is closed by decision 5 of the POC plan: `{work_item_id}`, `{task_slug}`, `{task_title}`.

## Current State

No code exists yet; the POC plan creates the repository. This plan assumes the POC plan is implemented at least through its Stages 1, 2, 4, 7 and 10, and relies on these facts from it:

- Configuration lives in `$SUPTRON_HOME`: `units/<name>.md` (Markdown with YAML frontmatter and `## Rules` / `## Instructions` sections), `projects/<name>/profile.yaml`, `projects/<name>/assemblies/<name>.yaml`. The `name` field must equal the file basename.
- `packages/runtime/src/config/` has the zod schemas (`UnitFile`, `ProfileFile`, `AssemblyFile`, `SlotFile`, `Check`), the parsers, `loadConfig(home)` with per-file `issues`, `validateAssembly()` returning `{ errors, warnings }` of `Issue = { code, message, slotName? }`, and `buildSnapshot()`.
- `packages/runtime/src/checks/` has the Check runners; `packages/runtime/src/git/GitClient.readRemoteDefaults()` reads remote URL and default branch.
- `apps/server` (Fastify on `127.0.0.1:4777`) has `GET /api/health`, `GET /api/models`, `GET /api/units`, `GET /api/projects`, `GET /api/projects/:project/checkouts`, the Missions routes and `GET /api/events`. `config-service.ts` loads `SUPTRON_HOME` on demand. `MissionRegistry.list()` returns active `MissionSummary`s and the registry holds each Mission's `MissionSnapshot`.
- `examples/suptron-home/` holds the primary-scenario Units, one Profile and the `feature` Assembly, which is the reference for the acceptance test of this plan.
- `docs/api.md` documents the HTTP contract and must be extended, not duplicated.

Limitations to overcome: nothing writes configuration files; the server has no notion of concurrent edits; `runtime` is not importable from a browser because its main entry pulls in `node:child_process` through `process/exec.ts` and `git/`; there is no web application at all.

## Target Architecture

### Modules and Responsibilities

`packages/runtime` additions:

| Path | Responsibility | Must not know about |
|---|---|---|
| `src/browser.ts` | The browser-safe entry (`@suptron/runtime/browser` in `package.json` `exports`): re-exports `domain/`, `config/schemas`, `config/validate-assembly`, `config/defaults`, `config/slot-names`, `checks/catalogue`. A test bundles it with esbuild `platform: 'browser'` and fails on any `node:` import. | Files, processes, the Runner. |
| `src/checks/catalogue.ts` | `CHECK_CATALOGUE`: one `CheckDescriptor` per `Check['kind']` with label, parameter descriptors and `summarize(check)` for one-line summaries. Pure data and pure functions. | Check runners. |
| `src/config/defaults.ts` | The default values of every optional Slot, Core Directives and Profile field, in one place, used to omit defaults on write and to show inherited values in the inspector. | UI. |
| `src/config/slot-names.ts` | `uniqueSlotName(base, existing)` (numeric suffix) and `referencesToSlot(assembly, name)` (Loop targets and `context.slotOutputs` that point at a Slot). | UI. |
| `src/config/serialize.ts` | `serializeUnit()`, `serializeProfile()`, `serializeAssembly()`: canonical text with fixed key order and defaults omitted. Pure; uses the `yaml` package's `stringify`. | The file system. |
| `src/config/writer.ts` | `ConfigWriter`: atomic write (temp file + rename), `etagOf(text)`, `writeIfMatch()`, `rename()`, `delete()`, `createProject()`, `deleteProject()`. Slot-only. | HTTP. |
| `src/config/usage.ts` | `findUnitUsage(config, unitName)` → Assemblies that reference it. | Missions. |

`apps/server` additions:

| Path | Responsibility |
|---|---|
| `src/routes/units.ts` | List, read, create/update (`PUT`), delete, duplicate, usage. |
| `src/routes/projects.ts` | Projects, Profile and Assemblies: list, read, create, update, delete, duplicate. |
| `src/routes/tools.ts` | `POST /api/open`, `GET /api/git/remote-defaults`, `GET /api/fs/stat`. |
| `src/usage-service.ts` | Combines `findUnitUsage()` with `MissionRegistry` snapshots into `{ assemblies, activeMissions }` for Units, Assemblies and Projects. |
| `src/open-in-editor.ts` | Resolves `SUPTRON_EDITOR`, spawns detached. |
| `src/static.ts` | Serves `apps/web/dist` with `@fastify/static` when the directory exists; SPA fallback to `index.html` for non-`/api` routes. |

`apps/web/src/`:

| Folder | Responsibility | Must not know about |
|---|---|---|
| `api/` | `client.ts` (fetch wrapper: JSON, ETag headers, typed errors `ConflictError`, `ValidationError`, `InUseError`), `queries.ts` (TanStack Query hooks and mutation hooks per resource). | Components. |
| `components/ui/` | shadcn/ui primitives (button, input, select, switch, tabs, dialog, badge, tooltip, textarea). | The domain. |
| `components/` | Shared domain widgets: `SaveBar`, `DiscardGuard`, `ConflictDialog`, `OpenInEditorButton`, `ActiveMissionsNote`, `ModelSelect`, `PathField`, `CheckListEditor`, `MarkdownField`, `NameField`. | Which editor hosts them. |
| `features/hangar/` | `HangarPage` (library list with Duplicate and Delete), `UnitEditorPage`, `UnitForm`. | Assemblies. |
| `features/projects/` | `ProjectsPage`, `NewProjectDialog`, `ProjectPage` (Profile form + Assemblies list), `ProfileForm`, `AssembliesList`. | The canvas. |
| `features/assembly-editor/model/` | Pure: `reducer.ts` (commands → new `AssemblyFile`), `layout.ts` (`layoutClock`), `selectors.ts` (card summaries, inherited values, earlier Slots), `validate.ts` (adapter over `validateAssembly`, groups issues by Slot). | React, the DOM. |
| `features/assembly-editor/canvas/` | `ClockCanvas` (viewport: transform, wheel, pan, Fit), `Ring`, `StartMarker`, `CoreCircle`, `SlotCard`, `ForwardArrows`, `LoopChord`, `ExitArrow`, `ContextChords`, `PlusControl`, hooks `useRingDrag`, `useLoopDrag`, `usePaletteDrop`. | The server. |
| `features/assembly-editor/inspector/` | `Inspector` with `GeneralTab`, `ContextTab`, `DoneConditionTab`, `LoopTab`, `ExitTab`; `OverrideField`; `CoreDirectivesPanel`. | Layout geometry. |
| `features/assembly-editor/palette/` | `UnitPalette` (left), `UnitPicker` (modal from "+"). | Layout geometry. |
| `features/assembly-editor/AssemblyEditorPage.tsx` | Loads the Assembly and the Units, owns the reducer state, selection, dirty flag, ETag, the issues list and Save. | Geometry details. |
| `features/missions/` | `MissionsPlaceholderPage`. | Everything. |
| `lib/` | `geometry.ts` (angles, polar ↔ cartesian, arc paths), `keyboard.ts` (Cmd+S, Delete, Space), `deep-equal.ts`. | React. |

### Relations and Data Flow

```
apps/web (React)                                apps/server (Fastify)
 features/* ── api/queries ── api/client ──HTTP──▶ routes/units|projects|tools
      │                                                 │           │
 @suptron/runtime/browser                                 usage-service   runtime/config: loadConfig, validateAssembly,
 (schemas, validateAssembly,                            │           serialize, ConfigWriter
  CHECK_CATALOGUE, defaults)                      MissionRegistry       │
                                                                    ▼
                                                               $SUPTRON_HOME files  ◀── Commander's code editor
```

Dependencies: `apps/web` → `@suptron/runtime/browser` only (never the main `@suptron/runtime` entry); `apps/server` → `runtime`; `runtime` depends on nothing in the workspace. In development Vite serves `apps/web` on its own port and proxies `/api` to `127.0.0.1:4777`; in production the server serves `apps/web/dist` itself.

Editing an Assembly, end to end:

1. `AssemblyEditorPage` loads `GET /api/projects/:p/assemblies/:assembly` (document, `etag`, issues, `activeMissions`) and `GET /api/units`, `GET /api/models`. The document becomes the reducer's initial state and is kept as `loadedDoc`.
2. Every interaction dispatches a command. The reducer returns a new `AssemblyFile`; `layoutClock()` and `validateAssembly()` are recomputed from it with `useMemo`. `dirty = !deepEqual(doc, loadedDoc)`.
3. Save (button or Cmd+S) is enabled when `dirty && errors.length === 0`. It sends `PUT` with `If-Match: etag`. On `200` the response's document and `etag` replace `loadedDoc`. On `412` the `ConflictDialog` offers Reload (dispatch `replaceDoc` with the response's current document) or Overwrite (`PUT ?force=1`). On `400` the server's issues are shown (should not happen, since the same validator ran locally).
4. Leaving the route with `dirty` triggers `DiscardGuard` (react-router `useBlocker` plus `beforeunload`).

Units and Profiles follow the same cycle with react-hook-form holding the state instead of a reducer; `dirty` is the form's `isDirty`.

### Patterns and Technologies

- **The file is the model.** Editors hold the exact `AssemblyFile` / `UnitFile` / `ProfileFile` shapes from `runtime`; there is no separate view model to map back and forth, which is what keeps "UI edit" and "file edit" equivalent (POC FR-14).
- **Commands, not mutations.** The Assembly reducer is the only place that changes an Assembly in the UI, and it enforces the invariants the SPEC states: a new Slot gets a unique name (FR-26), the last Slot's `exitPoint` is set when the last Slot changes (FR-40), removing a Slot strips references to it (FR-28), renaming a Slot rewrites references.
- **Layout is derived.** `layoutClock()` is pure and deterministic; the same Slot list always draws the same clock (NFR-1).
- **One transformed container.** Zoom and pan are a CSS `transform` on a wrapper `<div>` that contains the `<svg>` and the absolutely positioned HTML Slot cards; both use the same clock coordinate system, so they never drift apart. Palette and inspector live outside it (FR-18).
- **Pointer events for every drag.** `setPointerCapture` on `pointerdown`, angle computed from the pointer position relative to the clock centre, released on `pointerup`. The canvas receives the viewport size as a prop so the geometry is testable in jsdom, where `getBoundingClientRect` returns zeros.
- **Optimistic concurrency** with `If-Match` / `412` / `428`; standard HTTP, no custom locking.
- **Deliberately not applied:** Redux or any global store (TanStack Query caches server state, each editor owns its local state); a drag-and-drop library; d3; a canvas renderer; a markdown preview (Rules and Instructions are plain monospace textareas); file watching and live reload; undo/redo.
- **Libraries:** `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod` (shared with `runtime`), `tailwindcss`, shadcn/ui via `components.json`, `lucide-react` icons, `vite`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `msw`, `@playwright/test`; server: `@fastify/static`; runtime: `esbuild` (dev dependency, for the browser-safety test).

## Interfaces and Contracts

### Browser-safe runtime entry (`packages/runtime/package.json`, `src/browser.ts`)

```json
"exports": {
  ".":         { "types": "./dist/index.d.ts",   "default": "./dist/index.js" },
  "./browser": { "types": "./dist/browser.d.ts", "default": "./dist/browser.js" }
}
```

Exported from `./browser`: all `domain/` types; `unitFileSchema`, `profileFileSchema`, `assemblyFileSchema`, `slotFileSchema`, `checkSchema` and their inferred types `UnitFile`, `ProfileFile`, `AssemblyFile`, `SlotFile`, `CoreDirectivesFile`; `validateAssembly(assembly: AssemblyFile, units: Pick<UnitFile, 'name'>[]): { errors: Issue[]; warnings: Issue[] }`; `DEFAULTS`; `uniqueSlotName`, `referencesToSlot`; `CHECK_CATALOGUE`, `summarizeCheck`, `summarizeCondition`.

### Check catalogue descriptor (`runtime/src/checks/catalogue.ts`)

```ts
interface CheckParam { name: string; label: string; type: 'string' | 'number' | 'text'; required: boolean; placeholder?: string }
interface CheckDescriptor { kind: Check['kind']; label: string; description: string; params: CheckParam[]; summarize(check: Check): string }
const CHECK_CATALOGUE: readonly CheckDescriptor[];   // command, ci_green, pr_exists, pr_no_open_comments, llm_judgment
function summarizeCondition(condition: Check[]): string;   // "pnpm test · CI green" ; "" for an empty list
```

`command` has params `command` (string, required) and `timeoutSeconds` (number, optional); `llm_judgment` has `criterion` (text, required); the other kinds have none.

### Canonical serialization (`runtime/src/config/serialize.ts`)

Key order: Unit frontmatter `name, model, mayAskCommander, doneCondition`, then `## Rules`, `## Instructions`. Profile `name, repository{path, remote, defaultBranch}, knowledgeSources, git{branchNameTemplate, pullRequestTemplate, labels, reviewers}, host, engine, ciWaitTimeoutMinutes`. Assembly `name, core{model, defaultAttemptLimit, defaultLoopLimit, instructions}, slots[]` with each Slot `name, unit, model, instructions, memoryMode, mayAskCommander, context{taskDocuments, knowledgeSources, checkout, slotOutputs}, doneCondition, attemptLimit, loop{target, limit}, exitPoint, exitCondition`. A field equal to its default in `DEFAULTS` is omitted, except `exitPoint: true` on the last Slot, which is always written so the file reads unambiguously. Empty optional lists are omitted. Round-trip contract: `parse(serialize(x))` deep-equals `normalize(x)` for every valid `x`, where `normalize` fills defaults.

### Config writer (`runtime/src/config/writer.ts`)

```ts
class ConfigWriter {
  constructor(home: string);
  etagOf(text: string): string;                                   // sha256 hex
  read(relPath: string): Promise<{ text: string; etag: string } | null>;
  writeIfMatch(relPath: string, text: string, expected: { etag: string } | { create: true } | { force: true }):
    Promise<{ ok: true; etag: string } | { ok: false; reason: 'conflict' | 'exists' | 'missing'; current?: { text: string; etag: string } }>;
  rename(fromRel: string, toRel: string): Promise<void>;         // fails if target exists
  delete(relPath: string): Promise<void>;
  createProject(name: string): Promise<void>;                     // projects/<name>/assemblies/
  deleteProject(name: string): Promise<void>;                     // recursive
}
```

Writes go to `<file>.tmp-<random>` then `rename()` so a code editor never sees a half-written file.

### HTTP contract additions (`apps/server`, appended to `docs/api.md`)

Common: `etag` fields are content hashes. `PUT` semantics: no `If-Match` and no `?force=1` → `201` when the file does not exist, `428 Precondition Required` when it does; `If-Match` → `200`, or `412 { current: { data, etag } }` on mismatch; `?force=1` → `200` always. Body validation failures → `400 { issues: Issue[] }`. Name rules (SPEC FR-6) → `409 { reason: 'name_taken' }`. Refusals by use → `409 { reason: 'in_use', usedBy: [{ project, assembly }] }` or `409 { reason: 'active_missions', count }`.

```
GET    /api/units                                   { items: { unit: UnitFile, etag, issues }[] }          (extends the POC route)
GET    /api/units/:name                             { unit, etag, issues, usage: { assemblies: [{project, assembly}], activeMissions } }
PUT    /api/units/:name                             body UnitFile → { unit, etag }; body.name ≠ :name renames (409 in_use if used)
DELETE /api/units/:name                             204 | 409 in_use
POST   /api/units/:name/duplicate                   { newName } → 201 { unit, etag }

GET    /api/projects                                 { items: { name, profile, etag, issues, assemblies: [{ name, status, issues, activeMissions }], activeMissions }[] }   (extends the POC route)
POST   /api/projects                                 { profile: ProfileFile } → 201 { profile, etag }     (profile.name is the Project name)
GET    /api/projects/:project                        { profile, etag, issues, assemblies: [...], activeMissions }
PUT    /api/projects/:project/profile                body ProfileFile → { profile, etag }; body.name ≠ :project renames the folder (409 active_missions)
DELETE /api/projects/:project                        204 | 409 active_missions
GET    /api/projects/:project/assemblies/:assembly          { assembly: AssemblyFile | null, text?: string, etag, status: 'valid'|'invalid'|'unparseable', issues: { errors, warnings }, activeMissions }
PUT    /api/projects/:project/assemblies/:assembly          body AssemblyFile → { assembly, etag, warnings }; 400 when validateAssembly has errors
DELETE /api/projects/:project/assemblies/:assembly          204 | 409 active_missions
POST   /api/projects/:project/assemblies/:assembly/duplicate { newName } → 201

POST   /api/open                                     { path } → 204 | 500 { reason }        (path must be inside SUPTRON_HOME)
GET    /api/git/remote-defaults?path=                { remote: 'origin', remoteUrl, defaultBranch } | 404 { reason: 'not_a_repository' }
GET    /api/fs/stat?path=                            { exists: boolean, kind?: 'file'|'dir' }   (absolute path, or relative to ?base=)
```

`status: 'unparseable'` carries the raw `text` and the parse error in `issues.errors[0]`; the UI shows the error and "Open in editor" only. `activeMissions` for a Unit counts active Missions whose snapshot contains a Slot of that Unit; for an Assembly, active Missions of that Assembly; for a Project, active Missions of any of its Assemblies.

### Assembly editor model (`apps/web/src/features/assembly-editor/model/`)

```ts
type Command =
  | { type: 'addSlot'; unit: string; index: number }                  // name = uniqueSlotName(unit)
  | { type: 'moveSlot'; name: string; toIndex: number }
  | { type: 'removeSlot'; name: string }                               // strips Loop targets and slotOutputs that point at it
  | { type: 'renameSlot'; name: string; newName: string }              // rewrites references
  | { type: 'patchSlot'; name: string; patch: Partial<Omit<SlotFile, 'name' | 'unit'>> }
  | { type: 'setLoop'; name: string; loop: { target: string; limit: number } | null }
  | { type: 'patchCore'; patch: Partial<CoreDirectivesFile> }
  | { type: 'replaceDoc'; doc: AssemblyFile };                         // Reload after a conflict

function reduce(doc: AssemblyFile, cmd: Command, ctx: { defaultLoopLimit: number }): AssemblyFile;
// Post-conditions on every result: slot names unique; the last Slot has exitPoint === true; no Loop or slotOutputs
// reference to a missing Slot. A Slot that stops being last keeps its exitPoint flag (SPEC FR-40).

interface Viewport { width: number; height: number }
interface ClockLayout {
  center: Point; radius: number;                                        // radius = max(220, 48 * (n + 1))
  start: { angle: 0; position: Point };
  slots: { name: string; index: number; angle: number; position: Point }[];   // angle = 360 * (index + 1) / (n + 1), clockwise from 12 o'clock
  forwardArcs: { from: 'start' | string; to: string; path: string }[];         // arc of the ring between consecutive positions
  loops: { from: string; to: string; limit: number; path: string; badgeAt: Point }[];   // chord bulging toward the centre
  exits: { slot: string; label: string; path: string; labelAt: Point }[];             // radial, outward, length radius / 4
  plusPositions: { index: number; position: Point }[];                             // between consecutive positions, index = insertion position
  fit(viewport: Viewport): { scale: number; translate: Point };
}
function layoutClock(doc: AssemblyFile): ClockLayout;
function contextChords(layout: ClockLayout, doc: AssemblyFile, selected: string): { from: string; to: string; path: string }[];
function positionIndexAt(layout: ClockLayout, angle: number): number;    // nearest position for a dragged Slot, 0..n-1
function insertionIndexAt(layout: ClockLayout, angle: number): number;   // nearest gap for a palette drop, 0..n
```

Card summary (`selectors.ts`): `{ name, unitName, showUnit: unitName !== name, model, mayAskCommander, persistent, doneSummary: summarizeCondition(effectiveDoneCondition), loopBadge?: '↩ implementer, max 3', hasErrors }`. Effective values resolve Slot override → Unit value → `DEFAULTS`.

### Editor page state

```ts
interface EditorState { doc: AssemblyFile; loadedDoc: AssemblyFile; etag: string; selected: string | 'core' | null; inspectorOpen: boolean }
// derived: layout = layoutClock(doc); issues = validateAssembly(doc, units); dirty = !deepEqual(doc, loadedDoc); canSave = dirty && issues.errors.length === 0
```

## Testing Strategy

Two seams, one per application, both at the highest level available:

- **Server: the file system.** Route tests use `fastify.inject()` against a temporary `SUPTRON_HOME` copied from `examples/suptron-home` (prior art: the POC plan's Stage 10 route tests). A good test writes through the API and then asserts on the file text, or edits the file by hand and asserts on the next `GET`. Example: "PUT an Assembly with `If-Match` of a stale etag → 412 with the current document; the file is unchanged".
- **Web: the HTTP API.** Vitest with jsdom, React Testing Library and msw. `apps/web/test/fake-server.ts` is an in-memory `SUPTRON_HOME` behind msw handlers that implement the contract above, including ETags, `412`, `409 in_use` and `activeMissions`. Tests render a page inside the router and the Query provider, drive it with `user-event` and pointer events, and assert on what the fake server received. Example: "drag the reviewer along the ring onto the implementer's position and press Cmd+S → the PUT body has slots in the order analyst, reviewer, implementer and reviewer's exitPoint is still false".
- **Pure modules get unit tests directly:** `serialize` round-trips over every fixture in `examples/suptron-home` and over generated documents; `reducer` post-conditions; `layoutClock` for 1, 3, 7 and 12 Slots (even spacing, Start at 12 o'clock, chords only backwards, `fit` keeps the clock inside the viewport); `validate` adapter grouping.
- **Acceptance (Playwright, last stage):** against the real server on an empty temporary `SUPTRON_HOME` and the built web app, build the primary-scenario Units, Profile and `feature` Assembly through the UI and assert that parsing the written files deep-equals parsing `examples/suptron-home` (success criterion 1); edit the Assembly file on disk, reload the editor and assert the canvas shows the change (success criterion 2); hand-break the file and assert the invalid state (FR-39).

Tests describe behaviour, not implementation: they never call the reducer from a component test and never inspect component state. Fixtures: `apps/web/test/fixtures/` holds the three primary-scenario documents as objects; the fake server starts from them.

## Stages

### Stage 1: Browser-safe runtime entry, catalogue descriptor, canonical serializers

- **Goal:** everything the editors need from `runtime` is importable in a browser, and configuration objects can be written back as canonical text.
- **Depends on:** POC plan Stage 2.
- **Touches:** `packages/runtime/package.json`, `src/browser.ts`, `src/checks/catalogue.ts`, `src/config/defaults.ts`, `src/config/slot-names.ts`, `src/config/serialize.ts`, `src/config/usage.ts`, `packages/runtime/test/`.
- **Steps:**
  1. Add the `./browser` export and `src/browser.ts`; move any `node:` import out of the modules it re-exports (the schemas and `validateAssembly` must be pure).
  2. `DEFAULTS` extracted from the existing loader and `buildSnapshot()`; the loader and snapshot read from it so there is one source.
  3. `CHECK_CATALOGUE` with `summarize`; `summarizeCondition`.
  4. `uniqueSlotName`, `referencesToSlot`, `findUnitUsage`.
  5. `serializeUnit/Profile/Assembly` with the key order and omission rules from Interfaces.
  6. Test that bundles `src/browser.ts` with esbuild (`platform: 'browser'`, `bundle: true`) and fails if the output references `node:` or `child_process`.
- **Verify:** round-trip tests pass for every file in `examples/suptron-home` and for a generated Assembly with every optional field set; the browser-bundle test passes; `pnpm typecheck && pnpm test` green.

### Stage 2: ConfigWriter and the Units write API

- **Goal:** Units can be created, updated, renamed, duplicated and deleted over HTTP with conflict detection and refusals.
- **Depends on:** Stage 1; POC plan Stages 7 and 10.
- **Touches:** `packages/runtime/src/config/writer.ts`, `apps/server/src/routes/units.ts`, `apps/server/src/usage-service.ts`, `docs/api.md`.
- **Steps:**
  1. `ConfigWriter` with atomic writes, `etagOf`, `writeIfMatch` semantics (`create`, `etag`, `force`), `rename`, `delete`.
  2. `usage-service.ts`: Unit usage from `loadConfig()` + active Missions from `MissionRegistry` snapshots.
  3. Extend `GET /api/units` with `etag` per item; add `GET /api/units/:name`, `PUT`, `DELETE`, `POST .../duplicate` with the status codes from Interfaces. `PUT` validates the body with `unitFileSchema`, requires `body.name` to match `:name` or performs a rename (refused `409 in_use` when used).
  4. Document the routes and the `PUT` semantics in `docs/api.md`.
- **Verify:** `fastify.inject()` tests on a temp `SUPTRON_HOME`: create → 201 and the file text equals `serializeUnit()`; update with a stale etag → 412 with current; update without `If-Match` on an existing file → 428; `?force=1` → 200; delete a used Unit → 409 listing `feature`; rename a used Unit → 409; duplicate → new file, same content with the new name; hand-edit the file and `GET` → new etag.

### Stage 3: Projects, Profile and Assemblies write API, tools, static serving

- **Goal:** the rest of the write side and the helper endpoints the forms need.
- **Depends on:** Stage 2.
- **Touches:** `apps/server/src/routes/projects.ts`, `routes/tools.ts`, `open-in-editor.ts`, `static.ts`, `main.ts`, `docs/api.md`.
- **Steps:**
  1. `POST /api/projects` (creates the folder and `profile.yaml`), `GET /api/projects/:project`, `PUT .../profile` (rename moves the folder), `DELETE /api/projects/:project` (409 while active Missions).
  2. Assembly routes: `GET` with `status` valid / invalid / unparseable (and `text` when unparseable), `PUT` running `validateAssembly` against the Hangar and refusing errors with 400 while returning warnings on success, `DELETE`, `POST .../duplicate`.
  3. `POST /api/open` (path must resolve inside `SUPTRON_HOME`; `SUPTRON_EDITOR` template; macOS `open` fallback; spawned detached), `GET /api/git/remote-defaults` over `GitClient.readRemoteDefaults`, `GET /api/fs/stat`.
  4. `static.ts`: `@fastify/static` on `apps/web/dist` when present, SPA fallback for non-`/api` paths; `main.ts` registers it last.
  5. Update `docs/api.md`.
- **Verify:** route tests: create Project → folder and file exist; `PUT` an invalid Assembly (Loop to a later Slot) → 400 with code and `slotName`; a hand-broken YAML → `status: 'unparseable'` with text; delete an Assembly with an active Mission (FakeEngine Mission started through the registry) → 409; `remote-defaults` on `tempRepo()` returns `origin` and `main`; `open` with `SUPTRON_EDITOR="echo {path}"` spawns and returns 204; a request for a path outside `SUPTRON_HOME` → 400.

### Stage 4: Web application shell and the two areas

- **Goal:** `apps/web` exists, builds, is served by the server, and lists Units and Projects with create, duplicate and delete.
- **Depends on:** Stage 3.
- **Touches:** `apps/web/` (new), root `package.json` scripts, `pnpm-workspace.yaml`.
- **Steps:**
  1. Scaffold Vite + React + TypeScript strict, Tailwind, shadcn/ui (`components.json`, the primitives listed in Modules), react-router with routes `/hangar`, `/hangar/:name`, `/hangar/new`, `/projects`, `/projects/:project`, `/projects/:project/assemblies/:assembly`, `/missions` (placeholder), redirect `/` → `/projects`. Vite dev proxy `/api` → `127.0.0.1:4777`.
  2. `api/client.ts` and `api/queries.ts` for every route of Stages 2 and 3, with typed errors.
  3. Test setup: Vitest jsdom, RTL, `test/fake-server.ts` (msw, in-memory `SUPTRON_HOME` from fixtures), `renderWithProviders()` helper.
  4. Shell: left navigation Hangar / Projects / Missions, page layout, `NotFound`.
  5. `HangarPage`: list with model and Done Condition summary, "New Unit", Duplicate (name prompt), Delete with the `409 in_use` refusal rendered as the list of Assemblies. `ProjectsPage`: list, "New Project" opens `NewProjectDialog` (Stage 6 fills the form; here name only). `ProjectPage`: header, Profile section placeholder, `AssembliesList` with status badge (valid / invalid / unparseable), active Missions count, New, Duplicate, Delete (`409 active_missions` refusal), "Open in editor".
  6. Root scripts: `pnpm dev` runs server and Vite together; `pnpm build` builds `apps/web` then the server serves it.
- **Verify:** `pnpm --filter web test` passes list tests (render, delete refused shows Assemblies, duplicate posts the new name); `pnpm build` then starting the server and requesting `/hangar` returns the SPA; `pnpm typecheck && pnpm lint` green.

### Stage 5: Shared editor widgets and the Unit editor

- **Goal:** the common editing behaviour of SPEC FR-2 to FR-5 and FR-8 exists once, and the Unit form is complete.
- **Depends on:** Stage 4.
- **Touches:** `apps/web/src/components/`, `features/hangar/UnitEditorPage.tsx`, `UnitForm.tsx`, `lib/keyboard.ts`.
- **Steps:**
  1. `SaveBar` (unsaved indicator, Save button, disabled reason tooltip), `useSaveShortcut` (Cmd+S / Ctrl+S), `DiscardGuard` (`useBlocker` + `beforeunload`, "Discard changes?" dialog), `ConflictDialog` (Reload / Overwrite), `OpenInEditorButton`, `ActiveMissionsNote` ("N active Missions use a snapshot of this Unit").
  2. `ModelSelect` from `GET /api/models`; when the list is empty or the Engine is down, show the current value disabled with a warning (FR-5 forbids free text).
  3. `CheckListEditor`: ordered list of Checks, add from `CHECK_CATALOGUE`, per-kind parameter fields, remove, move up/down; used for Done Conditions and Exit Conditions alike (FR-11).
  4. `MarkdownField` (monospace textarea, auto-grow), `NameField` (basename rules: lowercase, digits, `-`; uniqueness error from `409 name_taken`).
  5. `UnitForm` with react-hook-form + `unitFileSchema`: name, model, mayAskCommander, doneCondition, rules, instructions. `UnitEditorPage` wires load, save with ETag, conflict, discard guard, Open in editor, active Missions note; `/hangar/new` creates with `PUT` (`201`).
- **Verify:** component tests: editing a field enables Save and shows the indicator; Cmd+S sends `PUT` with `If-Match`; a 412 opens the dialog and Reload replaces the form values; Overwrite sends `?force=1`; navigating away dirty shows "Discard changes?"; an empty models list disables the select with the warning; `CheckListEditor` adds `llm_judgment` with its criterion and the PUT body contains it.

### Stage 6: Project Profile editor

- **Goal:** a Project can be created and its Profile edited in full (SPEC FR-14 to FR-17 as amended).
- **Depends on:** Stage 5.
- **Touches:** `features/projects/ProfileForm.tsx`, `NewProjectDialog.tsx`, `ProjectPage.tsx`, `components/PathField.tsx`.
- **Steps:**
  1. `PathField`: text input, debounced `GET /api/fs/stat` (with `base` for relative paths), existence indicator and error.
  2. `ProfileForm` with `profileFileSchema`: name, repository path (`PathField`), remote and default branch (prefilled from `GET /api/git/remote-defaults` when the path resolves to a repository, editable, "Read from git" button), Knowledge Sources (list of relative `PathField`s), branch name template and Pull Request template with a placeholder legend (`{work_item_id}`, `{task_slug}`, `{task_title}`), labels and reviewers (tag inputs), host (`github`), engine (`claude-code`), CI wait timeout.
  3. `NewProjectDialog` embeds `ProfileForm` and `POST /api/projects`; `ProjectPage` shows the form inline with the shared save behaviour, active Missions note and Open in editor.
- **Verify:** component tests: typing a repository path that the fake server reports as a repository fills remote and default branch; a non-existent Knowledge Source shows an error and blocks Save; creating a Project posts the full Profile and navigates to its page; delete refused with active Missions renders the count.

### Stage 7: Assembly editor model (pure)

- **Goal:** the reducer, the clock layout and the validation adapter exist and are fully tested without any UI.
- **Depends on:** Stage 1 (uses `@suptron/runtime/browser`); independent of Stages 4 to 6 in code, placed after them so the app exists to host it.
- **Touches:** `features/assembly-editor/model/`, `lib/geometry.ts`, `lib/deep-equal.ts`.
- **Steps:**
  1. `geometry.ts`: polar ↔ cartesian with 12 o'clock = 0° clockwise, arc path between two angles on a radius, quadratic chord path bulging toward the centre, radial segment, angle of a point relative to a centre.
  2. `reducer.ts` with every `Command` and the post-conditions from Interfaces; `addSlot` uses `uniqueSlotName`; `setLoop` defaults the limit to `core.defaultLoopLimit ?? DEFAULTS.loopLimit`.
  3. `layout.ts`: `layoutClock`, `contextChords`, `positionIndexAt`, `insertionIndexAt`, `fit`.
  4. `selectors.ts`: card summaries, effective values with their source (`'slot' | 'unit' | 'default'`), earlier Slots of a Slot.
  5. `validate.ts`: calls `validateAssembly`, returns `{ errors, warnings, bySlot: Map<string, Issue[]> }`.
- **Verify:** unit tests: every command's post-conditions (including FR-40 when a move changes the last Slot and FR-28 reference stripping); layouts for 1, 3, 7, 12 Slots have equal angular gaps and the first Slot after Start; loop paths exist only for backward targets; `fit` for 12 Slots in a 900×600 viewport yields a scale that keeps every position plus card padding inside; `insertionIndexAt` returns 0 just after Start and `n` just before Start.

### Stage 8: Canvas rendering

- **Goal:** an Assembly is drawn as the clock, read-only, with selection, zoom, pan and Fit.
- **Depends on:** Stage 7.
- **Touches:** `features/assembly-editor/canvas/`, `AssemblyEditorPage.tsx` (load and render only).
- **Steps:**
  1. `ClockCanvas`: the transformed container, wheel zoom around the clock centre (clamped 0.25 to 3), pan by dragging empty space or any drag while Space is held, Fit button and initial Fit; receives `viewport` as a prop (measured with `ResizeObserver` by the page, injected in tests).
  2. SVG layer: `Ring`, `StartMarker`, `CoreCircle` (selectable), `ForwardArrows` (arrowheads), `LoopChord` (counter-clockwise chord with the limit badge; hover highlights both Slots), `ExitArrow` with label (Exit Condition summary or "when done"), `ContextChords` (dashed, only for the selected Slot), `PlusControl` at every gap.
  3. HTML layer: `SlotCard` positioned at its position, showing the card summary of Stage 7 (name, Unit when different, model, "may ask" and "persistent" icons, Done Condition summary, Loop badge, red error badge); CSS transition on `left`/`top` for reordering; click selects, double-click selects and opens the inspector (FR-29); the card has a visible "on failure" handle at its outer edge.
  4. `AssemblyEditorPage` loads the Assembly, Units and models and renders the canvas with the empty-clock hint when there are no Slots (FR-30); `status: 'unparseable'` renders the error and Open in editor instead of the canvas.
- **Verify:** component tests with the fixtures: the primary-scenario Assembly renders six cards at the expected position positions, three Loop chords with badges "max 3", one Exit arrow labelled "when done" on `pr-reviewer`; selecting `implementer` draws one dashed chord from `analyst`; deselecting removes it; wheel events change the container transform's scale around the centre; Fit restores it; an empty Assembly shows the hint.

### Stage 9: Canvas interactions

- **Goal:** the Commander edits the structure on the canvas: reorder, Loops, add, delete.
- **Depends on:** Stage 8.
- **Touches:** `features/assembly-editor/canvas/` hooks, `palette/`, `AssemblyEditorPage.tsx`.
- **Steps:**
  1. `useRingDrag`: pointer capture on a card, angle → `positionIndexAt`, dispatch `moveSlot` live while dragging (others glide), snap on release; a click without movement is a selection.
  2. `useLoopDrag`: from the failure handle, a ghost chord follows the pointer; dropping on an earlier card dispatches `setLoop`; dropping elsewhere cancels; later cards are visibly not droppable.
  3. `UnitPalette` on the left with pointer-based drag of a Unit onto the ring (`insertionIndexAt` → `addSlot`), highlighting the target gap; `PlusControl` opens `UnitPicker` which dispatches `addSlot` at that gap.
  4. Delete / Backspace with a selected Slot and focus outside inputs: if `referencesToSlot` is non-empty, confirm ("Other Slots refer to this Slot; references will be removed"), then `removeSlot`.
  5. Clicking the Core circle selects `'core'` (panel comes in Stage 10).
- **Verify:** component tests driving pointer events with the injected viewport: dragging `reviewer` to the `implementer` position reorders and the forward arrows follow; dragging from `tester`'s handle onto `implementer` creates a Loop with limit 3; dropping onto a later Slot creates nothing; dropping a palette Unit between `analyst` and `implementer` inserts a Slot named after the Unit, a second drop of the same Unit yields the `-2` suffix; Delete on `implementer` asks for confirmation and removes the Loops that targeted it.

### Stage 10: Inspector and Core Directives panel

- **Goal:** every per-Slot setting and the Core Directives are editable (SPEC FR-19, FR-31 to FR-35).
- **Depends on:** Stage 9.
- **Touches:** `features/assembly-editor/inspector/`.
- **Steps:**
  1. `Inspector` (right side, outside the transform) with tabs General, Context, Done Condition, Loop, Exit; opens on selection, General tab on double-click.
  2. `OverrideField`: shows the Unit's value greyed out with an Override switch; on, the field edits the Slot value; off, the Slot field is removed from the document (`patchSlot` with `undefined`). Used for model, Instructions, Done Condition, mayAskCommander (FR-32).
  3. General: `NameField` (unique within the Assembly; `renameSlot`), Unit (read-only), model, Memory Mode, mayAskCommander, additional Instructions. Context: Task documents, Knowledge Sources, Checkout (default on), one checkbox per earlier Slot Output (default off). Done Condition: `CheckListEditor` under the override switch. Loop: target select among earlier Slots, limit (default from Core Directives), Remove Loop. Exit: Exit Point switch (forced on and disabled on the last Slot), Exit Condition `CheckListEditor`.
  4. `CoreDirectivesPanel` when `'core'` is selected: model, default Attempt limit, default Loop limit, instructions (`MarkdownField`).
- **Verify:** component tests: turning Override on for model and picking `opus` puts `model: 'opus'` on the Slot; turning it off removes the field; ticking `analyst` under Context adds it to `slotOutputs`; the last Slot's Exit switch is disabled and on; setting a Loop in the tab draws the chord; renaming `implementer` rewrites the three Loop targets; editing Core model updates `core.model`.

### Stage 11: Save, validation list, conflicts and invalid files in the Assembly editor

- **Goal:** the editor is complete: explicit Save gated by validation, errors that select their Slot, conflict handling, active Missions note.
- **Depends on:** Stage 10.
- **Touches:** `AssemblyEditorPage.tsx`, `features/assembly-editor/IssuesList.tsx`.
- **Steps:**
  1. `IssuesList` under the canvas: errors (red) and warnings (amber) from `validate.ts`; clicking an issue selects its Slot and opens the inspector; cards with errors carry the red badge.
  2. Save and Cmd+S enabled only when dirty and error-free; the `SaveBar` tooltip names the first error when disabled; `PUT` with `If-Match`; success replaces `loadedDoc` and `etag` and shows returned warnings.
  3. Conflict flow reusing `ConflictDialog`: Reload dispatches `replaceDoc` with the server's current document; Overwrite re-sends with `?force=1`.
  4. `DiscardGuard` on the editor route; `ActiveMissionsNote` in the header; `OpenInEditorButton`.
  5. An invalid-on-load Assembly (status `invalid`) opens normally with its issues listed, so the Commander can fix it; `AssembliesList` already shows the badge, which is the FR-39 "cannot be used to start a Mission" signal until the Missions screens exist.
- **Verify:** component tests: an Assembly with a Loop to a later Slot (fixture) shows the error, Save is disabled with the reason, clicking the error selects the Slot; fixing it enables Save; a 412 on Save offers Reload and the canvas then shows the server's version; Overwrite sends `?force=1`; an Assembly with no Slots cannot be saved; a saved Assembly is no longer dirty and the Discard guard does not fire.

### Stage 12: Acceptance test of the primary scenario

- **Goal:** success criteria 1, 2 and 4 of the SPEC are proven end to end through the real server and the built UI.
- **Depends on:** Stage 11.
- **Touches:** `apps/web/e2e/`, `apps/web/playwright.config.ts`, root `pnpm e2e` script, `README.md`.
- **Steps:**
  1. Playwright config with `webServer` starting the Fastify server on an empty temporary `SUPTRON_HOME` and serving the built `apps/web/dist`.
  2. `primary-scenario.spec.ts`: create the six Units via the Unit editor, the Project with its Profile (repository path = a `tempRepo()` clone), the `feature` Assembly via palette drops, Loop drags and inspector edits; Save; parse the written files with the runtime schemas and `expect` deep equality with the parsed `examples/suptron-home` (ignoring the repository path).
  3. `round-trip.spec.ts`: edit the Assembly file on disk (swap two Slots, add a Loop), reload the editor page, assert cards and chords; break the YAML, reload, assert the unparseable state and the badge in the Assemblies list.
  4. README: "Editors" section (start the server and the UI, `SUPTRON_EDITOR`, where files live).
- **Verify:** `pnpm e2e` passes locally in Chromium; `pnpm typecheck && pnpm test && pnpm lint` green across the workspace.

## Risks and Rollback

- **SVG and HTML layers drifting under transform.** Detect: cards not centred on their positions after zoom in Stage 8 tests (assert card `left/top` equal position positions in clock coordinates, not screen coordinates). Back out: both layers are inside the same transformed element by construction; never apply a second transform to either.
- **Drag maths in jsdom.** jsdom has no layout, so the geometry must depend only on the injected `viewport` and the pointer's `clientX/Y`. Detect: Stage 9 tests failing with NaN positions. Back out: the page measures with `ResizeObserver` and passes numbers down; tests pass fixed numbers.
- **Browser bundle of `runtime` leaks Slot imports** after a later change in `runtime`. Detect: the esbuild test of Stage 1 fails. Back out: move the offending import behind the main entry.
- **Serialization round-trip breaks for a field the POC loader normalizes differently.** Detect: Stage 1 round-trip tests. Back out: `DEFAULTS` is the single source; fix the loader or the serializer, never both.
- **Overwrite after a hand edit loses the Commander's change.** By design (SPEC FR-3, no merge). Detect: the `ConflictDialog` always states what Overwrite discards. Back out: the Commander's code editor keeps its own undo.
- **Engine unavailable → empty model list** blocks changing models (FR-5). Detect: `ModelSelect` warning. Back out: the current value is kept; the Commander edits the file or starts the Engine.
- **Playwright drags are flaky.** Detect: Stage 12 timeouts. Back out: use `page.mouse` with `steps`, assert on the PUT body through a server-side probe rather than on pixels; the Vitest suites already cover the interactions, so the e2e may be marked `retries: 2`.
- **Rolling back a stage.** Each stage is one commit; Stages 1 to 3 only add modules and routes, Stages 4 to 12 live under `apps/web` plus `static.ts`. Reverting any stage leaves the previous one green.

## Out of Scope

- The Missions screens (list, Mission page, transcript, Human Checkpoint answers, Completed page): separate SPEC and PLAN; this plan leaves `/missions` as a placeholder.
- Raw-file view or editor inside the UI, read-only or not; "Open in editor" is the only route to the file.
- Preserving YAML or Markdown comments and formatting on Save; native file or folder dialogs; an in-app file browser.
- File watching, live reload or merging of concurrent edits; undo/redo beyond unsaved changes.
- 3D effects, perspective or decorative animation on the clock beyond CSS transitions on reorder.
- Markdown preview for Rules and Instructions.
- Search and filtering in the Unit library; import/export; Assembly templates or copying between Projects.
- Changing the Check catalogue, the Laws or the Engine list from the UI.
- Non-macOS fallbacks for "Open in editor" beyond the `SUPTRON_EDITOR` template.
