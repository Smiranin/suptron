# Missions screens: Implementation Plan

**SPEC:** ./SPEC.md
**ADR:** ../../adr/0003-missions-ui.md (primary), ../../adr/0002-assembly-editors.md (the clock), ../../adr/0001-suptron-poc.md (the runtime)
**Runtime plan:** ../suptron-poc/PLAN.md (runtime, events, HTTP and SSE contract; read it first)
**Editors plan:** ../assembly-editors/PLAN.md (`apps/web`, the clock canvas, the test fake server; read it second)
**Glossary:** ../../GLOSSARY.md
**Status:** draft
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Scope note:** this plan finishes the server side of Missions (terminal Mission retention, Dismiss, transcript sections, a complete Mission detail payload), extracts the clock primitives of the Assembly editor into a shared module, and implements the Missions area of `apps/web`: the Missions list, the Start Mission dialog, the Mission page with the read-only clock, the side panel with the transcript, the Human Checkpoint and Needs Attention tabs, Stop, Completed and Stopped layouts. It assumes the POC plan and the editors plan are implemented in full.

## Summary

We give the Commander three places: the **Missions list** (`/missions`), one **Mission page** per Mission (`/missions/:id`) and a **Start Mission dialog** opened from a Launch button on the Projects page and in the Assembly editor header. The shape follows ADR-0003: the Mission page is the clock of ADR-0002 drawn read-only with per-Slot state, counters and cost, plus a resizable side panel on the right that shows either one Slot's transcript or the Mission-level view, and gains a Question or Attention tab when the Mission waits for the Commander. One route per Mission; the layout follows the state.

Three technical ideas carry the work:

- **The server is the source of truth for the transcript.** `apps/server` already keeps transcripts in memory; this plan gives them a shape: entries grouped into sections, one per execution of a Slot ("Attempt N", "Loop N from reviewer"), with a `dropped` counter when the server trimmed an earlier section. The Commander's Human Checkpoint answers and Retry notes are transcript entries too, so the UI never reconstructs them. `GET /api/missions/:id` returns everything a freshly opened page needs, including the Assembly document the Mission was started from, the Needs Attention explanation and the Completed result, and a `seq` so that the live stream can be joined without a gap or a duplicate.
- **Live state is a pure reducer, not a query cache.** `apps/web` gets two small stores: one for the Missions list (app-wide, feeds the navigation badge and the browser tab title) and one per Mission page. Both are pure functions `apply(state, MissionEvent)` held in an external store behind `useSyncExternalStore`; TanStack Query is used only for the initial fetch and for static data. Events arrive through one injectable port, `LiveEvents`, implemented on the browser's `EventSource` in production and on a hand-driven fake in tests, because jsdom has no `EventSource`.
- **The clock is shared, not forked.** The pure drawing parts of the Assembly editor's canvas (viewport transform, ring, Core circle, forward arrows, Loop chords, Exit arrows, card shell) move to `features/clock/`; the editor composes them with its interaction hooks, the Mission page composes them with `MissionDecorations` (state, counters, cost per Slot, lit chords and Exit arrow, Mission state in the centre). A behaviour-preserving refactor stage does the extraction and is verified by the editors plan's existing tests.

Decisions taken during /to-plan that the SPEC did not settle:

1. **The POC contract is completed, not reconstructed on the client.** Several FRs (FR-15, FR-20, FR-23, FR-24, FR-28, FR-31, FR-32) need data the POC plan's events and `GET /api/missions/:id` do not carry. The missing pieces are defined here under Interfaces and listed under "Contract amendments" at the end; they are to be written into the POC plan and the missions-ui SPEC at the end of the planning session, together with anything else found while planning.
2. **Native `EventSource`, two subscriptions.** The shell subscribes to `GET /api/events` (all Missions, no `agent.*` or `check.*`) for the list and the badge; a Mission page subscribes to `GET /api/events?mission=<id>&after=<seq>`. When the connection drops the page shows a banner; when it reopens the page refetches the Mission and resets its store (FR-34). The server's replay buffer shortens the gap but nothing depends on it.
3. **No virtualization library.** Collapsed sections are not mounted (NFR-2); rows of the open section get `content-visibility: auto` with `contain-intrinsic-size`; agent text is rendered with `react-markdown` + `remark-gfm` (no raw HTML) and memoized per entry; a tool call's input and output are rendered only when expanded.
4. **Three test levels, no browser end-to-end test.** Pure modules get unit tests; `apps/web` is tested in jsdom against the editors plan's msw fake server extended with a Missions section and a `FakeLiveEvents`; `apps/server` routes are tested with `fastify.inject()` and `FakeEngine`. A Playwright acceptance test was considered and dropped to keep the POC small.
5. **Small choices.** OQ-1: every Project is expanded, nothing is remembered. OQ-2: the tab title is always `(N) <page title> · Suptron` with the count omitted at zero; on a Mission page the page title is the Mission's name (`<assembly> · <task name>`). The side panel divider is dragged with pointer events, like every drag in the editors plan; its width and collapsed state live in `localStorage`. The last used Checkout and Task location are kept in `localStorage` under the Project name. Relative times use `Intl.RelativeTimeFormat` refreshed every 30 seconds. Cost is shown as dollars with two to four decimals, tokens and the word "estimate" in a tooltip.

## Current State

What the two earlier plans leave behind in the areas this plan touches:

- `packages/runtime`: `MissionEvent` union and `TypedEmitter` (`src/events/`), `MissionSummary`, `SlotRecord`, `Cost`, `MissionState`, `NeedsAttentionCause` (`src/domain/mission.ts`), `CheckResult` (`src/checks/`), `MissionRegistry` with `start()`, `list()`, `get()`, `stop()`, `retry()`, `answer()`, `recoverInterrupted()` and the ledger `missions/active.json` (`src/runner/`), `FakeEngine` and `FakeHost` (`src/testing/`), the browser-safe entry `@suptron/runtime/browser`.
- `apps/server`: Fastify on `127.0.0.1:4777`; `routes/missions.ts` with `GET /api/missions`, `POST /api/missions`, `GET /api/missions/:id`, `POST .../stop|retry|answer`; `sse.ts` with `GET /api/events[?mission=]`, `id:` on every event, `Last-Event-ID` replay from an in-memory buffer, a heartbeat every 15 seconds; a transcript store that keeps the current Slot in full and the last 200 entries of earlier Slots; `GET /api/projects` returning per Project `assemblies: [{ name, status, issues, activeMissions }]`; `GET /api/projects/:project/checkouts` returning `{ path, branch, busyMissionId }[]`; `GET /api/fs/stat`; static serving of `apps/web/dist`.
- `apps/web`: the shell with navigation Hangar / Projects / Missions and `features/missions/MissionsPlaceholderPage`; `api/client.ts` and `api/queries.ts`; `components/` (`PathField`, dialogs, `SaveBar`, shadcn primitives); `features/projects/ProjectsPage` (a list of Projects) and `ProjectPage` with `AssembliesList`; `features/assembly-editor/` with `model/layout.ts` (`layoutClock`, `ClockLayout`), `model/selectors.ts` (effective values Slot → Unit → `DEFAULTS`), `canvas/` (`ClockCanvas`, `Ring`, `StartMarker`, `CoreCircle`, `SlotCard`, `ForwardArrows`, `LoopChord`, `ExitArrow`, `ContextChords`, `PlusControl`, drag hooks), `AssemblyEditorPage`; `test/fake-server.ts` (msw, in-memory `SUPTRON_HOME`), `renderWithProviders()`, fixtures of the primary scenario.

Limitations this plan overcomes:

- `MissionRegistry.list()` and `GET /api/missions` return active Missions only; nothing removes a Mission; there is no Dismiss.
- `TranscriptEntry` is named in the POC contract but has no definition; the transcript store has no notion of executions, so "Attempt N" and "Loop N from X" sections cannot be built; `question.answered` carries no answers; the Retry note reaches the Pilot but never the transcript.
- `GET /api/missions/:id` does not return the Assembly (the clock cannot be drawn), the Needs Attention explanation, the failed Checks, the final report or the Pull Request; a reloaded page would lose them.
- `MissionSummary` has no Task path or Work Item ID; the list cannot name the Task.
- The ledger stores enough to mark a Mission interrupted but not enough to show its header and Slots (FR-32).
- The clock primitives live inside the editor's canvas and take editor-only props; nothing in `apps/web` consumes SSE; the Projects page is a bare list without Assemblies or a Launch button.

## Target Architecture

### Modules and Responsibilities

`packages/runtime` changes:

| Path | Responsibility | Must not know about |
|---|---|---|
| `src/domain/transcript.ts` | `ExecutionKey`, `TranscriptEntry`, `TranscriptSection`, `Question`, `sectionTitle(execution)`. Pure types and one pure helper, exported from `@suptron/runtime/browser`. | Storage. |
| `src/domain/mission.ts` | `MissionSummary` gains `taskPath`, `workItemId?`; new `MissionDetail`. | HTTP. |
| `src/events/mission-event.ts` | Every event gains `seq: number`; `slot.started` gains `loopFrom?` and `note?`; `question.answered` gains `answers`; `mission.state` for `needs_attention` gains `slot` and `failedChecks`; `mission.completed` gains `exitSlot`. | Transport. |
| `src/runner/MissionRegistry.ts` | Keeps Completed and Stopped Missions until `dismiss(id)`; `list()` returns every Mission known since start; `isCheckoutBusy()` counts active Missions only; `dismiss()` refuses non-terminal Missions. | HTTP. |
| `src/runner/ledger.ts` | Entries hold `{ summary, assembly, slots }` and are rewritten on start, on every `slot.started` and `slot.done`, and on terminal states; `recoverInterrupted()` returns full `MissionDetail`-shaped records with `transcriptLost: true`. | The UI. |

`apps/server` changes:

| Path | Responsibility |
|---|---|
| `src/transcript-store.ts` | Per Mission: an ordered list of `TranscriptSection`s keyed by `ExecutionKey`; appends entries from `agent.*`, `check.evaluated`, `question.asked`, `question.answered` and the Retry note of `slot.started`; merges `agent.tool_result` into its `tool_call` entry by `toolCallId`; trims every section but the current one to its last 200 entries and counts `dropped`. |
| `src/sse.ts` | Assigns `seq` per Mission (monotonic from 1) and per global stream; accepts `?after=<seq>` and replays the buffer from there; when `after` is older than the buffer, sends `event: resync` first so the client refetches. |
| `src/routes/missions.ts` | `DELETE /api/missions/:id`; `GET /api/missions/:id` returns `MissionDetail`; `POST /api/missions` returns `400 { issues: [{ field, message }] }` and `409 { reason: 'checkout_busy', missionId }`. |
| `docs/api.md` | Updated contract. |

`apps/web/src` additions and changes:

| Path | Responsibility | Must not know about |
|---|---|---|
| `features/clock/` | The pure clock drawing: `useClockViewport` (transform, wheel zoom around the centre, pan, Fit), `ClockView` (the transformed container with the SVG layer and the HTML card layer), `Ring`, `StartMarker`, `CoreCircle`, `ForwardArrows`, `LoopChord`, `ExitArrow`, `CardShell`. Takes `ClockLayout` plus render callbacks and decorations; owns no editing, no Mission state. | The Assembly document, the reducer, Missions. |
| `features/assembly-editor/canvas/` | Keeps the editor's interaction hooks (`useRingDrag`, `useLoopDrag`, `usePaletteDrop`), `PlusControl`, `ContextChords`, the editor's card content; composes `features/clock`. | Missions. |
| `features/missions/model/` | Pure: `types.ts` (`MissionsListState`, `MissionPageState`, `PanelState`), `missions-list-reducer.ts` (`applyMissionsListEvent`), `mission-reducer.ts` (`initMissionPage`, `applyMissionEvent`, panel actions), `selectors.ts` (`groupMissions`, `needsYouCount`, `missionTitle`, `taskName`, `missionDecorations`, `sectionsOf(slot)`, `currentExecution`). | React, the DOM, HTTP. |
| `features/missions/live/` | `LiveEvents` port, `EventSourceLiveEvents`, `FakeLiveEvents`, `LiveEventsProvider`, hooks `useLiveMissions()` and `useLiveMission(id)` that fetch, subscribe, resync and reset. | Components. |
| `features/missions/MissionsProvider.tsx` | App-wide: holds the list store, exposes `useMissions()`, `useMissionSummary(id)`, `useNeedsYouCount()`; sets the document title prefix. | Pages. |
| `features/missions/list/` | `MissionsListPage`, `MissionGroup`, `MissionRow`, `DismissButton`, `EmptyMissionsHint`. | The transcript. |
| `features/missions/start/` | `LaunchButton` (with the disabled reason), `StartMissionDialog`, `CheckoutSelect`, `AdvancedToggles`, `useStartMissionPrefill`. | The Mission page. |
| `features/missions/page/` | `MissionPage` (loads, subscribes, owns the page store, decides the layout by state), `MissionHeader`, `MissionBanner`, `MissionClock` (composes `features/clock` with `missionDecorations`), `MissionSlotCard`, `MissionCoreContent`, `AbsentMissionPage`, `StopMissionDialog`. | Transcript rendering details. |
| `features/missions/panel/` | `SidePanel` (resizable, collapsible, tabs), `TranscriptView`, `ExecutionSection`, `entries/` (`TextEntry`, `ToolCallEntry`, `CheckEntry`, `QuestionEntry`, `AnswerEntry`, `NoteEntry`, `ErrorEntry`), `useAutoScroll`, `MissionLevelView`, `SlotsTable`, `QuestionTab`, `AttentionTab`. | The clock geometry. |
| `components/` | Shared: `Markdown` (`react-markdown` + `remark-gfm`, prose styles), `CostLabel`, `RelativeTime`, `StateBadge`. | Missions internals. |
| `api/missions.ts` | Typed calls for the Missions routes and `startMission()` errors (`MissionValidationError` with field issues, `CheckoutBusyError`). | Components. |
| `features/projects/ProjectsPage.tsx` | Rewritten: every Project expanded with its Assemblies (status badge, issues as the "why" of a missing Launch button) and `LaunchButton`. | Missions internals beyond `LaunchButton`. |
| `features/assembly-editor/AssemblyEditorPage.tsx` | Header gains `LaunchButton`, enabled only when the Assembly is valid and not dirty. | Missions internals beyond `LaunchButton`. |
| `test/fake-server.ts` | Gains a Missions section: in-memory Missions, `POST /api/missions` creates a summary from fixtures, `GET /api/missions/:id` returns the fake's `MissionDetail`, Stop / Retry / Answer / Dismiss change state and push events into `FakeLiveEvents`. | Components. |

### Relations and Data Flow

```
apps/web (React)
  shell ── MissionsProvider ── list store ◀── applyMissionsListEvent ◀── LiveEvents (global)      ──▶ GET /api/events
            │   │                                                                            GET /api/missions
            │   └── nav badge, document.title
            ├── MissionsListPage ── useMissions()
            ├── ProjectsPage / AssemblyEditorPage ── LaunchButton ── StartMissionDialog ──▶ POST /api/missions ──▶ navigate /missions/:id
            └── MissionPage ── page store ◀── applyMissionEvent ◀── LiveEvents (?mission=id&after=seq) ──▶ GET /api/events?mission=
                   │                                                                            GET /api/missions/:id
                   ├── MissionHeader (Stop ──▶ POST /stop; Dismiss ──▶ DELETE)
                   ├── MissionClock = features/clock ⟵ layoutClock(assembly) + missionDecorations(state)
                   └── SidePanel: TranscriptView | MissionLevelView | QuestionTab (POST /answer) | AttentionTab (POST /retry)

apps/server
  routes/missions ── MissionRegistry (runtime) ── Runner ── TypedEmitter ──▶ transcript-store ──▶ MissionDetail
                                                              └──▶ sse (seq, buffer, ?after, resync)
```

Dependencies: `features/missions` → `features/clock`, `components`, `api`, `@suptron/runtime/browser`; `features/assembly-editor` → `features/clock`; `features/clock` → `lib/geometry` and the `ClockLayout` type (which moves to `features/clock/layout.ts` together with `layoutClock`; the editor's `model/layout.ts` re-exports it). `features/projects` and `features/assembly-editor` import only `LaunchButton` from `features/missions`.

A Mission, from the Commander's side:

1. On the Projects page the Commander presses Mission on a valid Assembly. `StartMissionDialog` loads `GET /api/projects/:p/checkouts`, `GET /api/projects/:p/assemblies/:assembly` and `GET /api/units`, computes the effective `mayAskCommander` per Slot with the editor's `selectors.ts`, prefills Checkout and Task location from `localStorage` (only when that Checkout is not busy), and validates the Task path with `PathField` (`GET /api/fs/stat`). Start sends `POST /api/missions`; `400` issues land on their fields, `409` lands on the Checkout field and refetches the Checkouts; `201` stores the prefill and navigates to `/missions/:id`.
2. `MissionsProvider` already holds the new Mission from the `mission.started` event on the global stream; the badge and title update.
3. `MissionPage` calls `useLiveMission(id)`: fetch `GET /api/missions/:id` → `initMissionPage(detail)`; subscribe with `after = detail.seq`; every event goes through `applyMissionEvent`, which ignores `event.seq <= state.seq`. `missionDecorations(state)` feeds the clock; the panel follows the current Slot unless pinned.
4. `question.asked` → the reducer stores `pendingQuestion`, marks the Slot, sets the panel tab to `question`; the banner reads "Waiting for your answer on <Slot>". Answer sends `POST /answer`; the server emits `question.answered` (with the answers, which the transcript store records) and `mission.state running`; the reducer clears the question and returns the tab to `main`.
5. `mission.state needs_attention` (with `cause`, `reason`, `slot`, `failedChecks`) → the reducer stores `attention`, marks the Slot failed, sets the tab to `attention`. Retry sends `POST /retry { note }`; the server emits `slot.started` with `note` and `attempt + 1`; the transcript store opens a new section whose first entry is the note; the reducer clears `attention`, selects the new execution and resumes following.
6. `mission.completed` → the reducer stores `result` (report, pr, exitSlot), sets the selection to `mission` so the Mission-level view opens, and the clock lights the Exit arrow of `exitSlot`. `mission.stopped` → state Stopped, the transcript stays, a Stopped banner shows.
7. Dismiss on a finished Mission (row or page) → `DELETE /api/missions/:id`; the global stream emits `mission.dismissed`; the list drops it; an open page for it shows `AbsentMissionPage` with a link to the list.
8. Connection: `LiveStatus` goes `open → closed` → the page banner says "Connection lost, reconnecting"; `EventSource` reconnects on its own; on `open` the hook refetches the detail and re-initialises the store (dedupe by `seq` keeps buffered events harmless); a `resync` event does the same; a `404` on refetch sets `absent`.

### Patterns and Technologies

- **Pure reducers over events.** `applyMissionsListEvent` and `applyMissionEvent` are the only places live state changes. They are deterministic given `(state, event)`, so the whole Mission page behaviour is unit-testable with event lists that read like the SPEC's scenarios. The same `MissionEvent` union from `@suptron/runtime/browser` is used on both sides; no client-side event types.
- **One injectable port for the stream.** `LiveEvents` is the Missions area's only abstraction over the browser; everything else is plain `fetch` through `api/client.ts`. The port is deliberately minimal (`subscribe` returning `unsubscribe`) so the fake is a few lines.
- **Derived decorations.** The clock never receives Mission state directly; `missionDecorations(state)` turns the store into the small `MissionDecorations` object, which keeps `features/clock` ignorant of Missions and makes the mapping testable.
- **Panel follows, Commander pins.** `panel.follow` is a boolean the reducer honours on every `slot.started`; any click on a Slot clears it; "Back to current" sets it. Completed forces the Mission-level view once, then the Commander may click any Slot.
- **Sections are server truth.** The client never invents an execution boundary; it opens a new section only when a `slot.started` event arrives, exactly as the server does, so a page opened late and a page opened early show the same sections.
- **Deliberately not applied:** a global state library (two external stores with `useSyncExternalStore` suffice), a virtualization library, WebSocket, polling, a markdown library that allows raw HTML, a resizable-panels library, persistence of anything but the three `localStorage` conveniences.
- **Libraries added:** `react-markdown`, `remark-gfm`, `@tailwindcss/typography`. Everything else is already in the workspace.

## Interfaces and Contracts

### Transcript model (`packages/runtime/src/domain/transcript.ts`, exported from `@suptron/runtime/browser`)

```ts
interface ExecutionKey { slot: string; attempt: number; loopIteration?: number; loopFrom?: string }
// executionId(key) = `${slot}#${loopFrom ?? '-'}#${loopIteration ?? 0}#${attempt}`
// sectionTitle(key): loopFrom && attempt === 1 → "Loop {loopIteration} from {loopFrom}";
//                    loopFrom && attempt > 1  → "Loop {loopIteration} from {loopFrom} · Attempt {attempt}";
//                    otherwise                → "Attempt {attempt}"

interface Question { question: string; header: string; options: { label: string; description: string }[]; multiSelect: boolean }
// Answers: Record<question text, string>; a multiple choice answer joins the chosen labels with ", "; a free answer is any other string.

type TranscriptEntry = { id: string; at: string /* ISO */ } & (
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; toolCallId: string; name: string; input: unknown; result?: { output: string; isError: boolean } }
  | { kind: 'check'; check: Check; holds: boolean; detail: string }
  | { kind: 'question'; questionId: string; questions: Question[] }
  | { kind: 'answer'; questionId: string; answers: Record<string, string> }
  | { kind: 'note'; text: string }                 // the Commander's Retry note; first entry of the Attempt that received it
  | { kind: 'error'; message: string });

interface TranscriptSection { execution: ExecutionKey; entries: TranscriptEntry[]; dropped: number }
```

### Mission model additions (`packages/runtime/src/domain/mission.ts`)

```ts
interface MissionSummary {  // existing fields, plus:
  taskPath: string; workItemId?: string;
  cost: Cost & { estimated: true };
}

interface MissionDetail {
  summary: MissionSummary;
  assembly: AssemblyFile;                                  // the document at start, for layoutClock
  slots: SlotRecord[];                                     // Assembly order, then the 'core' pseudo-Slot
  transcript: TranscriptSection[];                         // time order; [] when transcriptLost
  transcriptLost: boolean;                                 // true for Missions recovered from the ledger
  pendingQuestion?: { id: string; slot: string; questions: Question[] };
  attention?: { cause: NeedsAttentionCause; reason: string; slot: string; failedChecks: CheckResult[] };
  result?: { report: string; pr: PullRequestRef | null; exitSlot: string };
  seq: number;                                             // last event applied to this detail
}
```

### Event amendments (`packages/runtime/src/events/mission-event.ts`)

```ts
// every MissionEvent gains: seq: number           (per Mission, monotonic from 1; global stream events carry the Mission's seq)
| { type: 'slot.started'; missionId; seq; slot; attempt; loopIteration?; loopFrom?; note?: string }
| { type: 'question.answered'; missionId; seq; slot; questionId; answers: Record<string, string> }
| { type: 'mission.state'; missionId; seq; state; cause?; reason?; slot?; failedChecks?: CheckResult[] }   // slot + failedChecks on needs_attention
| { type: 'mission.completed'; missionId; seq; report; pr: PullRequestRef | null; exitSlot: string; slots; cost }
| { type: 'mission.dismissed'; missionId; seq }                                                             // global stream only
```

`mission.state` for `waiting_for_owner` carries `slot`. `agent.*` and `check.evaluated` are unchanged; both server and client attach them to the execution opened by the last `slot.started` of that Mission.

### HTTP and SSE contract changes (`apps/server`, `docs/api.md`)

```
GET    /api/missions                  MissionSummary[]                      every Mission since start, including Completed, Stopped and interrupted
POST   /api/missions                  → 201 MissionSummary
                                  400 { issues: { field: 'taskPath' | 'checkoutPath' | 'assembly' | 'workItemId'; message }[] }
                                  409 { reason: 'checkout_busy', missionId }
GET    /api/missions/:id              MissionDetail | 404
DELETE /api/missions/:id              204 | 404 | 409 { reason: 'not_finished' }
GET    /api/events?mission=<id>&after=<seq>   replays buffered events with seq > after, then streams; sends `event: resync` (data: {}) first
                                          when `after` is older than the buffer; without ?mission streams every Mission's events except agent.* and check.*
```

### Ledger entry (`packages/runtime/src/runner/ledger.ts`)

```ts
interface LedgerEntry { summary: MissionSummary; assembly: AssemblyFile; slots: SlotRecord[] }
// missions/active.json: Record<missionId, LedgerEntry>; written on start, slot.started, slot.done, terminal state; removed on Dismiss
// recoverInterrupted(): MissionDetail[] with summary.state = 'stopped', summary.note = 'interrupted', summary.currentSlot = null,
//                       transcript = [], transcriptLost = true, seq = 0
```

### Live port (`apps/web/src/features/missions/live/LiveEvents.ts`)

```ts
type LiveStatus = 'connecting' | 'open' | 'closed';
interface LiveEvents {
  subscribe(opts: { missionId?: string; after?: number },
            handlers: { onEvent(e: MissionEvent): void; onResync(): void; onStatus(s: LiveStatus): void }): () => void;
}
// EventSourceLiveEvents: one EventSource per subscribe(); maps open/error to onStatus; parses `data` as MissionEvent; `resync` event → onResync.
// FakeLiveEvents: emit(event, { global?: boolean }) delivers to Mission subscribers of event.missionId and, when global, to global subscribers;
//                 setStatus(s) drives banners in tests; resync() triggers onResync.
```

### Stores (`apps/web/src/features/missions/model/types.ts`)

```ts
interface MissionsListState { missions: Record<string, MissionSummary>; connection: LiveStatus }
function applyMissionsListEvent(state, event: MissionEvent): MissionsListState;   // mission.started adds; mission.state / cost.updated / slot.started / mission.completed / mission.stopped patch; mission.dismissed removes
function groupMissions(state): { needsYou: MissionSummary[]; running: MissionSummary[]; finished: MissionSummary[] };  // each newest startedAt first
function needsYouCount(state): number;

interface PanelState {
  selection: { kind: 'slot'; name: string } | { kind: 'mission' };
  follow: boolean;                                          // true: selection tracks the current Slot
  tab: 'main' | 'question' | 'attention';
  expanded: Set<string>;                                    // executionIds the Commander opened; the current execution is always open
}
interface MissionPageState {
  status: 'loading' | 'ready' | 'absent';
  summary: MissionSummary; assembly: AssemblyFile; slots: Record<string, SlotRecord>;
  sections: TranscriptSection[]; current: ExecutionKey | null;
  pendingQuestion?: MissionDetail['pendingQuestion']; attention?: MissionDetail['attention']; result?: MissionDetail['result'];
  loopFiredAt: Record<string, number>;                      // looping Slot → Date.now() of the last firing, for the chord animation
  seq: number; connection: LiveStatus; panel: PanelState;
}
type MissionPageAction =
  | { type: 'init'; detail: MissionDetail } | { type: 'event'; event: MissionEvent } | { type: 'absent' } | { type: 'connection'; status: LiveStatus }
  | { type: 'selectSlot'; name: string } | { type: 'selectMission' } | { type: 'backToCurrent' } | { type: 'setTab'; tab: PanelState['tab'] }
  | { type: 'toggleSection'; executionId: string };
function reduceMissionPage(state, action): MissionPageState;
// Invariants: event.seq <= state.seq is ignored; slot.started opens a section, sets current, and moves the selection when follow;
// question.asked sets tab 'question'; mission.state needs_attention sets tab 'attention'; mission.completed sets selection 'mission' and follow false;
// question.answered / retry clear their tab back to 'main'.
```

### Clock decorations (`apps/web/src/features/missions/model/selectors.ts`, consumed by `features/clock`)

```ts
type SlotVisualState = 'pending' | 'running' | 'done' | 'failed';
interface MissionDecorations {
  slots: Record<string, { state: SlotVisualState; current: boolean; marker?: 'waiting' | 'attention'; attempts: number; cost: Cost }>;
  loops: Record<string, { iterations: number; limit: number; firedAt?: number }>;   // keyed by the looping Slot
  exitLit: string | null;                                                           // result.exitSlot
  core: { state: MissionState; cost: Cost };
}
function missionDecorations(state: MissionPageState): MissionDecorations;
// state rules: never started → pending; current while running or waiting → running; slot.done received and not re-entered → done;
// the Slot named in attention, or a Slot whose last execution ended without slot.done (a Loop fired or an Attempt failed) → failed.
```

### Shared clock (`apps/web/src/features/clock/ClockView.tsx`)

```ts
interface ClockViewProps {
  layout: ClockLayout; viewport: Viewport;
  core: ReactNode;                                                         // content of the centre circle
  card(slot: ClockLayout['slots'][number]): ReactNode;                       // card content per Slot
  cardProps?(name: string): React.HTMLAttributes<HTMLDivElement>;            // editor drag handlers, data-state attributes
  loops?: Record<string, { badge: ReactNode; highlighted?: boolean }>;       // keyed by the looping Slot; default badge "max N"
  exits?: Record<string, { label: string; highlighted?: boolean }>;
  overlays?: ReactNode;                                                      // extra SVG/HTML inside the transformed container (editor only)
  onSlotClick?(name: string): void; onCoreClick?(): void;
  selected?: string | 'core' | null;
}
function useClockViewport(layout: ClockLayout, viewport: Viewport): { transform: string; fit(): void; wheelHandlers; panHandlers; scale: number };
```

### Start Mission form (`apps/web/src/features/missions/start/schema.ts`)

```ts
const startMissionSchema = z.object({
  checkoutPath: z.string().min(1), taskPath: z.string().min(1), workItemId: z.string().trim().optional(),
  mayAskCommander: z.record(z.boolean()),
});
// Request body = { project, assembly, ...form }. Advanced toggles are marked "changed" when they differ from the effective Assembly value.
// localStorage key `suptron.startMission.<project>` holds { checkoutPath, taskPath }.
```

## Testing Strategy

Three levels, the highest available at each:

- **Pure modules, unit tests.** `applyMissionsListEvent` and `groupMissions`; `reduceMissionPage` with event scripts that read like the SPEC's scenarios ("reviewer fails three times, the chord shows 3 of 3, on the fourth the Mission is in Needs Attention with cause loop_limit, the Attention tab is open and the reviewer card is failed"); `missionDecorations`; `sectionTitle`; the server's `transcript-store` (sections, merge of tool results, trimming and `dropped`).
- **Web, through the HTTP API and the live port.** Vitest in jsdom with React Testing Library; the editors plan's `test/fake-server.ts` (msw) extended with a Missions section and a `FakeLiveEvents` registered through `LiveEventsProvider` by `renderWithProviders()`. A good test drives the page as the Commander and the fake server as the runtime: "render `/missions/r1` with a detail whose pending question has two options; choose the second and press Answer → the fake server received `POST /api/missions/r1/answer` with `{ 'Which DB?': 'Postgres' }`; it emits `question.answered` and `mission.state running` → the Question tab is gone, the banner is gone and the transcript shows the question and the answer under Attempt 1". Tests never call reducers from component tests and never read store internals.
- **Server, through `fastify.inject()`.** Routes with `FakeEngine` scripts, as in the POC plan's Stage 10: Dismiss semantics, `GET /api/missions` after Completed, the full `MissionDetail` after a Loop and a Retry, `?after=` replay and `resync`, the ledger recovery payload.

Prior art to copy: `apps/web/test/fake-server.ts` and the editors plan's Stage 8 and 11 component tests for page tests; `apps/server/test/routes/*.test.ts` and the POC plan's Stage 7 scenario tests for server tests; `features/assembly-editor/model/*.test.ts` for pure-module tests. Fixtures: `apps/web/test/fixtures/missions/` holds one `MissionDetail` per state (running on `implementer` after one Loop, waiting on `analyst`, needs_attention on `reviewer`, completed, stopped, interrupted) built from the primary-scenario Assembly.

## Stages

### Stage 1: Terminal Missions stay, Dismiss, Task fields on the summary

- **Goal:** the server knows every Mission since start and the Commander can Dismiss finished ones.
- **Depends on:** POC plan Stage 10.
- **Touches:** `packages/runtime/src/runner/MissionRegistry.ts`, `runner/ledger.ts`, `domain/mission.ts`, `events/mission-event.ts`, `apps/server/src/routes/missions.ts`, `docs/api.md`.
- **Steps:**
  1. `MissionSummary` gains `taskPath` and `workItemId`; `cost.estimated: true` is set by the registry.
  2. `MissionRegistry` keeps Completed and Stopped Missions in its map; `list()` returns all; `isCheckoutBusy()` and the `activeMissions` counts used by the editors' usage service consider active states only; `dismiss(id)` removes a terminal Mission and its ledger entry, emits `mission.dismissed`, refuses otherwise.
  3. Interrupted Missions from `recoverInterrupted()` live in the same map and are dismissable.
  4. `DELETE /api/missions/:id` with `204 | 404 | 409 { reason: 'not_finished' }`; `POST /api/missions` error bodies as in Interfaces.
  5. `docs/api.md` updated.
- **Verify:** route tests: a Mission driven to Completed by `FakeEngine` still appears in `GET /api/missions` and its Checkout is no longer busy; `DELETE` on it → 204 and it is gone; `DELETE` on a running Mission → 409; a stale ledger entry appears as Stopped `interrupted` and can be Dismissed; the summary carries `taskPath` and `workItemId`.

### Stage 2: Transcript sections, event amendments, complete Mission detail, sequence numbers

- **Goal:** `GET /api/missions/:id` plus `GET /api/events?mission=&after=` give a page everything it needs with no gap and no duplicate.
- **Depends on:** Stage 1.
- **Touches:** `packages/runtime/src/domain/transcript.ts`, `domain/mission.ts` (`MissionDetail`), `events/mission-event.ts`, `src/browser.ts`, `runner/Runner.ts` (emit the new fields), `runner/ledger.ts`, `apps/server/src/transcript-store.ts`, `sse.ts`, `routes/missions.ts`, `docs/api.md`.
- **Steps:**
  1. Define `ExecutionKey`, `TranscriptEntry`, `TranscriptSection`, `Question`, `sectionTitle`, `executionId`; export from `@suptron/runtime/browser` (the esbuild browser test must stay green).
  2. Runner emits `slot.started` with `loopFrom` and `note`, `question.answered` with `answers`, `mission.state needs_attention` with `slot` and `failedChecks`, `mission.state waiting_for_owner` with `slot`, `mission.completed` with `exitSlot` (and `pr: null` when none).
  3. `transcript-store.ts`: sections per execution; entries from `agent.text`, `agent.tool_call`, `agent.tool_result` (merged by `toolCallId`), `check.evaluated`, `question.asked`, `question.answered`, the `note` of `slot.started`, `agent.error`; trimming of non-current sections to 200 with `dropped`.
  4. `sse.ts`: `seq` per Mission assigned when the event is emitted (stored on the event), buffer per Mission, `?after=` replay, `resync` when `after` precedes the buffer; the global stream forwards list-relevant events including `mission.dismissed`.
  5. `GET /api/missions/:id` assembles `MissionDetail` (summary, the Assembly document stored at start, slots in Assembly order plus `core`, sections, `pendingQuestion`, `attention`, `result`, `seq`, `transcriptLost`).
  6. Ledger entries become `{ summary, assembly, slots }`, rewritten on the listed events; recovery produces `MissionDetail` with `transcriptLost: true`.
  7. `docs/api.md`: the transcript model, the event fields, `after` and `resync`.
- **Verify:** `transcript-store` unit tests (a Loop from reviewer to implementer opens a section titled "Loop 1 from reviewer"; a Retry opens "Attempt 2" whose first entry is the note; a tool result lands on its call; 250 entries in an earlier section → 200 kept and `dropped: 50`); route tests: after a Loop and a Retry with note the detail has the expected sections and `attention` is absent while `result` is present after Completed; `GET /api/events?mission=&after=<seq>` replays exactly the events after `seq`; `after` older than the buffer → first message is `resync`; a recovered Mission's detail has the Assembly, Slots and `transcriptLost: true`.

### Stage 3: Extract the shared clock

- **Goal:** `features/clock/` exists and the Assembly editor renders through it with no change in behaviour.
- **Depends on:** editors plan Stage 11; independent of Stages 1 and 2.
- **Touches:** `apps/web/src/features/clock/` (new), `features/assembly-editor/canvas/`, `features/assembly-editor/model/layout.ts`.
- **Steps:**
  1. Move `layoutClock`, `ClockLayout`, `Viewport` and `contextChords` helpers' geometry to `features/clock/layout.ts`; `model/layout.ts` re-exports them so no editor import changes in this step (expand).
  2. Create `useClockViewport`, `ClockView`, `Ring`, `StartMarker`, `CoreCircle`, `ForwardArrows`, `LoopChord`, `ExitArrow`, `CardShell` from the editor's canvas components, parameterised as in Interfaces; `LoopChord` and `ExitArrow` accept a `highlighted` flag; `CardShell` accepts `data-state` through `cardProps`.
  3. Rewrite the editor's `ClockCanvas` as a composition: `ClockView` with `overlays` = `PlusControl`s, `ContextChords`, the ghost Loop chord; `cardProps` = the ring-drag and failure-handle handlers; `card` = the editor's card content (migrate).
  4. Delete the now-unused editor copies (contract).
- **Verify:** every editors plan test of Stages 8, 9, 10 and 11 passes unchanged; `pnpm typecheck && pnpm lint` green; `features/clock` has no import from `features/assembly-editor` or `features/missions` (a lint rule or a grep in a test).

### Stage 4: Missions model, live port, provider and fake server section

- **Goal:** the client can hold the Missions list and one Mission page as live state, fully tested without components.
- **Depends on:** Stage 2 (types), Stage 3 (nothing in code; placed after it so the app builds).
- **Touches:** `features/missions/model/`, `features/missions/live/`, `features/missions/MissionsProvider.tsx`, `api/missions.ts`, `test/fake-server.ts`, `test/fixtures/missions/`, `test/render.tsx` (`renderWithProviders` gains `LiveEventsProvider` with a `FakeLiveEvents`).
- **Steps:**
  1. `api/missions.ts`: `listMissions`, `getMission`, `startMission` (typed `MissionValidationError`, `CheckoutBusyError`), `stopMission`, `retryMission`, `answerMission`, `dismissMission`.
  2. `LiveEvents`, `EventSourceLiveEvents`, `FakeLiveEvents`, `LiveEventsProvider` + `useLiveEvents()`.
  3. `types.ts`, `missions-list-reducer.ts`, `mission-reducer.ts`, `selectors.ts` as in Interfaces, including `missionDecorations`, `missionTitle`, `taskName` (basename of `taskPath`, plus the Work Item ID).
  4. `MissionsProvider` with an external store (`useSyncExternalStore`), `useLiveMissions()` (fetch `GET /api/missions`, subscribe globally, on reconnect refetch and replace), `useNeedsYouCount()`, document title prefix.
  5. `useLiveMission(id)`: fetch → `init`, subscribe with `after`, `onResync` and reconnect → refetch and `init`, `404` → `absent`.
  6. Fake server Missions section and the six `MissionDetail` fixtures.
- **Verify:** reducer tests for every SPEC scenario listed in Testing Strategy, plus: events with `seq <= state.seq` are ignored; `init` after a reconnect replaces sections without duplicates; `follow` moves the selection on `slot.started` and a pinned selection does not move; Completed selects `mission`. `groupMissions` ordering and `needsYouCount`. A hook test with `FakeLiveEvents`: `setStatus('closed')` then `'open'` triggers one refetch.

### Stage 5: Missions list, navigation badge, tab title

- **Goal:** `/missions` is the overview of SPEC FR-6 to FR-12.
- **Depends on:** Stage 4.
- **Touches:** `features/missions/list/`, the shell navigation, `components/CostLabel.tsx`, `components/RelativeTime.tsx`, `components/StateBadge.tsx`.
- **Steps:**
  1. `MissionsListPage` with the three groups in order (Needs you, Running, Finished), each row: Project / Assembly, Task name with Work Item ID, branch, current Slot (none when finished), `StateBadge` (with the "interrupted" note), `CostLabel` (tokens on hover), `RelativeTime`; the row links to `/missions/:id`.
  2. `DismissButton` on Completed and Stopped rows (`DELETE`); nothing else actionable.
  3. `EmptyMissionsHint` with a link to `/projects`.
  4. Navigation entry shows `needsYouCount` when above zero; `document.title` prefix `(N) `; `MissionsPlaceholderPage` removed.
- **Verify:** component tests with the fake server: three fixtures in three states render in the right groups and order; a `mission.state waiting_for_owner` event moves a Mission to Needs you, the badge shows 1 and the title starts with "(1) "; Dismiss sends `DELETE` and the row disappears on `mission.dismissed`; the empty state shows the hint and the link; an interrupted Mission shows the note and no current Slot.

### Stage 6: Launch buttons and the Start Mission dialog

- **Goal:** a Mission starts from the Projects page or the editor in a few seconds (FR-1 to FR-5).
- **Depends on:** Stage 5.
- **Touches:** `features/missions/start/`, `features/projects/ProjectsPage.tsx`, `features/assembly-editor/AssemblyEditorPage.tsx`.
- **Steps:**
  1. `ProjectsPage` rewritten: every Project expanded with its Assemblies from `GET /api/projects` (name, status badge, active Missions, a link to the editor); valid Assemblies get `LaunchButton`; invalid and unparseable ones show the first issue as the reason instead.
  2. `LaunchButton` in the editor header, disabled with a tooltip while invalid or dirty.
  3. `StartMissionDialog` (shadcn `Dialog`): `CheckoutSelect` (path and branch; busy entries disabled and labelled with the busy Mission's title from `useMissionSummary`; a Checkout read error shown in place of the list and Start disabled), Task location through `PathField` (absolute, file or folder, must exist), Work Item ID, `AdvancedToggles` collapsed by default with one switch per Slot prefilled from the effective Assembly value and a "changed" mark.
  4. `useStartMissionPrefill` with `localStorage`; prefill skipped when the Checkout is busy.
  5. Start: `POST /api/missions`; `400` issues to their fields, `409` to the Checkout field plus a Checkouts refetch; success stores the prefill and navigates to `/missions/:id`.
- **Verify:** component tests: the Projects page shows the primary-scenario Assembly with a Launch button and an invalid fixture Assembly without one and with its reason; opening the dialog lists two Checkouts, the busy one disabled with the Mission's title; a non-existent Task path blocks Start with the field error; the request body contains the toggles with `analyst: true` and the rest false; a fake `409` marks the Checkout field and refetches; a second opening is prefilled; the editor header button is disabled while dirty.

### Stage 7: Mission page shell, header, read-only clock, Stop

- **Goal:** the Mission page shows where the Mission is (FR-13 to FR-18, FR-30, FR-35).
- **Depends on:** Stage 6 (navigation target), Stage 3 (clock).
- **Touches:** `features/missions/page/`, router.
- **Steps:**
  1. `MissionPage` uses `useLiveMission(id)`; `loading`, `absent` (`AbsentMissionPage` with the link to the list) and `ready` layouts; the page title is `missionTitle`.
  2. `MissionHeader`: Project / Assembly, Task name and Work Item ID, Checkout path and branch, `StateBadge`, `CostLabel` marked as estimate, the Pull Request link when known, Stop button in every non-terminal state, Dismiss button in terminal states (navigates to the list).
  3. `StopMissionDialog` (shadcn `AlertDialog`) with the SPEC's wording; confirm → `POST /stop`.
  4. `MissionClock`: `layoutClock(state.assembly)` + `missionDecorations(state)` into `ClockView`; `MissionSlotCard` (name, Unit when different, state styling with a pulse animation while running, Attempt counter when attempts > 1, cost, the waiting and attention markers); `MissionCoreContent` (state and total cost); Loop badges "i / limit" with a one-shot highlight keyed on `firedAt`; Exit arrow highlighted when `exitLit`; zoom, pan and Fit kept; no palette, no inspector, no drag, no `PlusControl`.
  5. Clicking a Slot dispatches `selectSlot`; clicking the centre dispatches `selectMission` (the panel itself comes in Stage 8).
- **Verify:** component tests with the fixtures: the running fixture renders six cards, the implementer card is `running` and current with "Attempt 2" absent and the reviewer chord showing "1 / 3"; the needs_attention fixture marks the reviewer card `failed` with the attention marker; the completed fixture highlights `pr-reviewer`'s Exit arrow and the header shows the PR link; Stop opens the dialog and confirm sends `POST /stop`; a `404` renders `AbsentMissionPage`; the document title reads "feature · my-task · Suptron" with no count prefix while nothing needs the Commander.

### Stage 8: Side panel, transcript, Mission-level view

- **Goal:** the Commander reads what any Slot did and what the Mission is as a whole (FR-19 to FR-24).
- **Depends on:** Stage 7.
- **Touches:** `features/missions/panel/`, `components/Markdown.tsx`.
- **Steps:**
  1. `SidePanel`: right side, pointer-dragged divider, collapse button, width and collapsed flag in `localStorage`; tabs: the selected Slot's name or "Mission", plus Question and Attention when present (Stage 9).
  2. Panel header: when pinned, "Back to current" dispatches `backToCurrent`.
  3. `TranscriptView` for the selected Slot: `sectionsOf(slot)` in time order; `ExecutionSection` headed by `sectionTitle`, collapsed unless current or expanded, unmounted while collapsed, with a "N earlier entries were dropped" line when `dropped > 0`; the sections of earlier Slots collapsed by default.
  4. Entries: `TextEntry` (`Markdown`), `ToolCallEntry` (collapsed row with name and a one-line input summary, expands to input and result, red when `isError`), `CheckEntry` (summary via `summarizeCheck`, pass or fail, detail on fail), `QuestionEntry`, `AnswerEntry`, `NoteEntry`, `ErrorEntry`; rows with `content-visibility: auto`.
  5. `useAutoScroll`: stick to the bottom while at the bottom, stop on scroll-up, "Follow" button to resume.
  6. `MissionLevelView`: state with cause, total cost, Core's explanation when present, final report (`Markdown`) when Completed, PR link or "no Pull Request was opened", `SlotsTable` (Assembly order: Attempts, Loops, cost; `core` row with cost only).
  7. A `transcriptLost` Mission shows the lost-transcript note instead of sections.
- **Verify:** component tests: the running fixture opens the panel on `implementer` with sections "Attempt 1" (collapsed) and "Loop 1 from reviewer" (open); clicking `analyst` pins it and shows "Back to current"; a `slot.started` for `tester` while pinned does not change the selection, and does after "Back to current"; an `agent.text` event appends a row and the view stays at the bottom; after a programmatic scroll up a new entry does not move the scroll and "Follow" restores it; a tool call row expands to its input and error; a section with `dropped: 50` says so; the centre click opens the Mission-level view with the Slots table including `core`; the interrupted fixture shows the lost-transcript note.

### Stage 9: Question tab, Attention tab, Completed and Stopped layouts

- **Goal:** the Commander answers, retries, and reads the end of a Mission (FR-25 to FR-29, FR-31, FR-32).
- **Depends on:** Stage 8.
- **Touches:** `features/missions/panel/QuestionTab.tsx`, `AttentionTab.tsx`, `features/missions/page/MissionBanner.tsx`, `MissionPage.tsx`.
- **Steps:**
  1. `MissionBanner` over the clock: waiting ("Waiting for your answer on <Slot>"), needs attention ("Needs attention: <cause in words> on <Slot>"), stopped ("Stopped" with the interrupted note when present), connection lost (Stage 10).
  2. `QuestionTab`: every question with header, text, options with descriptions as radio or checkbox groups, an "Other" free text under each; one Answer button; answers assembled as `Record<question, string>` (multiple choice joined with ", "); `POST /answer`; the tab disappears on `question.answered`.
  3. `AttentionTab`: cause in words (map of `NeedsAttentionCause` to the SPEC's phrases), the explanation, failed Checks with details, a note textarea, Retry (`POST /retry { note }`) and Stop (opens `StopMissionDialog`); the tab disappears on `slot.started`, which also resumes following so the new Attempt's transcript shows.
  4. Completed: the reducer already selects `mission`; `MissionLevelView` shows the PR link, report and table; Slots remain clickable.
  5. Stopped: the Stopped banner; the transcript is read-only (it already is); Stop and Retry hidden; Dismiss shown.
- **Verify:** component tests: the waiting fixture shows the banner, the marked card and the Question tab in front; choosing options and pressing Answer posts the expected body; the fake server's `question.answered` + `mission.state running` remove the tab and the transcript shows the question and the answers; the needs_attention fixture shows the Attention tab with cause "Loop limit reached", the explanation and two failed Checks; Retry with a note posts it and the following `slot.started` (attempt 3, note) opens "Attempt 3" headed by the note with the tab gone; Stop from the tab opens the confirmation; a `mission.completed` event opens the Mission-level view with the report and lights the Exit arrow; a `mission.stopped` event shows the Stopped banner and hides Stop.

### Stage 10: Connection loss, resync, absence, Dismiss from the page

- **Goal:** the page never shows stale or dead state as live (FR-33 to FR-35).
- **Depends on:** Stage 9.
- **Touches:** `features/missions/live/useLiveMission.ts`, `useLiveMissions.ts`, `MissionBanner.tsx`, `MissionHeader.tsx`, `MissionsListPage.tsx`.
- **Steps:**
  1. Connection banner on the Mission page and a smaller notice on the Missions list while `connection === 'closed'`; cleared on `open`.
  2. On reopen and on `resync`: refetch and re-init both stores; the page keeps the panel selection when the selected Slot still exists.
  3. `mission.dismissed` for the open Mission, or a `404` on refetch, switches the page to `AbsentMissionPage`.
  4. Dismiss in the header of a finished Mission → `DELETE`, then navigate to `/missions`.
- **Verify:** component tests: `setStatus('closed')` shows the banner; `setStatus('open')` refetches once and the banner is gone; a `resync` refetches; a detail that changed between fetches (new section) is reflected without duplicating entries; `mission.dismissed` for the open Mission shows the absent page with the link; Dismiss from the header navigates to the list and the list no longer shows the Mission. `pnpm typecheck && pnpm test && pnpm lint` green across the workspace.

## Risks and Rollback

- **Duplicated or missing transcript entries around reconnects.** Detect: Stage 4 reducer tests on `seq` and Stage 10 reconnect tests. Back out: the dedupe rule lives in one place (`applyMissionEvent`); if the server's `seq` proves unreliable, the client falls back to a full refetch on every reconnect, which is already the behaviour, and drops buffered events instead of applying them.
- **Server memory with terminal Missions kept.** Transcripts of finished Missions stay until Dismiss. Detect: process memory in a long session with many Missions. Back out: trim every section of a terminal Mission to 200 entries on completion (same rule as earlier Slots); the SPEC allows dropped entries as long as the section says so.
- **The clock extraction breaks the editor.** Detect: the editors plan's tests in Stage 3. Back out: Stage 3 is one commit on its own; revert it and build the Mission clock on a copy of the primitives (temporary duplication, to be removed later).
- **Large transcripts slow the page.** Detect: a manual check with a fixture of 5,000 entries in the current section (add it to `test/fixtures/missions/` for this purpose). Back out: introduce `@tanstack/react-virtual` for the open section only; the entry components do not change.
- **`EventSource` reconnect behaviour differs between browsers** (retry delay, `Last-Event-ID`). The design does not depend on either: every reopen refetches. Detect: Stage 10 tests cover the logic; a manual check in the Commander's browser covers the real `EventSource`.
- **Effective `mayAskCommander` computed on the client drifts from the server's snapshot.** Both use `DEFAULTS` from `@suptron/runtime/browser` and the same precedence. Detect: a unit test in Stage 6 comparing the dialog's defaults with `buildSnapshot()` output for the primary-scenario fixture.
- **Rolling back a stage.** Each stage is one commit. Stages 1 and 2 only change the server and `runtime` and keep the old routes working; Stage 3 is isolated; Stages 4 to 10 add under `features/missions` except the Projects page rewrite and the editor header button in Stage 6, which revert cleanly with that commit.

## Contract amendments

Written into ../suptron-poc/PLAN.md (sections marked "(missions-ui)"), ./SPEC.md (the Constraints line) and ../assembly-editors/PLAN.md (header note) on 2026-10-22. Kept here as the checklist of what this plan changed in the earlier contracts:

1. `MissionSummary` gains `taskPath` and `workItemId?`; `cost` carries `estimated: true`.
2. `TranscriptEntry`, `TranscriptSection`, `ExecutionKey` and `Question` are defined as above; `GET /api/missions/:id` returns `MissionDetail` (Assembly document, sections, `transcriptLost`, `pendingQuestion`, `attention`, `result`, `seq`).
3. Events: `seq` on every event; `slot.started` gains `loopFrom?` and `note?`; `question.answered` gains `slot` and `answers`; `mission.state` gains `slot?` and `failedChecks?`; `mission.completed` gains `exitSlot` and `pr: PullRequestRef | null`; new `mission.dismissed`.
4. `GET /api/events` accepts `after=<seq>` and may send `event: resync`.
5. `POST /api/missions` error bodies: `400 { issues: [{ field, message }] }`, `409 { reason: 'checkout_busy', missionId }`; `DELETE /api/missions/:id` → `204 | 404 | 409 { reason: 'not_finished' }`.
6. The ledger entry is `{ summary, assembly, slots }`, rewritten on start, `slot.started`, `slot.done` and terminal states.
7. The missions-ui SPEC Constraints: "the screens consume the POC contract and may extend it only by the Dismiss call and by the Missions route returning every Mission known since start" becomes "… and by the data the Mission page needs on reload, as listed in ./PLAN.md".

## Out of Scope

- A browser end-to-end test (Playwright) and a fake-Engine demo mode of the server; the three test levels above are the whole safety net.
- Mission history, persistence of transcripts, search, filtering or sorting in the list, cost reports, export.
- Streaming of partial agent text (token by token); entries are whole text blocks as the Engine Adapter emits them.
- Showing the Core's own transcript; only its explanation and report are shown.
- Starting a Mission from anywhere but an Assembly's Launch button; pausing, resuming, editing settings mid-mission; any mid-mission instruction other than the Retry note.
- Notifications outside the UI; sounds; multiple users.
- Editing the Assembly from the Mission page; a view of the Laws.
- Remembering which Projects are expanded; any `localStorage` use beyond the three conveniences named in Summary decision 5.
