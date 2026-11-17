# Sub-pilots, Side Slots and Outer Folders: Implementation Plan

**SPEC:** ./SPEC.md
**ADRs:** ../../adr/0011-sub-pilots-and-side-slots.md, ../../adr/0012-outer-folders.md
**Status:** draft

## Summary

Three additions, built in this order because each is usable without the next.

**Outer Folders** are a list of absolute paths on the Project Profile. The Laws gain one more place where a Pilot may write, checked after the configuration home so that no listed path can open it ([ADR-0012](../../adr/0012-outer-folders.md)).

**Sub-pilots** are Units a Slot lists for its Pilot. The Engine Adapter hands them to the Engine as named agents of the Pilot's own session; the runtime only learns, through Engine-neutral events, which were called and which returned. A Sub-pilot marked as required becomes a system Check placed first in the Slot's Done Condition, so a missing one fails the Attempt on the path every failed Check already takes ([ADR-0011](../../adr/0011-sub-pilots-and-side-slots.md)).

**Side Slots** are Units a Slot lists to start each time it is done. The `Runner` owns a small module that runs them beside the ordered list: one sequential chain per parent Slot, one Attempt each, no Check, no Core. The Core takes no part: the prompt of a Side Slot is put together by plain code and its outcome is its Pilot's Handover (`done` → done, anything else → failed; the Handover text is its note). The Mission writes its final report when the Exit Condition holds, stays Running until every chain has ended, and only then is Completed.

Decisions taken in the technical interview, so the implementer does not reopen them:

1. The Core never composes a prompt for a Side Slot and never judges one. A Side Slot has no Done Condition.
2. A required Sub-pilot is the system Check `sub_pilot_returned`, added at snapshot time, hidden from the editor's catalogue.
3. Settings a Side Slot cannot have are rejected by a `z.strictObject` schema, not by `validateAssembly`.
4. An Outer Folder missing at start refuses the start (`MissionStartError`); a Resume is refused the same way.
5. "Run again" works wherever the Mission has a live `Runner` and is not Stopped: in the active states and in Completed. A Completed Mission goes back to Running for the time of the run and holds its Workspace again.
6. Sub-pilot agent name = Unit name, so a Unit appears at most once among the Sub-pilots of one Slot.
7. Tests use the existing seams, one per layer (see Testing Strategy).

Facts verified on the real Engine (Claude Agent SDK 0.3.307), which the design rests on:

- The `PreToolUse` hook fires for tool calls made inside a called agent, and a deny holds. The Laws need no new mechanism for Sub-pilots.
- A called agent can call agents itself unless its definition says `disallowedTools: ['Agent', 'AskUserQuestion']`; with it, it can neither nest nor ask.
- `Options.agents` is `Record<name, AgentDefinition>`; the Pilot calls one with the tool `Agent` and `input.subagent_type = name`; several calls in one message run at the same time.
- Messages from inside a called agent carry `parent_tool_use_id` (the id of the `Agent` tool call). Text blocks arrive only with `forwardSubagentText: true`. The top-level `tool_result` for the `Agent` call is the return.
- `result.total_cost_usd` is one total for the session, called agents included. There is no cost per Sub-pilot.
- `canUseTool` was not called for the `Agent` tool, so nothing about called agents may rely on it.

## Current State

- **Configuration** (`packages/runtime/src/config/`): `schemas.ts` holds `slotFileSchema`, `profileFileSchema`, `checkSchema`; `snapshot.ts` resolves a Slot against its Unit into `ResolvedSlot` and freezes a `MissionSnapshot`; `validate-assembly.ts` returns `{errors, warnings}` of `Issue`; `usage.ts` (`findUnitUsage`) looks only at `slot.unit`.
- **Laws** (`packages/runtime/src/laws/paths.ts`): `evaluatePath` checks, in order, Task location → write roots → configuration home (deny) → read allowed → outside write (deny). Write roots come before the configuration home because the Mission folder lives inside it. `GuardContext` (`packages/runtime/src/engine/index.ts`) is built by `buildGuard` (`workspace/workspace.ts`) and serialised for shell shims by `guardEnv` (`packages/engine-claude/src/shim.ts`).
- **Engine** (`packages/runtime/src/engine/index.ts`): `AgentSpec`, `AgentEvent`, `AgentHandle`, `Engine`. The Claude adapter (`packages/engine-claude/src/claude-engine.ts`, `events.ts`, `hooks.ts`) builds SDK options in `buildOptions()` and maps SDK messages in `sdkMessageToEvents`, which ignores `parent_tool_use_id`. Nothing passes `agents`.
- **Runner** (`packages/runtime/src/runner/runner.ts`): one loop over the ordered Slots. `executeSlot` asks the Core for the prompt, `runPilot` creates the agent and turns `AgentEvent`s into `agent.*` `MissionEvent`s, `evaluate` runs the Done Condition, `complete()` asks the Core for the final report and emits `mission.completed`. One `currentHandle`. `RunnerProgress` is what the ledger keeps for a Resume.
- **Registry** (`runner/mission-registry.ts`): `start`, `resume`, `stop`, `retry`, `answer`, `dismiss`, `recoverInterrupted`; `writeLedger` leaves out Completed Missions; `isWorkspaceBusy` uses `isActiveState`.
- **Core** (`core-agent/index.ts`): one Engine session per Mission; `composeSlotPrompt`, `judge`, `finalReport`, …; a usage limit of the Core puts the whole Mission into Waiting for usage.
- **Server** (`apps/server/src`): `routes/missions.ts` (maps `MissionStateError` to 404/409), `routes/projects.ts` (Profile PUT validated by `profileFileSchema` only), `transcript-store.ts` (a section per `slot.started`; **`append` always writes to the last section**), `sse.ts`.
- **Web** (`apps/web`): Assembly editor reducer `reduce(doc, cmd)`, `Inspector.tsx` with tabs, validation through the runtime's `validateAssembly`, clock layout `layoutClock` → `ClockLayout` drawn by `ClockView`; Mission page reducer (`applyEvent`, **`appendEntry` writes to the last section**), `MissionClock.tsx`, `SidePanel`, `MissionLevelView`; Profile form with `KnowledgeSourcesField.tsx`.

Limitations to overcome:

- Transcript entries are filed under the last section, which is wrong as soon as two Pilots work at once.
- The selection model of both clocks knows only a Slot name or `'core'`; nothing is drawn outside the ring but cards, labels and Exit arrows.
- `FakeEngine` (`packages/runtime/src/testing/fake-engine.ts`) cannot script a called agent.
- The configuration-home rule for Outer Folders needs the home path, which the browser-safe schema does not have.

## Target Architecture

### Modules and Responsibilities

| Module | Responsibility | Must not know |
|---|---|---|
| `config/schemas.ts` | File shapes: `subPilotFileSchema`, `sideSlotFileSchema`, `slotFileSchema.subPilots/sideSlots`, `profileFileSchema.outerFolders`, Check kind `sub_pilot_returned` | the configuration home, Units |
| `config/outer-folders.ts` (new) | `validateOuterFolders(folders, configHome): Issue[]`: absolute, not the home, not inside it, not containing it | the browser (Node only) |
| `config/validate-assembly.ts` | Unknown Units, name uniqueness and context references of Sub-pilots and Side Slots | how they run |
| `config/snapshot.ts` | `ResolvedSubPilot`, `ResolvedSideSlot`; puts `sub_pilot_returned` Checks first in the Done Condition | events, Engine |
| `laws/paths.ts`, `workspace/workspace.ts` | Outer Folders as a place to write, after the configuration-home check | where the list comes from |
| `engine/index.ts` | `AgentSpec.subAgents`, events `sub_agent_called` / `sub_agent_returned`, the `agent` marker | the tool name `Agent`, SDK types |
| `engine-claude/sub-agents.ts` (new) | Agent definitions from `spec.subAgents`; a tracker that maps `Agent` tool calls and `parent_tool_use_id` to the neutral events and markers | Slots, Checks |
| `runner/runner.ts` | The ordered list as today; passes Sub-pilots to the agent, counts calls and returns per Attempt, starts the Side Slot chain when a Slot is done, waits for chains at the end | how a Side Slot's Pilot is driven |
| `runner/side-slots.ts` (new) | `SideSlots`: chains, statuses, records, stop one, run again, stop all | the Core, Checks, Loops, Attempts of Slots |
| `runner/side-slot-prompt.ts` (new) | `composeSideSlotPrompt(bundle, parentSlot)`: the prompt of a Side Slot from the context bundle, plain text | the Core |
| `runner/mission-registry.ts`, `ledger.ts` | `stopSideSlot`, `runSideSlot`; Side Slot records in the ledger; interrupted after a restart; start refused for a missing Outer Folder | — |
| `apps/server` | Two routes; transcript sections per Slot name; Profile PUT runs `validateOuterFolders` | — |
| `apps/web` editor | Reducer commands and an Inspector tab for both lists; plates outside the ring | the Runner |
| `apps/web` Mission page | Side Slot records and sections, Sub-pilot markers, plate selection, Stop / Run again | — |

### Relations and Data Flow

```
Slot's Pilot (one Engine session)
  └─ Agent tool call ──► Sub-pilot (same session, Laws by the same PreToolUse hook)
        SDK messages ──► SubAgentTracker ──► AgentEvent{sub_agent_called|returned, agent marker}
                                               └─► Runner ──► agent.sub_pilot_* events, per-Attempt set
                                                                └─► Check sub_pilot_returned (first in Done Condition)

Runner: slot.done ──► SideSlots.start(parent)
                         chain(parent): side-1 → side-2 → …   (own AgentHandle, role 'pilot', fresh session)
                         events: side_slot.started / agent.* (slot = Side Slot name) / side_slot.ended
Runner: Exit Condition holds ──► Core.finalReport(+ Side Slots so far) ──► mission.reported
                              ──► await SideSlots.idle() ──► mission.completed
```

- Dependencies point the way they do today: `runner` → `config`, `engine`, `laws`, `core-agent`; `engine-claude` → `runtime`. `side-slots.ts` depends on `engine`, `workspace`, `context.ts`, `domain/handover.ts`; it gets `emit` and the Mission's `meta` from the `Runner` and never calls `CoreAgent`.
- A Side Slot's events reuse `agent.text`, `agent.tool_call`, `agent.tool_result`, `agent.error`, `agent.activity`, `cost.updated` with `slot` = the Side Slot's name and `attempt` = the number of its start. Only its beginning and end are new event types.
- The ordered list never awaits a chain except in `complete()`.

### Patterns and Technologies

- **Applied:** zod schemas with `strictObject` for closed shapes (as `workspaceFileSchema`); a deep-frozen snapshot; the Check catalogue for the new Check kind; events as the only output of the Runner; a promise chain per parent Slot for sequencing (no queue library, no worker).
- **Not applied:** no guard against two Pilots writing one file; no second Core; no per-Slot permissions; no new state of the Mission (waiting for Side Slots is Running); no retry of a Side Slot by the system.
- **Engine:** `Options.agents`, `AgentDefinition.disallowedTools`, `forwardSubagentText`, all in `packages/engine-claude`. No other package names them.

## Interfaces and Contracts

**Files** (`packages/runtime/src/config/schemas.ts`):

```ts
subPilotFileSchema = z.strictObject({
  unit: nameSchema, model?: string, instructions?: string, required?: boolean })

sideSlotFileSchema = z.strictObject({
  name?: nameSchema,            // defaults to the Unit's name
  unit: nameSchema, model?: string, rules?: string, instructions?: string,
  context?: slotContextSchema, subPilots?: SubPilotFile[] })

slotFileSchema      += subPilots?: SubPilotFile[], sideSlots?: SideSlotFile[]
profileFileSchema   += outerFolders: string[] (default [], each absolute via isAbsolutePath)
checkSchema         += { kind: 'sub_pilot_returned', unit: string }   // system Check
```

A file that writes `sub_pilot_returned` into a Done Condition by hand is rejected by `validateAssembly` (`system_check_in_condition`); `CHECK_CATALOGUE` marks the descriptor `system: true` and the editor's Check picker leaves such kinds out.

**Validation codes** added to `validateAssembly`: `duplicate_sub_pilot` (same Unit twice in one list), `duplicate_side_slot_name` (a Side Slot name equal to another Side Slot, a Slot, or `core`), `system_check_in_condition`; `unknown_unit` and `context_reference_missing` are reused. A Side Slot's `context.slotOutputs` may name its parent Slot or an earlier Slot. Each Issue carries `slotName` = the parent Slot, so the editor files it under that Slot.

**Snapshot** (`config/snapshot.ts`):

```ts
interface ResolvedSubPilot { unit: string; title: string; model: string; rules: string; instructions: string; required: boolean }
interface ResolvedSideSlot { name: string; unit: string; model: string; rules: string; instructions: string;
                             context: ResolvedContext; subPilots: ResolvedSubPilot[] }
interface ResolvedSlot { …; subPilots: ResolvedSubPilot[]; sideSlots: ResolvedSideSlot[] }
```

`resolveSlot` prepends one `{kind:'sub_pilot_returned', unit}` per required Sub-pilot to `doneCondition`. A Side Slot has no Done Condition, so a required Sub-pilot of a Side Slot that did not return makes the Side Slot failed with a note naming it (same helper, see below).

**Laws** (`engine/index.ts`, `laws/paths.ts`): `GuardContext.outerFolders: string[]`. `evaluatePath` order becomes Task location → write roots → configuration home (deny) → **Outer Folders (allow)** → read allowed → outside write (deny). `GuardLocations.outerFolders`, `MissionMeta.outerFolders` (taken from the snapshot's Profile at start), `guardEnv` adds `SUPTRON_GUARD_OUTER_FOLDERS`, `outsideWriteReason` names them.

**Engine** (`engine/index.ts`):

```ts
interface SubAgentSpec { name: string; description: string; model: string;
                         systemPrompt: { rules: string; instructions: string }; required: boolean }
AgentSpec += subAgents?: SubAgentSpec[]
type AgentMarker = { name: string; callId: string }
AgentEvent text | tool_call | tool_result += agent?: AgentMarker
AgentEvent += { type: 'sub_agent_called'; callId: string; name: string }
            | { type: 'sub_agent_returned'; callId: string; name: string; isError: boolean }
```

`name` is whatever the Engine called (a Sub-pilot's Unit name or one of the Engine's general agents); the Runner counts only names that are Sub-pilots of the Slot. The adapter gives each definition the Unit's Rules and Instructions through `systemText`, `disallowedTools: ['Agent','AskUserQuestion']`, and appends to the Pilot's system prompt a paragraph that lists the Sub-pilots, says how to call them and which are required.

**Mission events** (`events/mission-event.ts`):

```ts
agent.text | agent.tool_call | agent.tool_result  += payload.agent?: AgentMarker
{ type: 'agent.sub_pilot_called';   slot, attempt…, subPilot: string, callId: string }
{ type: 'agent.sub_pilot_returned'; slot, attempt…, subPilot: string, callId: string, isError: boolean }
{ type: 'side_slot.started'; slot: string /* Side Slot */, parent: string, attempt: number }
{ type: 'side_slot.ended';   slot: string, parent: string, attempt: number, status: 'done'|'failed'|'interrupted', note?: string }
{ type: 'side_slot.waiting'; slot: string, parent: string }
{ type: 'side_slots.left_out'; slot: string /* parent */ }
{ type: 'mission.reported';  result: MissionResult }
```

`mission.completed` keeps its shape and still carries the result. `side_slot.*` and `mission.reported` join `LEDGER_EVENT_TYPES`.

**Domain** (`domain/mission.ts`, `domain/transcript.ts`):

```ts
type SideSlotStatus = 'waiting' | 'running' | 'done' | 'failed' | 'interrupted'
interface SideSlotRecord { name: string; parent: string; unit: string; status: SideSlotStatus;
                           starts: number; note?: string; cost: Cost }
interface SubPilotActivity { unit: string; calls: number; returns: number }   // of the last Attempt
SlotRecord    += subPilots?: SubPilotActivity[]
MissionDetail += sideSlots: SideSlotRecord[]
TranscriptEntry text | tool_call += agent?: AgentMarker
TranscriptSection += sideSlotOf?: string      // the parent, on a Side Slot's section
```

**Runner**:

```ts
// runner/side-slots.ts
class SideSlots {
  start(parent: ResolvedSlot, slotOutputs: ReadonlyMap<string,string>): void   // leaves out when the chain still runs
  stopOne(name: string): void          // MissionStateError 'side_slot_not_running'
  runAgain(name: string): void         // MissionStateError 'side_slot_not_runnable'
  stopAll(): Promise<void>             // running and waiting → interrupted
  idle(): Promise<void>                // resolves when no chain runs
  records(): SideSlotRecord[];  restore(records: SideSlotRecord[]): void
}
CheckContext    += subPilotsReturned: ReadonlySet<string>
RunnerProgress  += result?: MissionResult      // the report is written; only Side Slots were awaited
LedgerEntry     += sideSlots?: SideSlotRecord[]
MissionRegistry += stopSideSlot(id, name), runSideSlot(id, name)
StartIssueField += 'outerFolders'
```

**HTTP** (`docs/api.md`):

```
POST /api/missions/:id/side-slots/:name/stop    204 | 404 not_found | 409 side_slot_not_running
POST /api/missions/:id/side-slots/:name/run     204 | 404 not_found | 409 side_slot_not_runnable | 409 workspace_busy
PUT  /api/projects/:name                        422 also for an invalid Outer Folder (path `outerFolders.N`)
```

## Testing Strategy

One seam per layer, all existing; tests assert behaviour seen from outside (events, `registry.get(id)`, HTTP responses, what the page shows), never private state.

- **Runtime, main seam:** `MissionRegistry` + `FakeEngine` + real git, the `harness()` of `packages/runtime/test/runner.test.ts`. `FakeEngine` gains a step `{ subAgent: { name, steps?, returns?: string, isError?: boolean } }` that emits the neutral events and marked tool calls, and it already supports several scripts by label, which is what Side Slots need (label = Side Slot name).
- **Runtime, pure:** tables in `laws.test.ts` (`evaluatePath` with Outer Folders), `config.test.ts` (`it.each` on the new codes, serialise round-trips, snapshot), `checks.test.ts` (`sub_pilot_returned`).
- **Engine adapter:** pure tests of the tracker and `sdkMessageToEvents` with recorded message shapes (`test/events.test.ts`), options asserted with the mocked `query` (`test/core-options.test.ts` shape), guard env in `shim.test.ts`, and one live test in `test/live.test.ts` behind `SUPTRON_LIVE=1`: a Sub-pilot is called, cannot write outside, cannot call an agent.
- **Server:** `app.inject` through `testServer()` (`apps/server/test/helpers.ts`), `transcript-store.test.ts` for routing.
- **Web:** whole-page tests with `renderApp(route, live)` and the fake server (`apps/web/test/fake-server.ts`), plus pure tests of the reducers and of `layoutClock`.

Commands: `mise run check` (typecheck, lint, format check, tests) is the gate for every stage; narrower: `mise exec -- pnpm vitest run --project runtime|engine-claude|server|web`.

## Stages

### Stage 1: Outer Folders in the Profile, the Laws and the start

- **Goal:** a Profile lists Outer Folders; every Pilot may write there; the configuration home stays closed; a missing folder refuses the start (FR-24..27, ADR-0012).
- **Depends on:** none.
- **Touches:** `config/schemas.ts`, `config/outer-folders.ts` (new), `config/load.ts`, `config/index.ts`, `engine/index.ts`, `laws/paths.ts`, `workspace/workspace.ts`, `runner/runner.ts` (`MissionMeta`, `buildGuard` call), `runner/mission-registry.ts`, `engine-claude/src/shim.ts` (+ whatever reads the guard env in `shim-main.ts`), `testing/` builders, `apps/server/src/routes/projects.ts`, `docs/api.md`.
- **Steps:**
  1. Add `outerFolders` to `profileFileSchema` (default `[]`, each absolute).
  2. Write `validateOuterFolders`; call it where the home is known: the loader and the Profile PUT route (422 in the shape other field errors use).
  3. Add `GuardContext.outerFolders`, the new branch in `evaluatePath` after the configuration-home deny, `outsideWriteReason`, `buildGuard`, `guardEnv` and its reader.
  4. Carry the list in `MissionMeta`; in `MissionRegistry.start` refuse with `MissionStartError` (field `outerFolders`) when a folder does not exist; in `resume` refuse through the existing `cannot_resume` path. A ledger entry without the field reads as `[]`.
- **Verify:** `laws.test.ts` rows: write inside an Outer Folder allowed; an Outer Folder equal to, inside or containing the home never opens the home; shell shim honours it (`shim.test.ts`). `runner.test.ts`: start refused for a missing folder. `projects.test.ts`: PUT with the home as an Outer Folder → 422. `mise run check`.

### Stage 2: Outer Folders in the Profile form

- **Goal:** the Commander edits the list (FR-30).
- **Depends on:** Stage 1.
- **Touches:** `apps/web` Profile form (`profile-form-model.ts`, a new `OuterFoldersField.tsx` shaped like `KnowledgeSourcesField.tsx`), start form (shows the `outerFolders` start issue), `test/fake-server.ts`, fixtures.
- **Steps:** add the field to `ProfileFormValues`; rows with `PathField` and `usePathStatuses`; show the server's 422 per row; map the start issue to a form-level message.
- **Verify:** page test: add a folder, save, reload shows it; a relative path is refused in the form; a server refusal appears on its row. `mise run check`.

### Stage 3: Sub-pilots and Side Slots in the configuration

- **Goal:** files, validation and snapshot know both lists; nothing runs yet (FR-1, FR-8, FR-9, FR-31, NFR-1).
- **Depends on:** none.
- **Touches:** `config/schemas.ts`, `validate-assembly.ts`, `snapshot.ts`, `serialize.ts`, `usage.ts`, `slot-names.ts`, `checks/catalogue.ts`, `checks/runners.ts` (runner for the new kind, reading `CheckContext.subPilotsReturned`), `runner/mission-registry.ts` (Unit usage of active Missions), `packages/runtime/src/browser` entry exports.
- **Steps:**
  1. Schemas and types as in Interfaces and Contracts.
  2. `validateAssembly`: new codes; Units of Sub-pilots and Side Slots checked; Side Slot context references.
  3. `resolveSlot` resolves both lists and prepends the system Checks; `SnapshotError` for an unknown Unit as today.
  4. `findUnitUsage` and the registry's usage count see all three places.
  5. `sub_pilot_returned` in the catalogue (`system: true`) with its runner; `Runner.evaluate` passes an empty set for now.
- **Verify:** `config.test.ts`: each new code; a Side Slot with `loop`, `exitPoint`, `doneCondition`, `memoryMode`, `mayAskCommander` or `sideSlots` is invalid with the key's path; an old Assembly parses and snapshots unchanged; round-trip keeps both lists. `examples.test.ts` still green. `mise run check`.

### Stage 4: Named agents in the Engine contract and the Claude adapter

- **Goal:** an agent can be given sub-agents; their calls, returns and messages come out as neutral events (FR-2, FR-5, FR-5a, FR-6, NFR-3).
- **Depends on:** none.
- **Touches:** `engine/index.ts`, `testing/fake-engine.ts`, `engine-claude/src/sub-agents.ts` (new), `claude-engine.ts`, `events.ts`.
- **Steps:**
  1. Extend `AgentSpec` and `AgentEvent`.
  2. `FakeEngine`: the `{ subAgent }` step.
  3. Adapter: `agentDefinitions(spec)`; `forwardSubagentText: true` when there are sub-agents; the Sub-pilot paragraph in the Pilot's appended prompt.
  4. A tracker fed by every SDK message: remembers `Agent` tool calls (`id → subagent_type`), emits `sub_agent_called`, marks events whose `parent_tool_use_id` it knows, emits `sub_agent_returned` on the top-level `tool_result`. The `Agent` tool call itself still comes out as a `tool_call`, as today.
- **Verify:** `events.test.ts` with message sequences for one call, two calls at once, an error return, a general agent; options test asserts `agents`, `disallowedTools` and `forwardSubagentText`; `fake-engine.test.ts` for the new step; live test under `SUPTRON_LIVE=1` (run it once by hand, it is not part of `check`). `mise run check`.

### Stage 5: Sub-pilots in the Runner

- **Goal:** a Slot's Pilot gets its Sub-pilots; calls and returns are recorded per Attempt; a required one that did not return fails the Done Condition (FR-3, FR-4, FR-7).
- **Depends on:** Stages 3, 4.
- **Touches:** `events/mission-event.ts`, `domain/mission.ts`, `domain/transcript.ts`, `runner/runner.ts`, `apps/server/src/transcript-store.ts`, web `applyEvent` table (accept the new event types; real display comes in Stage 11).
- **Steps:**
  1. `runPilot` passes `subAgents` from `slot.subPilots`; maps the two neutral events to `agent.sub_pilot_*` when the name is a Sub-pilot of the Slot; copies the marker into `agent.text` / `agent.tool_call` / `agent.tool_result`.
  2. Keep the per-Attempt set of returned Sub-pilots (reset when an Attempt starts, kept across a usage-limit continuation of the same Attempt); hand it to `evaluate` through `CheckContext`; write `SlotRecord.subPilots`.
  3. Transcript store copies the marker onto entries.
- **Verify:** `runner.test.ts`: required Sub-pilot not called → `check.evaluated` fails with a message naming it, next Attempt starts, the Core is not asked to accept it; called and returned → Slot done; an error return counts as not returned; a general agent's call changes nothing; optional Sub-pilot never called → Slot done. `mise run check`.

### Stage 6: Transcript entries filed by Slot

- **Goal:** an entry lands in the latest section of the Slot its event names, not in the last section.
- **Depends on:** none (must land before Stage 7).
- **Touches:** `apps/server/src/transcript-store.ts`, web Mission reducer (`appendEntry`).
- **Steps:** look the section up by `event.slot` from the end; keep today's behaviour for events without a Slot.
- **Verify:** `transcript-store.test.ts` and the web reducer test: events of two Slots interleaved end up in their own sections; existing tests unchanged. `mise run check`.

### Stage 7: Side Slots in the Runner

- **Goal:** Side Slots start when their Slot is done, run beside the list, never touch the Mission's course, and hold Completed until they end (FR-10..18, FR-20, FR-21, FR-23, NFR-2).
- **Depends on:** Stages 3, 5, 6.
- **Touches:** `runner/side-slots.ts`, `runner/side-slot-prompt.ts` (new), `runner/runner.ts`, `runner/context.ts`, `events/mission-event.ts`, `domain/mission.ts`, `core-agent/index.ts` (`finalReport` input and its instruction), `runner/mission-registry.ts` (`MissionDetail.sideSlots`, `stopSideSlot`), `apps/server/src/transcript-store.ts` (a section on `side_slot.started`, a note on `side_slots.left_out` and on `side_slot.ended`), web `applyEvent` table (accept the types).
- **Steps:**
  1. `SideSlots`: records for every Side Slot of the snapshot (absent until first started); `start(parent)` appends the parent's list to that parent's chain, or emits `side_slots.left_out` when the chain still runs; each run: `side_slot.started`, context bundle, `composeSideSlotPrompt`, an agent with `role: 'pilot'`, `allowQuestions: false`, no `resumeSessionId`, the Mission's guard, the Side Slot's Sub-pilots; events re-emitted under the Side Slot's name; end: Handover `done` and every required Sub-pilot returned → `done`, otherwise `failed`; a `usage_limit` event or an Engine error → `failed`; the next one starts whatever the outcome.
  2. `Runner`: call `start` where `slot.done` is emitted (also after a Core acceptance, not for a passed-by Slot); `complete()` passes the Side Slots so far to `finalReport`, emits `mission.reported`, awaits `idle()`, then `mission.completed`; `stop()` and the Dismiss path call `stopAll()`; Side Slot cost is added to its record and to the Mission's cost.
  3. `stopOne`: interrupts the handle; status `failed`, note "Stopped by the Commander".
  4. Teach the Core's `finalReport` instruction to name each started Side Slot with its outcome and note, and to say "still running" where it is.
- **Verify:** `runner.test.ts`: three Side Slots on the last Slot → same `MissionResult` and Completed whether they are done, failed or stopped (SPEC success criterion); the ordered list does not wait (a later Slot starts while a Side Slot's script still waits); a failing Side Slot does not keep the next from starting; a Slot done again in a Loop while its chain runs emits `side_slots.left_out`; Needs Attention and Waiting for usage do not stop a running Side Slot; the Core is called neither to compose nor to judge for a Side Slot; cost of a Side Slot is in the Mission's cost; `mission.reported` comes before `mission.completed`. `mise run check`.

### Stage 8: Restart, Resume and Run again

- **Goal:** Side Slots survive in the ledger as records, are interrupted by a restart, are never restarted by a Resume, and can be run again by hand (FR-19, FR-22).
- **Depends on:** Stage 7.
- **Touches:** `runner/ledger.ts`, `runner/mission-registry.ts`, `runner/runner.ts` (`progress`, `restore`), `runner/side-slots.ts`.
- **Steps:**
  1. Ledger carries `sideSlots` and `progress.result`; `recoverInterrupted` marks `running` and `waiting` as `interrupted`.
  2. `resume`: restores records; when `progress.result` is present the Mission becomes Completed at once without running a Slot.
  3. `runSideSlot`: allowed when the record is `failed` or `interrupted` and the Mission is not Stopped; in Completed the registry first checks the Workspace (`WorkspaceBusyError` when another Mission holds it), puts the Mission back to Running through the state path Resume uses, and it is Completed again when the chain ends. The run goes to the end of its parent's chain.
- **Verify:** `runner.test.ts`: a registry rebuilt over the same home shows the Side Slot `interrupted`; Resume does not start it; a Mission stopped while only Side Slots ran is Completed on Resume; Run again on a failed Side Slot ends `done` and the Mission is Completed again; Run again while another Mission holds the Workspace is refused; Run again in Stopped is refused. `mise run check`.

### Stage 9: Server routes and API document

- **Goal:** the two actions over HTTP (FR-18, FR-19).
- **Depends on:** Stage 8.
- **Touches:** `apps/server/src/routes/missions.ts`, `docs/api.md`, `apps/server/test/missions.test.ts`, `apps/web/src/api/missions.ts`, `apps/web/test/fake-server.ts`.
- **Steps:** the two routes; `stateError` maps the two new reasons to 409; document routes, events, `MissionDetail.sideSlots`, the Profile field, in the document's existing style; client functions `stopSideSlot`, `runSideSlot`.
- **Verify:** `missions.test.ts`: 204 on both, 409 with `reason` for a Side Slot that is not running / not runnable, 404 for an unknown name; detail and SSE carry the Side Slots. `mise run check`.

### Stage 10: Assembly editor: lists and Inspector

- **Goal:** add, configure, reorder and remove Sub-pilots and Side Slots of a Slot; validation shown at the Slot (FR-28 first half, FR-31).
- **Depends on:** Stage 3.
- **Touches:** editor reducer and `editor-state.ts`, `Inspector.tsx` (a sixth tab "Attached"), `UnitPicker`, `IssuesList.tsx`, Check picker (hide `system` kinds), fixtures.
- **Steps:**
  1. Commands `addSubPilot`, `patchSubPilot`, `moveSubPilot`, `removeSubPilot`, and the same four for Side Slots; `renameSlot` / `removeSlot` also rewrite `context.slotOutputs` of Side Slots.
  2. The tab: two lists; a Sub-pilot row has Unit, model override, Instructions, "required"; a Side Slot row has name, Unit, model override, Rules and Instructions additions, context sources, its own Sub-pilots. Reuse `OverrideField`, `UnitTextAddition`, the context checkbox list.
- **Verify:** reducer tests per command; page test: add a Side Slot and a required Sub-pilot, save, the saved file holds them; a duplicate name shows an Issue under the Slot. `mise run check`.

### Stage 11: Plates outside the ring, in both clocks

- **Goal:** Sub-pilots and Side Slots drawn at their Slot outside the ring, each kind in its own look; selectable (FR-28 second half, FR-29 drawing).
- **Depends on:** Stage 10.
- **Touches:** `layoutClock` / `ClockLayout`, `ClockView`, editor selection, `MissionClock.tsx`.
- **Steps:**
  1. `ClockLayout.attached: { slot, kind: 'subPilot'|'sideSlot', name, x, y }[]`: small plates outside the Slot's card, Sub-pilots on one side of the Slot's radial axis and Side Slots on the other, so the axis stays free for the Exit arrow; `CLOCK_MARGIN` and `box` grow when any Slot has plates; a layout without plates is byte-for-byte today's.
  2. `ClockView` draws them (one shape per kind) and reports clicks; in the editor a click selects the Slot and opens the "Attached" tab at that row; `Selection` gains `{ slot, attached }`.
- **Verify:** `layoutClock` tests: no overlap between plates, cards and Exit labels for 1..8 Slots with up to 3 of each; unchanged output without plates; page test: clicking a plate opens its row. `mise run check`.

### Stage 12: Mission page

- **Goal:** statuses on the plates, a Side Slot's transcript, cost and actions, a Sub-pilot's messages, final outcomes (FR-17 display, FR-23, FR-29).
- **Depends on:** Stages 9, 11.
- **Touches:** Mission reducer (`applyEvent`), `missionDecorations`, `MissionClock.tsx`, `SidePanel`, `TranscriptView` / entries, `MissionLevelView`, `MissionHeader`, fixtures `missions/`.
- **Steps:**
  1. Reducer: `side_slot.*` keep `sideSlots` records and sections; `agent.sub_pilot_*` keep the activity of the current Attempt; `mission.reported` sets the result while the state stays Running.
  2. Plates carry status; selecting a Side Slot shows its sections, cost, note, and Stop (running) or Run again (failed / interrupted, Mission not Stopped); selecting a Sub-pilot shows the Slot's entries with its marker; in the Slot's transcript marked entries carry the Sub-pilot's name.
  3. Mission-level view: the final report as soon as it is reported, with a line that Side Slots still run, and a Side Slots table (name, parent, status, note, cost) beside `SlotsTable`.
- **Verify:** page tests driven by `emit`: a Side Slot goes waiting → running → done on its plate; Stop calls the route; Run again appears for a failed one and not in Stopped; the report is visible while the Mission is Running; a Sub-pilot's entries are marked and filterable; an Assembly without any of this renders as before. `mise run check`, then by hand: `mise run dev`, a Mission on the example home with one Side Slot and one required Sub-pilot added in the editor.

## Risks and Rollback

- **A model override the Engine does not accept for a called agent.** `AgentDefinition.model` may take only some names. Detect in the Stage 4 live test; if so, the adapter maps what it can and falls back to inheriting the Pilot's model, and the plan's contract does not change.
- **Engine messages of a called agent change shape** (`parent_tool_use_id`, forwarding). Detect: the live test and a Slot with a required Sub-pilot that never passes. The tracker is the only place to fix.
- **A Completed Mission returning to Running** (Stage 8) is new for consumers of the global stream. Detect in the Missions list test; rollback: restrict Run again to active states by one condition in `runSideSlot`.
- **Two Pilots writing one file** (a Side Slot and the next Slot). Accepted by ADR-0011; no guard is to be added.
- **Usage limit while Side Slots run:** a refused Side Slot fails and is not retried; the Commander runs it again. Intended (FR-20).
- **Transcript routing change** (Stage 6) touches every Mission. It is a separate stage so it can be reverted alone; Stage 7 must not land without it.
- **Clock layout** (Stage 11): the guarantee is "no plates → identical layout", asserted by a test; rollback is dropping the `attached` branch.
- Every stage is one commit and additive in files and events: a ledger entry, an Assembly or a Profile written before a stage stays readable after it and after its revert, except that a revert of Stage 3 makes Assemblies that already use the new keys unreadable.

## Out of Scope

- Units, Assemblies or example-home files that use Sub-pilots, Side Slots or Outer Folders; the example home stays as it is.
- A Done Condition, Checks, Attempts or Resolutions for a Side Slot; a cost per Sub-pilot.
- Any call of the Core on behalf of a Side Slot.
- Moving the refusal of background agents out of `canUseTool` (it was seen not to be consulted for the `Agent` tool). Note it for a later change; do not fix it here.
- Run again for a Stopped, dismissed or lost Mission; automatic retries; a time limit for a Side Slot.
- Guards against concurrent writes; per-Slot permissions for Outer Folders; creating a missing Outer Folder.
- Nested Sub-pilots or Side Slots; ordered Slots that run at the same time.
