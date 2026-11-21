# Mission Universe: Design

**SPEC:** ./SPEC.md
**ADRs:** ../../adr/0014-universe-beside-the-clock.md, ../../adr/0015-three-js-in-one-module.md, ../../adr/0016-a-fleet-not-a-robot.md, ../../adr/0017-three-js-without-a-react-layer.md, ../../adr/0018-one-picture-model-for-every-view.md
**Status:** draft

## Summary

The Mission page gets a second view of the same Mission. Between the state of the page and any view stands one **picture model**: plain, immutable data in the words of the Mission (Core, Slot, Sub-pilot, Side Slot, Loop, Exit Point), computed by one pure function. The clock and the Universe both draw this model and nothing else.

The Universe is one module that alone knows three.js. Inside it a scene written in plain three.js builds one view object per element of the model, once, and afterwards only hands each object its new piece of the model; the object compares the piece with what it applied last and moves smoothly to the new look. Everything about the look of the world is kept in one place inside the module. Labels are HTML laid over the picture, drawn by React, positioned by the scene.

This shape was chosen so that the three things most likely to change are each a change in one place: another world is a rewrite of the look; another drawing library is a rewrite of the module; a new fact about a Mission is a new field of the model that every view then draws.

## Context

An addition to existing code, with one piece of rework: the layer between the Mission and the clock moves onto the new picture model.

The stack of `apps/web`: React 19.3 (function components and hooks, StrictMode), Vite 8, TypeScript 6 strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Tailwind v4, TanStack Router and Query. There is no global store: the Mission page lives on `useReducer` with the pure `reduceMissionPage`. The code is functional and reactive: immutable state, pure reducers and selectors, data flowing one way. The design relies on exactly these idioms and carries them into the 3D module, which is the only imperative part.

three.js r187 (2026-10-30) is the version current at the time of writing; it is not yet a dependency.

## Current State

- **The Mission page**: `apps/web/src/features/missions/page/MissionPage.tsx`. A header (`MissionHeader`), banners (`MissionBanner`), then a row with the clock area (`MissionClock`, min height 420px) and the `SidePanel`. The route `/missions/$id` renders the page with `key={id}`.
- **Live state**: `useLiveMission(id)` (`features/missions/live/`) fetches the Mission and subscribes to server-sent events; `reduceMissionPage` (`features/missions/model/mission-reducer.ts`) folds events and the Commander's actions into `ReadyMissionState` (`model/types.ts`). That state mixes facts about the Mission (`slots`, `sideSlots`, `slotStatus`, `current`, `pendingQuestion`, `attention`, `result`, `loopFiredAt`, `activity`) with state of the page (`panel`, `connection`).
- **Selection**: `state.panel.selection` of type `PanelSelection` (`slot`, `mission`, `sideSlot`, `subPilot`), changed by the actions `selectSlot`, `selectMission`, `selectSideSlot`, `selectSubPilot`, and by the page itself (a started Slot while `follow` is on, an answered question, a Completed Mission).
- **The clock**: `apps/web/src/features/clock/` is the drawing part shared with the Assembly editor (`ClockView`, `layoutClock`, the viewport hooks); it takes render props and callbacks and has no mode. `features/missions/page/MissionClock.tsx` is the Mission's adapter. `missionDecorations(state)` (`model/selectors.ts`) prepares most of what the clock draws, but the adapter still derives the status of Sub-pilots and Side Slots (`plateStatus`), the map of Unit names, the selected id and the 1500 ms window of a fired Loop (`useRecentlyFired`).
- **A fired Loop** has no event of its own: the reducer sets `loopFiredAt[from]` when `slot.started` carries `loopFrom`.
- **The Core at work is not reported.** The Core client has an `onEvent` option (`packages/runtime/src/core-agent/index.ts`) that nothing connects; the page learns only `core.resolved` (after the decision) and `cost.updated` for the slot `core`. A Pilot's signs of life already arrive as the ephemeral event `agent.activity` and are kept in `state.activity`.
- **Nothing is loaded lazily**: no `React.lazy`, `Suspense` or error boundary in `apps/web/src`; no `public/` folder; fonts are npm packages bundled by Vite ("must work offline"). The built application is served by `apps/server` through `@fastify/static`.
- **Browser preferences**: no shared helper. `apps/web/src/appearance.ts` keeps the theme in `localStorage` behind `useSyncExternalStore`; the side panel and the inspector each keep their own key.
- **Conventions**: features under `apps/web/src/features/<feature>/`; tests under `apps/web/test/`; errors of an action as a toast, conditions of a Mission as `role="status"` banners.

## Design Decisions

### three.js is used directly

- **Decision:** the scene is plain three.js. React creates it, hands it the picture, destroys it; no react-three-fiber, no drei.
- **Why:** the Commander's experience is that a wrapper around a library ends as a cost in serious work. Here it would also tie React upgrades to the wrapper's releases. The work a wrapper saves is small because the objects of a scene are built once per Mission.
- **Rejected:** react-three-fiber with drei: declarative, with pointer events and disposal for free, but a second dependency with its own view of three.js and a cap on the React version.
- **Revisit when:** the scene has to add and remove many objects while it runs, so that the hand-written update grows into a reconciler.
- **ADR:** ../../adr/0017-three-js-without-a-react-layer.md

### Labels are HTML over the picture, drawn by React

- **Decision:** every label is an ordinary React component in a layer above the canvas. React draws its content when the model changes; the scene writes its position on the screen each frame, directly to the element, and reports the zoom. Labels are a replaceable part of the view.
- **Why:** HTML over a canvas is the normal practice for tens of labels (three.js ships it as an addon; map libraries recommend it at this scale): sharp at every zoom, clickable like any button, styled like the rest of the interface, no dependency. Text inside the scene can be added later without touching the model.
- **Rejected:** three's `CSS2DRenderer`: the same idea, but the elements are created by three.js, so their content would be built by hand outside React. `troika-three-text` (text inside the world, under fog and light): one more dependency with a single main maintainer and two open problems around fonts; kept as the way to go if the Commander finds HTML labels look pasted on.
- **Revisit when:** the Commander has seen the picture and wants labels to belong to the world. Then only the label part changes: all of it, or only the short name, with details left in HTML.

### The Core at work is a field of the model, filled by the server

- **Decision:** the picture model says whether the Core is at work now. The server starts to report it: the Core's signs of life are sent the way a Pilot's already are, and one more short event says that a call of the Core has ended. That event is sent from the one place every call of the Core passes through, after a success and after a failure alike, and is as ephemeral as a sign of life: not stored, not replayed. The page keeps the Core's signs of life apart from the Pilot's, so the "what is happening now" row does not change by itself.
- **Why:** the model describes what the picture needs; where the state of the Mission lacks a fact, the state is completed at its source. The signal exists in the Core client and is only not connected. The end needs an event of its own because a Pilot's sign of life is ended by the next entry of the transcript, and the Core writes none.
- **Rejected:** guessing on the page ("the Mission runs and no Slot is under way"): misses a Resolution in the middle of a Slot and shows a wait for CI as thinking. A flash on `core.resolved` only: shows that the Core has decided, not that it is deciding. Ending the signal by what usually follows a call (the Core's cost, the start of a Slot): a failed call sends no cost, and the monolith would pulse for ever. Ending it by a timer on the page: while the Core reads files no sign of life arrives for many seconds, and the pulse would break.

### One picture model for the clock and the Universe

- **Decision:** one pure function turns the state of the page into the picture model; both views draw it. The Mission's adapter of the clock is rewritten to read it, and what it derives today moves into that function.
- **Why:** the Commander's rule: the model is one, the views are as many as wanted, and a view can be replaced without the model noticing. Two derivations of "which Slot is current" would drift apart.
- **Rejected:** a model of its own for the Universe with the clock left as it is.
- **ADR:** ../../adr/0018-one-picture-model-for-every-view.md

### The model is a tree shaped like the Assembly

- **Decision:** the picture holds the Core and the ordered Slots; each Slot holds its Sub-pilots, its Side Slots, its Loop and its Exit Point. Every element has a common part (what it is, a reference to itself in the words of the Mission, the facts its label shows) and a part of its own kind. The picture as a whole carries what concerns all of it: normal or low power, the alarm of Needs Attention.
- **Why:** a Sub-pilot and a Side Slot belong to a Slot in the domain and in the picture; the tree says so, and the view of a Slot places its own children.
- **Rejected:** a flat list with references to parents: every element is found by id at once, but ownership has to be rebuilt from references and placing gets harder. The scene keeps its own index from reference to view object instead.

### A change reaches the view by comparison, not by a flag

- **Decision:** the model is immutable; data flows one way; each view object compares its small flat piece with what it applied last. No "needs redraw" flags, no cached computed values, no subscriptions.
- **Why:** a flag or a cache is a second state beside the data that must be kept in step with it by hand, which is where such systems become unmanageable. With about fifty elements changing a few times a second, comparing everything costs microseconds.
- **Rejected:** flags; lazily computed properties; a store with a subscription per element; commands from the reducer to the view.
- **Revisit when:** a picture has thousands of elements or changes tens of times a second. Then the comparison inside the scene is replaced by subscriptions; the model and its contract stay.
- **ADR:** ../../adr/0018-one-picture-model-for-every-view.md

### What just happened is a fact with its time

- **Decision:** the model holds "this Loop fired at such a time", set by the reducer when the event arrives. How long the flash lasts and how it looks belongs to the look of the view.
- **Why:** what happened and when is data of the Mission; how long to show it is appearance. A reload in the middle of a flash still gives an honest picture.
- **Rejected:** a flag "flashing now" raised and lowered by a timer in the reducer: puts the length of an effect into the model and timers into the reducer.

### The model lives in the web application

- **Decision:** a folder of its own in `apps/web`, holding only data and pure functions; it imports nothing from React, the browser or a drawing library.
- **Why:** the web application is the only client. "Independent of the renderer" means three.js can be replaced by another web library, not that a client outside the web is planned.
- **Rejected:** the model in a shared package (splits the page's reducer in two for a second client that does not exist); the model computed by the server (changes the protocol between server and page).
- **Revisit when:** a second client appears. One written in TypeScript: move the folder to a shared package. Any other: the server computes the model.

## Settled by Convention

- The Universe module receives a plain description and returns what was clicked: ADR-0015.
- The model speaks the words of the Mission; "a Slot is a dock with a ship" is known only to the view: the SPEC wants a change of world to touch only the part that draws, and the glossary keeps the world out of the term Universe.
- Selection is state of the page and is not in the picture model; a view gets the model and the selection as two inputs. Both pass through the one reducer of the page, as today.
- What is under the pointer, the zoom and the position of the camera live inside the Universe module, as its own small state, under the same rule (a value changes, the view reacts): they mean nothing outside the picture.
- A click reports the element's reference in the words of the Mission, in the shape the page's selection already has, so nothing translates scene ids into selections.
- Objects of the scene are built once when the Universe opens: an Assembly does not change during a Mission.
- Which ship a Unit gets is decided by the view from the Unit's name; the model carries only the name.
- The module lives in `apps/web/src/features/universe/`, beside `features/clock`. An ESLint rule forbids importing `three` anywhere else: it keeps the boundary of ADR-0015 and keeps three.js out of the main bundle.
- The module and its models load only when the Universe is shown (`React.lazy`); with the clock chosen the page loads nothing extra. While it loads, the area is dark with a loading note, not the clock, so the picture does not jump.
- The browser's ability to draw 3D is checked before the scene is created. Any failure (no 3D, the module or a model not loaded, the drawing context lost while running) ends the same way: the clock and one line with the reason.
- Model files are in the repository and are imported as hashed assets of the lazy chunk; nothing is fetched from the internet, as with the fonts. Compression, if needed, is Meshopt (its decoder is one small module); Draco needs hosted decoder files.
- The switch between the Universe and the clock is on the Mission page; the choice is kept in `localStorage` the way `appearance.ts` keeps the theme. The Assembly editor is untouched.
- Smooth transitions are the scene's: the model states the target, each view object moves towards it frame by frame.
- The placing of the docks is a pure function inside the Universe module, not `layoutClock`, whose geometry is that of flat cards in pixels.
- The kind of camera, the fog, the lights and the glow are settings of the look, chosen on screen during implementation. No post-processing in the first version: it is one more dependency.
- The scene is drawn continuously, because it always moves a little; the browser pauses it while the tab is hidden.

## Target Architecture

### Modules and Responsibilities

- **The page reducer** (`features/missions/model/mission-reducer.ts`, existing): the one place where state changes, from events of the server and actions of the Commander. Gains the Core's signs of life. Knows nothing about any view.
- **The picture model** (new folder in `apps/web/src/features/missions/`): the types of the picture and the pure function from the state of the page to the picture. Owns every decision about what a Mission state means for a picture (which Slot is current, when a Sub-pilot counts as running, when the picture is on low power). Takes over what `missionDecorations` and `MissionClock.tsx` derive today. Must not know React, the browser, three.js, or any world.
- **The Mission's clock adapter** (`features/missions/page/MissionClock.tsx`, reworked): draws the picture model with the existing `ClockView`. Derives nothing about the Mission itself.
- **The clock** (`features/clock/`, unchanged): the drawing part shared with the Assembly editor.
- **The Universe module** (`features/universe/`, new): the only code that knows three.js. Its parts:
  - **the scene**: creates the renderer, the camera and the controls for drag and zoom; builds one view object per element of the model; on every new model hands each object its piece; runs the frame loop; finds the object under the pointer and reports hover and click; reports the screen position of every element and the zoom; frees everything when destroyed.
  - **the view objects**: one kind per kind of element (Core, Slot, Sub-pilot, Side Slot, Loop, Exit Point), all with the same small interface: take a piece of the model, live one frame, release what you hold. A Slot's object owns the objects of its children.
  - **the world**: everything about the look in one place: which model file draws what, the palette, the lights and the fog, sizes and distances, how long a flash lasts, what a label shows at which zoom, how a Unit's name picks a ship.
  - **the labels**: the HTML layer, React components that read the model and the world's rules for zoom.
  - **the React shell**: mounts the canvas and the label layer, creates and destroys the scene, passes the model and the selection in and the clicks out.
- **The Mission page** (`MissionPage.tsx`, changed): owns the switch and its remembered choice, loads the Universe lazily, falls back to the clock with a reason.
- **The runtime** (`packages/runtime`, changed slightly): connects the Core client's events so that the Core's signs of life reach the Mission's events.

### Relations and Data Flow

```
server events ──┐
                ├─► page reducer ─► page state ─┬─► picture model (pure function) ─┬─► clock adapter ─► ClockView
Commander's     │                               │                                  │
actions ────────┘                               └─► selection ─────────────────────┼─► Universe shell ─► scene ─► view objects
     ▲                                                                             │                      │
     └──────────────── "this element was clicked" ◄────────────────────────────────┴──────────────────────┘
```

Dependencies point one way: views depend on the picture model; the picture model depends on the types of the Mission (`@suptron/runtime/browser`) and the page state; nothing depends on a view. Inside the Universe module, only the scene, the view objects and the world import three.js; the labels and the shell do not need to.

### Patterns and Technologies

- **Unidirectional data flow with an immutable model**: the idiom the application already uses, extended to the picture.
- **Retained scene with value comparison**: view objects live as long as the scene; each compares its piece of the model by value. This replaces flags, caches and subscriptions.
- **Composite**: the view objects form a tree like the model; a Slot's object manages its children.
- **three.js r187, `WebGLRenderer`**: draws the scene. Its addons do the rest of the job: the glTF loader for the models, the map controls for drag and zoom with rotation off, the capability check for WebGL 2.
- **`React.lazy` with `Suspense`**: keeps the module and the models out of the page until the Universe is shown.
- **`gltf-transform`** (a tool, not a runtime dependency): to shrink model files before committing them, if they need it.

## Testing Seams

Not designed here by the Commander's decision: tests of the Universe are a separate piece of work, to be discussed once the architecture stands. Recorded for that work:

- The picture model is a pure function and can be tested as data, as `apps/web/test/missions/reducers.test.ts` tests `missionDecorations` today; those tests move with the function.
- The existing page tests (`apps/web/test/missions/page.test.tsx`) exercise the clock and must keep passing. jsdom cannot draw 3D, so with the Universe as the default the shared setup of the tests chooses the clock explicitly, through the same remembered choice the switch writes. Running every page test into the fallback was rejected: each would load three.js, fail the check and only then draw the clock.
- The scene itself cannot run in jsdom.

## Scenarios

- **The page opens.** The page reads the remembered choice (Universe), loads the module, checks that the browser draws 3D, loads the models. The scene builds its objects from the model once and fits the whole Assembly into the area. The labels appear over it.
- **A Slot is done, the next starts.** Event, reducer, new state, new model. The scene hands every object its piece; two differ: one dock turns green, the other lights its engines and gets a beam to the monolith. The rest compare and do nothing. React redraws the two labels.
- **A Loop fires.** The Loop's piece has a new time and a new count. The arc sees a fresh time and flashes for as long as the world says.
- **The Commander clicks a ship.** The scene finds the object and reports its reference; the page dispatches the same action a click on the clock does; the selection changes; the scene marks the ship and the side panel opens the transcript. A click on the label takes the same path.
- **The selection changes elsewhere.** A new Slot starts and the page moves the selection itself; the mark in the scene follows, because the scene reads the selection and remembers no click of its own.
- **The Core decides.** The server reports the Core at work; the model says so; the monolith pulses until the signal stops.
- **Needs Attention, Human Checkpoint, Stopped, Waiting for usage, Completed.** Each is values of the model: a marker on a Slot, the alarm and the low power of the picture, the reset time at the Core, a lit Exit Point. The view only shows them.
- **3D cannot be drawn.** The browser has no WebGL 2, or the module does not download, or a model fails to load, or the drawing context is lost while running: the page shows the clock, which draws the same model, and one line with the reason.
- **The switch.** Choosing the clock destroys the scene and frees its memory; choosing the Universe again builds it from the current model. The camera returns to "the whole Assembly in view".
- **The side panel is resized.** The scene follows the size of its area; the Commander's zoom and position are kept.
- **Another world.** The world, the view objects and the model files are rewritten. The picture model, the page and the clock are not touched.
- **Another drawing library.** The Universe module is rewritten. Nothing outside it changes.
- **The Mission learns something new** (a new marker on a Slot). A field is added to the picture model, and each view draws it.

## Open Questions

- Whether the "what is happening now" row of the side panel also shows the Core's signs of life once the server sends them: the Commander, when the signal is connected.
- Orthographic or perspective camera, and whether the scene needs glow by post-processing: the Commander, looking at the picture during implementation.
- The SPEC's own open questions stand: which models are used, and how large the ring of docks may grow.

## Out of Scope

- Tests of the Universe and their seams.
- Text drawn inside the 3D scene.
- Moving the picture model to a shared package or to the server.
- Names of types, files and functions, signatures, and the order of implementation: the PLAN.
