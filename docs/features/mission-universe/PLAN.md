# Mission Universe: Implementation Plan

**SPEC:** ./SPEC.md
**DESIGN:** ./DESIGN.md
**ADRs:** ../../adr/0014-universe-beside-the-clock.md, ../../adr/0015-three-js-in-one-module.md, ../../adr/0016-a-fleet-not-a-robot.md, ../../adr/0017-three-js-without-a-react-layer.md, ../../adr/0018-one-picture-model-for-every-view.md
**Status:** Stages 1 to 9 done; Stage 10 is next (see Progress).

## Progress

- **Stages 1 to 9: done.** `mise run check` passes. The Universe runs on placeholder shapes; the Commander has looked at it on the demo voyage and finds it fine so far.
- **Not checked by the implementer in a browser** (the Commander may tick them while clicking the demo): Stage 4, twenty switches without a WebGL warning, the context-loss fallback, the failed-download fallback; Stage 9, `renderer.info.memory` before disposal.
- **Added beside the plan: the demo voyage.** `mise run demo` starts a server with the FakeEngine in a fresh temp home (`apps/server/src/demo.ts`) and the web UI; the scenario is `packages/runtime/src/testing/demo-scenario.ts` and is tested in `packages/runtime/test/demo-scenario.test.ts`. Start a Mission of Project `demo`, Assembly `demo-voyage`; answer the question on `scout`, Retry on `tester`. `SUPTRON_DEMO_PACE` sets the speed (1 is watching speed). Use it wherever this plan says "a real Mission".
- **Next: Stage 10**, step 1 (try to download the Quaternius packs). Then Stage 11.

## Summary

The Mission page gets a second view of a Mission, the Universe, beside the clock. Read `DESIGN.md` before starting: it holds the decisions and their reasons, and this plan does not repeat them. Use the words of `../../GLOSSARY.md`.

The work has four parts, built in this order:

1. **The picture model.** A new folder with the types of the picture and one pure function from the state of the Mission page to the picture. The Mission's adapter of the clock is rewritten to draw it. Nothing changes for the Commander; this is rework the Universe stands on, so it lands first.
2. **The Core at work.** The runtime starts to report the Core's signs of life and the end of each call of the Core; the page reducer keeps them; the picture model gets the field.
3. **The Universe on placeholders.** The module `features/universe` in plain three.js: the page switch with its remembered choice, lazy loading, the fallback to the clock, the scene, the view objects, the camera, the pointer, the labels, the motion. Every object is a simple shape (box, cone, ring), so all of the SPEC's functions can be seen and clicked before a single model file exists.
4. **The models and the look.** Candidate models are put into the picture and the Commander chooses; then the look is tuned with the Commander watching. These two stages end on the Commander's word.

There are two stages where the implementer stops and waits for the Commander (Stages 10 and 11). Everything before them is done without asking.

## Rules the Implementer Must Not Break

- **Only `apps/web/src/features/universe/` imports `three`.** An ESLint rule enforces it (Stage 4). The page reaches the module only through `React.lazy`; from outside, only `import type` of its types is allowed, or three.js lands in the main bundle. (DESIGN, "Settled by Convention"; ADR-0015.)
- **No react-three-fiber, no drei, no other wrapper of three.js, no post-processing library.** (ADR-0017; DESIGN, "Settled by Convention".)
- **The picture model is never changed in place and holds no flags, caches or timers.** A view object learns of a change only by comparing the values it was handed with the values it applied last. No "dirty" flag, no subscription, no command from the reducer. (ADR-0018.)
- **A view reads the Mission only through the picture model and the selection.** No view takes `ReadyMissionState`. A new fact for the picture is a new field of the model, filled in `missionPicture`. (ADR-0018.)
- **The picture model speaks the words of the Mission.** No "ship", "dock", "monolith", colour, size or duration in `features/missions/picture/`. Those words live only in `features/universe/world/`. (DESIGN, "Settled by Convention".)
- **The folder `features/missions/picture/` imports nothing from React, the browser or a drawing library.** Types of `@suptron/runtime/browser` and of `../model/types` only.
- **Selection is not in the picture model**, and the scene remembers no click of its own: the mark follows the `selection` it is handed. (DESIGN, "Settled by Convention".)
- **Everything about the look is in `features/universe/world/`**: no colour, size, distance, duration or model path as a literal anywhere else in the module. (SPEC NFR-5.)
- **Creating and destroying the scene is exactly symmetrical.** React StrictMode mounts twice in development; every listener, observer, frame request, geometry, material, texture and the renderer itself is released in `dispose()`. (ADR-0017.)
- **The clock looks and behaves as today**, and `apps/web/src/features/clock/` and the Assembly editor are not touched. (SPEC, Constraints.)
- **Nothing is fetched from the internet at run time.** Model files are in the repository and imported as assets of the lazy chunk. (DESIGN, "Settled by Convention".)
- **Never commit.** The Commander commits. "Roughly one commit" below describes the size of a stage.

## Module Map

### The picture model: `apps/web/src/features/missions/picture/` (new)

- `types.ts`: the types of the picture (see Interfaces).
- `mission-picture.ts`: `missionPicture(state)`, the one pure function; `elementKey(ref)`; `loopBadge(iterations, limit)` (moved from `model/selectors.ts`: the text of a Loop's counter is the same in every view).
- `index.ts`: re-exports the two files.

May import: types and constants of `@suptron/runtime/browser`; `../model/types`; `slotUnderWay` from `../model/selectors`. Must not import: React, `window`/`document`, `three`, anything of `features/clock` or `features/universe`.

### The page reducer: `apps/web/src/features/missions/model/` (existing, changed)

- `types.ts`: `ReadyMissionState` gains `coreActivity?: LiveActivity`.
- `mission-reducer.ts`: keeps and drops `coreActivity`.
- `selectors.ts`: loses `missionDecorations`, `MissionDecorations` and `loopBadge` (Stage 2).

### The Mission page: `apps/web/src/features/missions/page/` (existing, changed)

- `MissionClock.tsx` (reworked): draws a `MissionPicture` with `ClockView`.
- `MissionPage.tsx` (changed): computes the picture once, owns the choice and the fallback, renders `MissionPictureArea`.
- `MissionPictureArea.tsx` (new): the area where the clock was. Shows the switch, and either the clock or the lazily loaded Universe; shows the loading note and the line with the reason of a fallback.
- `picture-choice.ts` (new): the remembered choice, in the pattern of `apps/web/src/appearance.ts`.
- `UniverseBoundary.tsx` (new): an error boundary (a class component: React has no other way) that turns a failed download of the module or an error while rendering it into a failure reported to the page.

May import from `features/universe`: types only, plus the one `React.lazy(() => import('../../universe'))`.

### The Universe module: `apps/web/src/features/universe/` (new)

- `index.ts`: `export { Universe as default }` for `React.lazy`, and the types of `types.ts`.
- `types.ts`: `UniverseProps`, `UniverseFailure`. No import of `three`, so the page can import the types.
- `Universe.tsx`: the React shell. Mounts the canvas and the label layer; checks WebGL 2; loads the assets; creates, updates and destroys the scene; turns the scene's reports into props for the labels.
- `labels/Labels.tsx` and one small component per kind of label: the HTML layer. Reads the picture and the world's rules for zoom. No import of `three`.
- `scene/scene.ts`: `createUniverseScene(options)`: renderer, camera, controls, frame loop, resize, pointer, the index from element key to view object, the screen positions of the labels, `dispose`.
- `scene/layout.ts`: the pure function that places the Core, the docks and what belongs to each dock. Not `layoutClock`.
- `scene/assets.ts`: loads what the world names (Stage 10; before that the world needs no files) and frees it.
- `scene/compare.ts`: the shallow comparison of two flat records that every view object uses.
- `objects/`: one file per kind: `core-object.ts`, `slot-object.ts`, `sub-pilot-object.ts`, `side-slot-object.ts`, `loop-object.ts`, `exit-point-object.ts`, and `view-object.ts` with their common interface. A Slot's object owns the objects of its Sub-pilots, Side Slots, Loop and Exit Point.
- `world/`: everything about the look: `world.ts` (palette, lights, fog, sizes, distances, durations, the camera's settings, the zoom from which a label shows its details), `ships.ts` (how a Unit's name picks a ship), `models.ts` (which file draws what; placeholders until Stage 10), `assets/` (the model files and `CREDITS.md`).

Inside the module only `scene/`, `objects/` and `world/` import `three`. `Universe.tsx` and `labels/` talk to the scene through the interface of `scene/scene.ts` (types and the factory) and do not use three.js classes themselves.

### The runtime and the server (existing, changed slightly)

- `packages/runtime/src/events/mission-event.ts`: the new event `core.idle`; `isEphemeralEvent`.
- `packages/runtime/src/core-agent/index.ts`: the option `onCallEnd`.
- `packages/runtime/src/runner/runner.ts`: two methods that turn the Core's signals into Mission events.
- `packages/runtime/src/runner/mission-registry.ts`: `engage()` connects `onEvent` and `onCallEnd`.
- `apps/server/src/sse.ts`: uses `isEphemeralEvent`.
- `docs/api.md`: the event list.

## Interfaces and Contracts

### The picture model (`features/missions/picture/types.ts`)

```ts
/** A reference to an element in the words of the Mission. The first four are what the page can select. */
export type ElementRef =
  | PanelSelection // { kind: 'mission' } is the Core
  | { kind: 'loop'; slot: string } // the looping Slot
  | { kind: 'exitPoint'; slot: string };

export interface MissionPicture {
  /** `low` for a Stopped Mission and one Waiting for usage. */
  power: 'normal' | 'low';
  /** True in Needs Attention. */
  alarm: boolean;
  core: CorePiece;
  /** In Assembly order. */
  slots: readonly SlotPiece[];
}

export interface CorePiece {
  kind: 'core';
  ref: { kind: 'mission' };
  state: MissionState;
  /** The Core's own spend, not the Mission total. */
  cost: Cost;
  atWork: boolean;
  /** ISO time; present only in Waiting for usage. */
  usageResetsAt?: string;
}

export interface SlotPiece {
  kind: 'slot';
  ref: { kind: 'slot'; name: string };
  name: string;
  unit: string;
  index: number;
  state: SlotVisualState;
  current: boolean;
  marker?: 'waiting' | 'attention';
  attempts: number;
  skipped: number;
  cost: Cost;
  subPilots: readonly SubPilotPiece[];
  sideSlots: readonly SideSlotPiece[];
  loop?: LoopPiece;
  exitPoint?: ExitPointPiece;
}

export interface SubPilotPiece {
  kind: 'subPilot';
  ref: { kind: 'subPilot'; slot: string; unit: string };
  unit: string;
  status: 'idle' | 'running' | 'done';
}

export interface SideSlotPiece {
  kind: 'sideSlot';
  ref: { kind: 'sideSlot'; name: string };
  name: string;
  unit: string;
  /** `idle` until the Side Slot was started for the first time. */
  status: 'idle' | SideSlotStatus;
}

export interface LoopPiece {
  kind: 'loop';
  ref: { kind: 'loop'; slot: string };
  to: string;
  iterations: number;
  limit: number;
  /** Date.now() of the last firing, as the reducer recorded it. */
  firedAt?: number;
}

export interface ExitPointPiece {
  kind: 'exitPoint';
  ref: { kind: 'exitPoint'; slot: string };
  /** True when the Mission left through this Exit Point. */
  lit: boolean;
}
```

```ts
// features/missions/picture/mission-picture.ts
export function missionPicture(state: ReadyMissionState): MissionPicture;
/** A stable string per element: 'core', 'slot:<name>', 'subPilot:<slot>/<unit>', 'sideSlot:<name>', 'loop:<slot>', 'exitPoint:<slot>'. */
export function elementKey(ref: ElementRef): string;
export function loopBadge(iterations: number, limit: number): string;
```

Rules of `missionPicture`, all taken from today's code and none invented:

- `SlotPiece.state`, `current`, `marker`, `attempts`, `skipped`, `cost`: exactly what `missionDecorations` computes today (`model/selectors.ts`).
- `SlotPiece.unit`: `slot.unit` of the Assembly.
- `SubPilotPiece.status`: from `state.slots[slot].subPilots`: no record or `calls === 0` is `idle`; `returns > 0` is `done`; otherwise `running` (today's `plateStatus` in `MissionClock.tsx`). One piece per `slot.subPilots` of the Assembly, in that order.
- `SideSlotPiece`: one per `slot.sideSlots` of the Assembly, named by `sideSlotName`; `status` is the record's in `state.sideSlots`, `idle` when there is no record.
- `LoopPiece`: only for a Slot with `loop`; `to` is `loop.target`; `iterations`, `limit`, `firedAt` as `missionDecorations` computes them.
- `ExitPointPiece`: for a Slot with `exitPoint === true` and for the last Slot (the rule `layoutClock` uses); `lit` when `state.result?.exitSlot` is this Slot.
- `power`: `low` when `summary.state` is `stopped` or `waiting_for_usage`. `alarm`: `summary.state === 'needs_attention'`.
- `CorePiece.cost`: `state.slots[CORE_SLOT_NAME]?.cost ?? ZERO_COST`. `usageResetsAt`: `summary.usageResetsAt`.
- `CorePiece.atWork`: `state.coreActivity !== undefined && summary.state === 'running'` (constant `false` until Stage 3).

### The Core at work (runtime)

```ts
// packages/runtime/src/events/mission-event.ts, added to the MissionEvent union
/** A call of the Core has ended, by a result or by an error. Ephemeral, like `agent.activity`. */
| { type: 'core.idle'; missionId: string; seq: number }

/** True for an event that is sent live and never stored or replayed. */
export function isEphemeralEvent(event: Pick<MissionEvent, 'type'>): boolean; // 'agent.activity' | 'core.idle'
```

- The Core's signs of life use the existing event: `agent.activity` with `slot: CORE_SLOT_NAME`. Only the Core's `activity` events are forwarded; its text and tool calls are not (the Core has no transcript section).
- `EngineCoreAgentOptions` gains `onCallEnd?: () => void`, called in a `finally` of `EngineCoreAgent.call()` (not of `tryCall`): once per call of the Core, whatever its outcome and however many Engine turns it took.
- `Runner` gains `reportCoreEvent(event: AgentEvent): void` (emits `agent.activity` for an `activity`, ignores the rest) and `reportCoreIdle(): void` (emits `core.idle`). Neither emits once the Mission is Stopped or Completed, so `mission.stopped` and `mission.completed` stay the last events of a Mission.
- `core.idle` is not in `GLOBAL_STREAM_EVENT_TYPES` and not in `LEDGER_EVENT_TYPES`.

### The Core at work (page reducer)

- `agent.activity` with `slot === CORE_SLOT_NAME` sets `coreActivity` (same shape and the same "keep `since` while the phase is the same" rule as `activity`) and does not touch `activity`. This case comes before the existing check, which would otherwise take the Core for the current Slot.
- `core.idle` drops `coreActivity`. So do `mission.stopped`, `mission.completed`, `mission.resumed` and `init` (a fresh detail knows no activity).
- `liveRow` is not changed in Stage 3.

### The Universe module, seen from the page (`features/universe/types.ts`)

```ts
export type UniverseFailure = 'no-webgl2' | 'model-load' | 'context-lost';

export interface UniverseProps {
  picture: MissionPicture;
  selection: PanelSelection;
  /** A click on an object or on its label. Loops and Exit Points are not reported. */
  onSelect(selection: PanelSelection): void;
  /** Called once; the page then shows the clock. */
  onFailure(failure: UniverseFailure): void;
}
```

The page adds two failures of its own, caught by `UniverseBoundary`: `module-load` (the lazy chunk did not download) and `crashed` (an error while rendering). The text of each reason is a table on the page (`MissionPictureArea.tsx`), one short sentence each.

### The page side

```ts
// features/missions/page/picture-choice.ts
export type PictureChoice = 'universe' | 'clock';
export function usePictureChoice(): PictureChoice; // 'universe' when nothing is stored
export function setPictureChoice(choice: PictureChoice): void;
// localStorage key: 'suptron-mission-picture'

// features/missions/page/MissionClock.tsx
export interface MissionClockProps {
  /** Only for `layoutClock`: the geometry of the clock is computed from the Assembly. */
  assembly: AssemblyFile;
  picture: MissionPicture;
  selection: PanelSelection;
  onSelect(selection: PanelSelection): void;
  viewport?: Viewport;
}
```

`MissionPage` computes `const picture = useMemo(() => missionPicture(state), [state])` once and turns a selection into the existing action (`selectSlot`, `selectMission`, `selectSideSlot`, `selectSubPilot`) in one small function. Both views get the same `picture`, `state.panel.selection` and `onSelect`.

### The scene (`features/universe/scene/scene.ts`)

```ts
export interface UniverseSceneOptions {
  canvas: HTMLCanvasElement;
  /** The element whose size the scene follows. */
  container: HTMLElement;
  picture: MissionPicture;
  selection: PanelSelection;
  assets: LoadedAssets;
  /** The label of an element, by `elementKey`; the scene writes its position each frame. */
  labelElement(key: string): HTMLElement | null;
  onSelect(selection: PanelSelection): void;
  /** Called when the zoom changes; 1 is "the whole Assembly in view". */
  onZoom(zoom: number): void;
  onFailure(failure: UniverseFailure): void;
}

export interface UniverseScene {
  /** A new picture or a new selection; the scene hands every view object its piece. */
  update(picture: MissionPicture, selection: PanelSelection): void;
  /** Marks an element as under the pointer from outside the canvas (a label); null clears it. */
  hover(ref: ElementRef | null): void;
  /** Back to "the whole Assembly in view". */
  fit(): void;
  dispose(): void;
}

export function createUniverseScene(options: UniverseSceneOptions): UniverseScene;
```

### The view objects (`features/universe/objects/view-object.ts`)

```ts
export interface ViewObject<Piece> {
  /** What the scene adds to its graph. */
  readonly root: Object3D;
  /** The meshes the pointer can hit; empty for a Loop and an Exit Point. */
  readonly targets: readonly Object3D[];
  /** Takes the piece and its marks; sets targets to move towards, never jumps. */
  apply(piece: Piece, marks: { selected: boolean; hovered: boolean }): void;
  /** Lives one frame: moves towards the targets, hovers, pulses. `now` is Date.now(). */
  frame(now: number, deltaSeconds: number): void;
  dispose(): void;
}
```

How a change reaches an object: `apply` computes a small flat record of plain values (the target look: colours, intensities, on or off) from the piece, the marks and the world, compares it with the record it applied last (`scene/compare.ts`), and does nothing when they are equal. The picture's `power` and `alarm` are handed to every object as part of its piece's input, not read from anywhere else.

A fired Loop: `loop-object` reads `firedAt` and, in `frame`, shows the flash while `now - firedAt` is less than the world's duration. No timer, no flag.

### The world (`features/universe/world/`)

One exported constant `WORLD` (typed, `as const`) and two functions: `shipFor(unitName: string): number` (the index of a ship: a 32-bit FNV-1a hash of the name, modulo the number of ships, so the same Unit has the same ship after every reload) and `labelDetail(zoom: number): 'far' | 'close'`.

## Decisions Made While Planning

- **The end of a call of the Core is an event of its own, `core.idle`.** Agreed with the Commander in this session and written into the DESIGN ("The Core at work is a field of the model, filled by the server"). Without it nothing tells the page that the Core stopped: a Pilot's sign of life is ended by the next transcript entry, and the Core writes none.
- **The existing page tests choose the clock in the shared setup.** Agreed with the Commander and written into the DESIGN ("Testing Seams"). `apps/web/test/setup.ts` writes the choice to `localStorage` at its top level (before the application's modules are imported) and again in a `beforeEach`, because its `afterEach` clears the storage.
- **Where the model files come from.** Agreed with the Commander: in Stage 10 the implementer tries to download the CC0 packs of Quaternius itself; when that fails it stops and asks the Commander to put the files into a named folder. Models from Sketchfab need a login, so only the Commander can add them.
- **Placeholders first.** Stages 4 to 9 draw every object as a simple shape built in code. The SPEC leaves the choice of models to the Commander looking at the picture; with placeholders nothing waits for that choice.
- **The clock adapter still receives the Assembly**, only to call `layoutClock`. The geometry of the clock is the clock's own matter and `features/clock` must not change; everything about the state of the Mission comes from the picture.
- **The highlight of a fired Loop on the clock stays in the adapter** (`useRecentlyFired`, 1500 ms): how long a flash lasts is appearance, and the model holds only the time.
- **`loopBadge` moves into the picture folder**, because both views show the same text.
- **A failure outside the module is caught by an error boundary on the page.** ADR-0017 says that a failed model and a lost context are handled by the module's own code; a chunk that does not download and an error in a label are outside its reach, and the DESIGN wants every failure to end at the clock.
- **Assets are loaded for each scene and freed with it**; there is no cache at module level. The DESIGN says that choosing the clock frees the memory; the browser's own cache makes the second load quick.
- **A failure lasts until the Commander uses the switch.** Choosing the Universe again tries again; the remembered choice is not changed by a failure.
- **The switch sits in the top left corner of the picture area**, two buttons ("Universe", "Clock"); the Fit button of the Universe sits bottom right, where the clock has its own.
- **A label under the pointer highlights its object** (`scene.hover`), so a label and its object behave as one thing.
- **The decision about the "what is happening now" row** (a DESIGN open question, the Commander's "when the signal is connected") is asked in Stage 11, when the Commander sees the monolith pulse.
- **Tests.** The tests of `missionDecorations` move to `missionPicture` with the function (DESIGN, "Testing Seams"). The runtime and the reducer are not the Universe, so the Core signal gets tests beside the existing ones for `agent.activity`. No test of the Universe module is written.

## Verification

Run everything through mise (the shims are in `~/.local/share/mise/shims`; put that folder on `PATH` in a shell that lacks it).

- `mise run check`: typecheck, lint, format check and all tests. Must pass after every stage.
- One project: `pnpm vitest run --project web` (also `runtime`, `server`); one file: `pnpm vitest run apps/web/test/missions/reducers.test.ts`.
- `mise run build`: needed from Stage 4 on, to see the chunks.
- `mise run dev`: the server on `127.0.0.1:4777` and the web application on the Vite dev server (the address is printed). The Mission page is `/missions/<id>`.

Looking at the picture needs a Mission, and a Mission needs the real Engine. Use a Mission that is already in the Missions list (a Stopped one is enough for everything that does not move). When the list is empty, ask the Commander to start one; do not start Missions on your own to look at the picture.

Tests to move or add, with their prior art:

- `apps/web/test/missions/reducers.test.ts`: every assertion on `missionDecorations` becomes one on `missionPicture` (Stage 1); new assertions for Sub-pilots, Side Slots, Exit Points, `power`, `alarm` in the same style.
- `apps/web/test/missions/reducers.test.ts`, beside "the live row follows the activity of the current Slot": the Core's signs of life (Stage 3).
- `packages/runtime/test/runner.test.ts`, beside "forwards a sign of life as agent.activity without a transcript entry" (L424): the Core's signs of life and `core.idle`, with a Core script of the fake Engine (`engine.script('core', 'core', ...)` with an `{ activity }` step).
- `apps/server/test/sse.test.ts`, "replays buffered events after a seq but never a sign of life": `core.idle` is not buffered either.

## Stages

### Stage 1: The picture model

- **Goal:** `missionPicture` exists and is proven on data. Nothing uses it yet; the clock is untouched.
- **Depends on:** none.
- **Touches:** `apps/web/src/features/missions/picture/` (new), `apps/web/test/missions/reducers.test.ts`.
- **Steps:**
  1. Write `types.ts`, `mission-picture.ts`, `index.ts` as in Interfaces. `atWork` is `false` for now. `loopBadge` is written here; `model/selectors.ts` re-exports it from here until Stage 2, so there is one copy.
  2. In `reducers.test.ts` rewrite every assertion on `missionDecorations(...)` to the same fact on `missionPicture(...)` (a Slot is found by name in `slots`; a Loop is `slot.loop`; `exitLit` becomes `exitPoint.lit` of that Slot; `core.cost` stays).
  3. Add assertions for what the adapter derives today and the function now owns: the status of a Sub-pilot (idle, running, done), the status of a Side Slot (idle, then as recorded), an Exit Point on the last Slot and on a flagged one, `power` for Stopped and Waiting for usage, `alarm` for Needs Attention, `usageResetsAt`.
- **Verify:** `mise run check`. `missionDecorations` has no test left and is still used by `MissionClock.tsx`.

### Stage 2: The clock draws the picture model

- **Goal:** the Mission's clock adapter reads only the picture and the selection. The Commander sees no difference.
- **Depends on:** Stage 1.
- **Touches:** `features/missions/page/MissionClock.tsx`, `features/missions/page/MissionPage.tsx`, `features/missions/model/selectors.ts`.
- **Steps:**
  1. Change `MissionClockProps` as in Interfaces. `MissionSlotCard` takes a `SlotPiece`, `MissionCoreContent` a `CorePiece`. Keep every `data-*` attribute, `data-testid`, `aria-label` and class exactly as today: the page tests read them.
  2. Build the props of `ClockView` from the picture: cards and `cardProps` from `slots`; `loops` from each `slot.loop` with `loopBadge` and `useRecentlyFired` (which now takes the Loop pieces); `exits` from each `slot.exitPoint`; a plate's status from the Sub-pilot or Side Slot piece (`idle` becomes `undefined`, so a plate that was not started has no `data-status`, as today); `selected` and a plate's `selected` from `selection`; clicks through `onSelect`.
  3. Remove `plateStatus`, the map of Unit names and every read of `state` from the adapter.
  4. In `MissionPage.tsx` compute the picture with `useMemo` and pass `assembly`, `picture`, `selection`, `onSelect`.
  5. Delete `missionDecorations`, `MissionDecorations` and the re-export of `loopBadge` from `model/selectors.ts`. Search the repository for any use left.
- **Verify:** `mise run check`; `apps/web/test/missions/page.test.tsx` passes without a change to the test file. `git diff --stat` shows nothing under `apps/web/src/features/clock/` or `features/assembly-editor/`.

### Stage 3: The Core at work

- **Goal:** the server reports the Core's signs of life and the end of each call; the page keeps them; `CorePiece.atWork` is true while the Core works.
- **Depends on:** Stage 1.
- **Touches:** `packages/runtime` (`events/mission-event.ts`, `core-agent/index.ts`, `runner/runner.ts`, `runner/mission-registry.ts`), `apps/server/src/sse.ts`, `apps/web/src/features/missions/model/` (`types.ts`, `mission-reducer.ts`), `features/missions/picture/mission-picture.ts`, `docs/api.md`, tests.
- **Steps:**
  1. `mission-event.ts`: add `core.idle` and `isEphemeralEvent`; reword the comment of `agent.activity` so that it covers the Core.
  2. `core-agent/index.ts`: add `onCallEnd` and call it in a `finally` of `call()`.
  3. `runner.ts`: add `reportCoreEvent` and `reportCoreIdle` as in Interfaces. Read how `stop()` and the end of a Mission work and make sure neither method emits after `mission.stopped` or `mission.completed`.
  4. `mission-registry.ts`, `engage()`: pass `onEvent: (event) => runner.reportCoreEvent(event)` and `onCallEnd: () => runner.reportCoreIdle()`, beside `onCost`.
  5. `apps/server/src/sse.ts`: replace the check `event.type !== 'agent.activity'` by `!isEphemeralEvent(event)`.
  6. Tests of the runtime and the server as listed in Verification. `apps/server/test/missions.test.ts` (L343 to L346) compares a replay with every event collected; it now has to leave ephemeral events out with `isEphemeralEvent`.
  7. Web: `coreActivity` in `types.ts` and in the reducer as in Interfaces; `atWork` in `missionPicture`; tests in `reducers.test.ts`: a sign of life of the Core sets `coreActivity`, leaves `activity` and `liveRow` as they were, `core.idle` drops it, `atWork` follows and is false outside `running`.
  8. `docs/api.md`, section "Events (Server-Sent Events)": `agent.activity` may name the slot `core`; add `core.idle`; say that both are never replayed.
- **Verify:** `mise run check`. The clock shows nothing new (it does not draw `atWork`); the proof is the tests.

### Stage 4: The switch, lazy loading and the fallback

- **Goal:** the Mission page opens with the Universe: for now a dark, empty space drawn by three.js. The switch brings the clock back and the choice is remembered. Every failure ends at the clock with one line.
- **Depends on:** Stage 2.
- **Touches:** `apps/web/package.json`, `eslint.config.js`, `features/missions/page/` (`MissionPage.tsx`, `MissionPictureArea.tsx`, `picture-choice.ts`, `UniverseBoundary.tsx`), `features/universe/` (`index.ts`, `types.ts`, `Universe.tsx`, `scene/scene.ts`, `world/world.ts`), `apps/web/test/setup.ts`.
- **Steps:**
  1. Add `three` (r187, `0.187.x`) to the dependencies of `@suptron/web` and `@types/three` of the same minor to its devDependencies. Check the versions with `pnpm view` first; when a newer release exists, take it and say so in the report.
  2. `eslint.config.js`: a block for `apps/web/**` that forbids importing `three` and `three/*` (`no-restricted-imports` with `patterns`), with `apps/web/src/features/universe/**` left out. The message names this plan's rule.
  3. `picture-choice.ts` as in Interfaces, in the pattern of `appearance.ts` (module state behind `useSyncExternalStore`, storage errors ignored with a comment).
  4. `apps/web/test/setup.ts`: choose the clock at the top level and in a `beforeEach`, with a comment that jsdom cannot draw 3D.
  5. `features/universe/types.ts`, `index.ts`.
  6. `world/world.ts`: the first values (background colour, fog).
  7. `scene/scene.ts`: `createUniverseScene` with a `WebGLRenderer` on the given canvas, a camera, a frame loop (`setAnimationLoop`), a `ResizeObserver` on `container`, the listener for `webglcontextlost` (calls `onFailure('context-lost')`), and a complete `dispose`. `update`, `hover`, `fit` exist and do nothing yet.
  8. `Universe.tsx`: checks WebGL 2 with the addon `three/addons/capabilities/WebGL.js` before anything else (`onFailure('no-webgl2')`); creates the scene in an effect and disposes it in the cleanup; calls `scene.update` in an effect on `picture` and `selection`. It works under StrictMode: mount, unmount, mount.
  9. `UniverseBoundary.tsx` and `MissionPictureArea.tsx`: the switch; `React.lazy` with `Suspense` whose fallback is a dark area with a loading note (not the clock); the failure state; with a failure, the clock and above it one line, `role="status"`, in the style of `MissionBanner`, for example "The Universe cannot be drawn: this browser has no WebGL 2. Showing the clock." Using the switch clears the failure.
  10. `MissionPage.tsx` renders `MissionPictureArea` where `MissionClock` was; the area keeps `min-h-[420px]`.
- **Verify:**
  - `mise run check`; the page tests pass unchanged (they run on the clock).
  - `mise run build`: the output lists a separate chunk for the Universe; the main chunk does not contain the string `WebGLRenderer` (search `apps/web/dist/assets/` for it: exactly one file, and not the entry).
  - In the browser: the Mission page shows the dark space and the switch; "Clock" shows today's clock, a reload keeps it, another Mission keeps it; back to "Universe" works. With the clock chosen, the network panel shows no request for the Universe chunk.
  - Switch twenty times: the console shows no warning about too many WebGL contexts.
  - Fallback: in the browser's console run `document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`: the clock appears with its line. Temporarily make the dynamic import fail: the clock appears with the other reason. Remove the temporary change.

### Stage 5: The Mission as placeholders

- **Goal:** every element of the picture stands in the scene as a simple shape and shows its state. No camera control, no labels, changes are instant.
- **Depends on:** Stage 3, Stage 4.
- **Touches:** `features/universe/scene/` (`scene.ts`, `layout.ts`, `compare.ts`, `assets.ts`), `features/universe/objects/`, `features/universe/world/`.
- **Steps:**
  1. `world/`: the palette (muted greys; green, red and yellow only for done, failed and waiting for the Commander: SPEC FR-21), the lights, the fog, sizes and distances, `shipFor`, and `models.ts` with placeholder shapes: the Core a tall dark box; a dock a flat platform; ten ships as ten different simple shapes, so that `shipFor` is visible; a Sub-pilot a small sphere; a Side Slot a small cone on a pad; a Loop an arc (a tube along a curve) from its Slot to its target; an Exit Point a ring behind its dock.
  2. `scene/layout.ts`: a pure function from the picture to positions: the Core in the centre, the docks around it in Assembly order, the Sub-pilots, Side Slots and Exit Point of a dock placed by that dock. The radius grows with the number of Slots; the numbers are the world's.
  3. `objects/`: the six kinds with the `ViewObject` interface; `slot-object` creates and owns its children. Each `apply` computes its flat record and compares.
  4. `scene.ts`: builds the objects once from the first picture; keeps the index from `elementKey` to object; `update` walks the picture and hands every object its piece with `selected` (from `selection`) and `hovered` (false for now), plus `power` and `alarm`.
  5. What each state shows (SPEC, the table of the Solution): pending dark; running lit, with a beam from the dock to the Core; done green; failed red; the current Slot marked; a yellow beacon for `waiting`, a red one for `attention`; `alarm` a red tint of the whole scene's light; `power: 'low'` every light dimmed; a lit Exit Point; a Sub-pilot lit while `running`; a Side Slot by its status; the Core's light by the state of the Mission.
  6. A fixed camera from above and aside that shows the whole ring.
- **Verify:** `mise run check`, `mise run build`. In the browser on a real Mission: the number of docks equals the number of Slots, in order; states match the clock (switch back and forth to compare each Slot, Sub-pilot, Side Slot, Loop and Exit Point). On a running Mission a Slot that becomes done turns green without a reload. Two Slots with the same Unit have the same shape; after a reload each Unit has the shape it had.

### Stage 6: The camera and the pointer

- **Goal:** the Commander drags and zooms, cannot rotate; the whole Assembly fits on opening; objects answer the pointer; a click selects exactly as on the clock.
- **Depends on:** Stage 5.
- **Touches:** `features/universe/scene/scene.ts`, `Universe.tsx`, `world/world.ts`, `objects/`.
- **Steps:**
  1. `MapControls` (`three/addons/controls/MapControls.js`) with rotation off, zoom limits from the world, damping on.
  2. `fit()`: frames the bounds of the layout; called once on creation. A resize keeps the Commander's zoom and position (SPEC FR-5; DESIGN, the scenario "The side panel is resized"). A Fit button bottom right calls it.
  3. The pointer: a `Raycaster` over the objects' `targets` on pointer move; the scene keeps the hovered key as its own state and passes `hovered` in the next `update` walk; the cursor becomes a pointer over a target. A press and release without a drag in between is a click: `onSelect` with the element's `ref` (never for a Loop or an Exit Point).
  4. The selected mark and the hover highlight in each object's `apply`, with the world's values.
  5. `onZoom` is called when the zoom changes.
- **Verify:** `mise run check`. In the browser: drag moves the picture, the wheel zooms, nothing rotates it; resizing the side panel keeps the view; Fit returns to the whole Assembly; choosing the clock and the Universe again starts from the whole Assembly. A click on a ship, the monolith, a drone, a shuttle opens in the side panel what the same click on the clock opens (compare all four). With "follow" on, a newly started Slot moves the mark by itself. A drag that ends over a ship does not select it.

### Stage 7: The labels

- **Goal:** every element has its HTML label, placed by the scene, drawn by React, with more detail close up.
- **Depends on:** Stage 6.
- **Touches:** `features/universe/labels/`, `Universe.tsx`, `scene/scene.ts`, `world/world.ts`.
- **Steps:**
  1. `Labels.tsx`: a layer above the canvas (`pointer-events: none` on the layer, enabled on each label), one element per element of the picture, keyed by `elementKey`; it collects the elements in a map and gives the scene `labelElement`.
  2. Content (SPEC FR-6, FR-11 to FR-16): a Slot shows name and state when far; when close also the Unit (when its name differs from the Slot's), "Attempt N" above one, "Skipped N×" above zero, and the cost (`CostLabel`). The Core shows the state (`STATE_LABELS`), its cost, and the reset time in Waiting for usage (`formatResetTime`). A Loop shows `loopBadge`. A Sub-pilot and a Side Slot show their name and status when close. An Exit Point shows "exit" when close.
  3. The scene, each frame, projects every element's anchor to the screen and writes `transform` on its label element directly; a label whose anchor is outside the area is hidden. React is not involved in positions.
  4. `Universe.tsx` keeps `labelDetail(zoom)` in state (set from `onZoom`; equal values do not re-render) and passes it to the labels.
  5. A click on a label calls `onSelect` with the same `ref` as its object; pointer enter and leave call `scene.hover`.
  6. The labels are dark and muted whatever the application's theme (SPEC FR-21): their colours come from the world, not from the theme's tokens.
- **Verify:** `mise run check`. In the browser: labels stay on their objects while dragging and zooming, text is sharp at every zoom; zooming in adds the details and zooming out removes them; a click on a label selects like the object; the application's light theme does not change the picture. With the browser's performance panel: dragging causes no React renders of the labels.

### Stage 8: Motion

- **Goal:** the world moves calmly and every change of state is a smooth change.
- **Depends on:** Stage 7.
- **Touches:** `features/universe/objects/`, `world/world.ts`, `scene/scene.ts`.
- **Steps:**
  1. Each object keeps its current values and its targets; `frame` moves the current towards the target at the world's speed. `apply` only sets targets.
  2. Idle life: ships hover slowly, each with its own phase (from its index, not from a random number, so a reload looks the same); lights breathe.
  3. The Core pulses while `atWork`; a beacon blinks; the alarm breathes; a fired Loop flashes for the world's duration, from `firedAt`.
  4. The frame loop passes `Date.now()` and the delta, with the delta capped, so a tab that was hidden does not jump on return.
- **Verify:** `mise run check`. In the browser on a running Mission: a Slot becoming done fades to green; the monolith pulses while the Core composes a prompt or judges and stops afterwards; a Loop flashes when it fires and a reload in the middle of the flash shows the rest of it. Twelve Slots with Loops, Sub-pilots and Side Slots move smoothly (SPEC NFR-4); when no Assembly that large is at hand, say so in the report instead of claiming it.

### Stage 9: Order in the module

- **Goal:** the module is as the DESIGN describes it before real models arrive, so that Stage 10 changes only the world.
- **Depends on:** Stage 8.
- **Touches:** `features/universe/`.
- **Steps:**
  1. Search `scene/`, `objects/`, `labels/` and `Universe.tsx` for colours, sizes, durations and distances written as literals; move each to `world/`.
  2. Check that `labels/` and `Universe.tsx` import nothing from `three`.
  3. Check `dispose`: every geometry, material and texture created in the module is released; after choosing the clock, `renderer.info.memory` logged just before disposal shows what was allocated and nothing is created afterwards. Remove the log.
  4. A TSDoc comment on every function, method and class, as `CLAUDE.md` asks.
- **Verify:** `mise run check`, `mise run build`. The picture looks and behaves as after Stage 8.

### Stage 10: The models (the Commander chooses)

- **Goal:** the placeholders are replaced by the models the Commander chose, recoloured to the world's palette.
- **Depends on:** Stage 9.
- **Touches:** `features/universe/world/` (`models.ts`, `assets/`, `assets/CREDITS.md`), `scene/assets.ts`, `objects/`, `README.md`.
- **Steps:**
  1. Get the candidates named in the SPEC ("Further Notes"). Try to download the CC0 packs of Quaternius (Ultimate Spaceships; Modular Sci-Fi MegaKit; Sci-Fi Essentials Kit) as glTF or GLB. When a download does not work, stop and ask the Commander to put the files into `apps/web/src/features/universe/world/assets/candidates/`. The Sketchfab models (CC-BY) need a login: the Commander adds them to the same folder when they want to compare.
  2. Before using a file, check its licence in the pack itself. Only CC0 and CC-BY are used; a copy of a design that belongs to someone else is not used whatever its licence says (SPEC, Constraints).
  3. `scene/assets.ts`: loads the files `models.ts` names with `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`), imported as hashed assets (`import url from './assets/x.glb?url'`). Any file that fails calls `onFailure('model-load')`. A load that finishes after the scene was disposed frees what it loaded.
  4. The objects take their meshes from the loaded assets instead of the placeholder shapes; materials are replaced or recoloured to the world's palette (ADR-0016: the look comes from the scene, not from the pack).
  5. Show the Commander the candidates in the picture and wait for the choice: which set of ships, which monolith (or a shape built in code), which gate, which dock, which drone and shuttle.
  6. Keep only the chosen files in `world/assets/`; delete `candidates/`. A file above about 1 MB is shrunk with `gltf-transform` run through `npx` (not added as a dependency); with Meshopt compression, add three's `MeshoptDecoder` to the loader. Write `CREDITS.md` (file, author, source, licence) and a line in `README.md` naming the authors of CC-BY models.
- **Verify:** `mise run check`, `mise run build` (the model files appear as hashed assets beside the Universe chunk; the main chunk is unchanged in size within a few bytes). In the browser with the network panel: the models load only with the Universe chosen, from the application's own address. Rename one model file's import to a missing path temporarily: the clock appears with the "model" reason; undo. The Commander says the choice is made.

### Stage 11: The look (with the Commander)

- **Goal:** the picture is tuned on screen, and the questions left to the Commander's eye are answered.
- **Depends on:** Stage 10.
- **Touches:** `features/universe/world/`, possibly `scene/scene.ts` (the kind of camera), `features/missions/model/selectors.ts` and `panel/LiveRow.tsx` (only if the Commander wants the Core in the live row), documents.
- **Steps:**
  1. With the Commander watching a real Mission, settle one by one: an orthographic or a perspective camera; the angle; the fog and the lights; the palette; the speed of the motion; the zoom from which labels show their details; whether HTML labels look right (if not, text inside the scene is a separate piece of work: DESIGN, "Revisit when").
  2. Ask whether the scene needs glow by post-processing. A yes is a new dependency and a decision of its own: record it and do not add it inside this plan.
  3. Ask whether the "what is happening now" row of the side panel also shows the Core's signs of life. On a yes: `liveRow` reads `coreActivity` when the Core is at work, with a test beside the existing ones.
  4. Ask how the ring looks on the Commander's largest Assembly, and record the answer to the SPEC's open question about the size of the ring.
  5. Update the documents: the open questions of the SPEC and the DESIGN that were answered; the status line of this plan.
- **Verify:** `mise run check`, `mise run build`. Every change of this stage is inside `world/` except those named in "Touches". The Commander says the Universe is done, or names what is left.

## Risks and Rollback

- **A Core event after the end of a Mission (Stage 3).** A call of the Core that is interrupted by Stop ends after `mission.stopped`; an event emitted then breaks tests that expect `mission.stopped` last and confuses the page. Detect: `packages/runtime/test/runner.test.ts` (L597, L2224). Guard as the stage says. Rollback: revert the stage; the picture keeps `atWork: false` and everything else works.
- **A replay test that counts every event (Stage 3).** `apps/server/test/missions.test.ts` L343 to L346 fails once `core.idle` is emitted. It is the test's assumption that changes, not the behaviour: filter ephemeral events there.
- **three.js in the main bundle (Stage 4 on).** One value import of the Universe module from outside it is enough. Detect: the build check of Stage 4, repeated in Stages 9 and 10. The ESLint rule catches a direct import of `three`, not a value import of the module's `index.ts`.
- **Leaked WebGL contexts (Stage 4 on).** The browser allows about sixteen; StrictMode doubles every mount. Detect: the "switch twenty times" check. Fix in `dispose`, never by caching a renderer at module level.
- **The page tests when the default changes (Stage 4).** Without the line in `test/setup.ts` every page test loads three.js in jsdom. Detect: `page.test.tsx` fails or prints "Not implemented: HTMLCanvasElement.prototype.getContext".
- **Model files that cannot be downloaded or are too large (Stage 10).** The stage stops and asks; nothing before it depends on models. A large file slows the first opening of the Universe only.
- **The clock regresses (Stage 2).** Detect: `page.test.tsx`, and a look at a real Mission beside `main`. Rollback: Stage 2 is one change of three files; Stage 1 can stay.
- **Rollback of the whole feature.** Stages 4 to 11 live in `features/universe/`, three files of `features/missions/page/` and one line of `test/setup.ts`. Making `'clock'` the default in `picture-choice.ts` takes the Universe away from the Commander without removing code.

## Out of Scope

- Tests of the Universe module and their seams (a separate piece of work).
- The Universe in the Assembly editor; any change to `features/clock/` or to the editor.
- Text drawn inside the 3D scene; reaching the picture's objects by the keyboard.
- Post-processing (glow, bloom) and any dependency beyond `three` and `@types/three`.
- A second world, a way to choose a world, choosing a ship for a Unit by hand.
- Ships that fly, a closing sequence for a Completed Mission, sound.
- Moving the picture model to a shared package or to the server.
- A dev page for looking at the Universe without the server (the demo voyage covers looking without the Engine).
- Changes to the formats of a Unit, an Assembly or a Mission, and to `MissionDetail`.
