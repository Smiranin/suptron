# UI editors for Units, Assemblies and Project Profiles

**ADR:** ../../adr/0002-assembly-editors.md
**Status:** draft
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Source:** closes OQ-2 of ../suptron-poc/SPEC.md. Vocabulary follows ../../GLOSSARY.md.
**Amended:** 2026-10-22 by ./PLAN.md: success criterion 2 (semantic equivalence; comments and formatting are not preserved), FR-14 and FR-15 (paths are typed, no native dialogs), OQ-1 closed.
**Amended:** 2026-10-22 by ../missions-ui/SPEC.md: FR-1 (the Projects page shows each Project expanded with its Assemblies and a Launch button per valid Assembly; the Assembly editor header has the same button).

## Problem Statement

The POC SPEC requires that Units, Assemblies and Project Profiles can be created, edited and deleted in the UI (FR-3, FR-5, FR-13) while plain files stay the source of truth (FR-14), but it leaves the shape of those editors open. Without a defined shape the Commander would end up editing files by hand, which hides the structure that matters most: the order of Slots, the Loops between them, which Slot Outputs each Slot reads, and where an Assembly may end. The Commander also needs to see at a glance what a Slot inherits from its Unit and what it overrides.

## Goal and Success Criteria

Goal: the Commander can build the whole test configuration of the POC (Units, one Project Profile, the primary-scenario Assembly) in the UI without opening a file, and can read any Assembly's structure from the canvas alone.

Success criteria:

1. The primary-scenario Assembly (analyst → implementer → reviewer ⟲ → tester ⟲ → publisher → PR reviewer ⟲) can be built from an empty Hangar in the UI and runs unchanged.
2. An Assembly edited in the UI and then hand-edited in a code editor (or the other way round) reloads in the UI exactly as edited, with no configuration lost in either direction. Saving from the UI rewrites the file in the system's canonical form: comments and hand formatting are not preserved, every setting is.
3. The Commander can tell from the canvas, without opening an inspector, the order of Slots, every Loop with its target and limit, every Exit Point and which Slot Outputs the selected Slot reads.
4. The UI refuses to save any Assembly the runner could not execute, and names the reason.

## Solution

The UI has two configuration areas next to Missions: **Hangar** (the shared library of Units) and **Projects** (one page per Project holding its Project Profile and its Assemblies). Assemblies never appear outside their Project.

**Units and Project Profiles are forms.** Every field of FR-2 and FR-4 of the POC SPEC is a form field. Models are chosen from the list the Engine Adapter provides. Paths (repository, Knowledge Sources) are picked with native file and folder dialogs. Rules and Instructions are multi-line markdown fields. The Unit's default Done Condition is a list of Checks chosen from the system's catalogue. There is no raw-file view in the UI; every editor has an "Open in editor" action that opens the underlying file in the Commander's code editor.

**An Assembly is a clock.** The Assembly editor is a zoomable, pannable canvas. The Core is a circle in the centre; clicking it opens the Core Directives panel. A Start marker sits at twelve o'clock. The Slots are spread evenly around a ring, clockwise from Start, however many there are. Forward arrows between neighbouring Slots are drawn by the system from the order; the Commander reorders by dragging a Slot along the ring, the others make room, and the Slot snaps to its position on release. A Loop is the only arrow the Commander draws: dragging from a Slot's "on failure" handle to an earlier Slot creates a counter-clockwise chord with the iteration limit as a badge. An Exit Point is drawn as a short arrow leaving the ring from its Slot, labelled with its Exit Condition or "when done"; the last Slot always has one. When a Slot is selected, dashed chords show the earlier Slots whose Slot Outputs it reads. No coordinates exist: the layout is computed from the order, so the file remains a plain ordered list.

A palette of Units on the left lets the Commander drag a Unit onto the ring; a "+" between any two Slots (and before the first, after the last) opens a Unit picker. Selecting a Slot opens an inspector on the right with five tabs: General, Context, Done Condition, Loop, Exit. Fields inherited from the Unit show the Unit's value greyed out with an Override switch.

Saving is explicit. Validation errors are listed under the canvas, each selecting its Slot when clicked, and block Save. If the file changed on disk while the editor was open, Save asks for Reload or Overwrite.

**Vocabulary change.** This feature splits what the POC SPEC called Exit Condition into three distinct things, now defined in the glossary: a Slot's **Done Condition** (Checks for the Slot to count as done), a Slot's **Exit Point** flag with an **Exit Condition** (Checks, evaluated once the Slot is done, that end the Mission early), and the Mission state **Completed** (formerly Done). An Assembly may therefore end at any Exit Point whose Exit Condition holds, while remaining strictly linear.

## User Stories

Navigation and common behaviour

1. As the Commander, I want a Hangar area and a Projects area in the UI, so that shared and Project-bound things are never mixed.
2. As the Commander, I want each Project page to show its Project Profile and its Assemblies together, so that everything about one Project is in one place.
3. As the Commander, I want an explicit Save with a visible unsaved-changes indicator and Cmd+S, so that a half-edited configuration never reaches disk.
4. As the Commander, I want to be asked "Discard changes?" when I leave an editor with unsaved changes, so that I never lose work by accident.
5. As the Commander, I want to be warned when the file changed on disk while I was editing and choose Reload or Overwrite, so that my code editor and the UI do not silently fight.
6. As the Commander, I want an "Open in editor" action on every Unit, Assembly and Project Profile, so that I can switch to my code editor for the same file.
7. As the Commander, I want to Duplicate a Unit in the Hangar and an Assembly inside its Project, so that a second variant starts from the first.
8. As the Commander, I want editing to stay allowed while Missions are active, with a note that active Missions use their snapshot, so that I am never blocked by a running Task.
9. As the Commander, I want to choose models from the list the Engine Adapter provides, so that a typo cannot surface only during a Mission.

Unit editor

10. As the Commander, I want a Unit form with name, Rules, Instructions, model, default Done Condition and the default "may ask the Commander" flag, so that one specialized agent is defined in one place.
11. As the Commander, I want Rules and Instructions as separate markdown fields, so that what a Slot may never weaken is kept apart from what it may extend.
12. As the Commander, I want to compose a Done Condition from Checks in a catalogue, each with its parameters, so that conditions stay deterministically checkable.
13. As the Commander, I want deleting a Unit that any Assembly uses to be refused with the list of those Assemblies, so that no Slot is left pointing at nothing.

Project Profile editor

14. As the Commander, I want to pick the repository folder with a native dialog and have the remote and default branch read from git but remain editable, so that I type as little as possible.
15. As the Commander, I want to add Knowledge Sources with a native file or folder dialog and see them as paths relative to the repository, so that the list stays readable.
16. As the Commander, I want the branch name template and Pull Request description template as text fields with named placeholders, so that Git conventions are explicit.
17. As the Commander, I want to set the repository host, the Engine and the CI wait timeout in the same form, so that the Profile is complete in one screen.

Assembly editor: canvas

18. As the Commander, I want to see the Assembly as a clock with the Core in the centre and Slots clockwise around it, so that the structure is readable at a glance.
19. As the Commander, I want to click the Core to edit the Core Directives (model, default Attempt limit, default Loop limit and one free-text field of instructions), so that orchestration settings are where the orchestrator is.
20. As the Commander, I want to reorder Slots by dragging them along the ring, with the forward arrows following automatically, so that I cannot draw an order the runner cannot execute.
21. As the Commander, I want to draw a Loop by dragging from a Slot's failure handle to an earlier Slot, and see it as a chord with its iteration limit, so that review-fix cycles are visible.
22. As the Commander, I want Exit Points drawn as arrows leaving the ring, labelled with their Exit Condition, so that I can see every place a Mission may end.
23. As the Commander, I want dashed chords to show which Slot Outputs the selected Slot reads, and nothing when no Slot is selected, so that the canvas stays clean.
24. As the Commander, I want to add a Slot by dragging a Unit from the palette onto the ring or by pressing "+" between two Slots, so that I can work fast or precisely.
25. As the Commander, I want each Slot card to show its name, Unit, model, "may ask" and "persistent" icons, a one-line Done Condition and a Loop badge, so that the essentials are visible without the inspector.
26. As the Commander, I want to zoom with the wheel around the centre, pan by dragging empty space and press Fit, so that large Assemblies stay navigable.
27. As the Commander, I want Delete to remove the selected Slot, with a confirmation when other Slots refer to it and automatic removal of those references, so that I never save a dangling reference.
28. As the Commander, I want a new Assembly to open as an empty clock with a hint to drag a Unit in, so that the first step is obvious.

Assembly editor: inspector

29. As the Commander, I want to give each Slot a name unique in its Assembly, defaulting to the Unit's name, so that Loops and Slot Outputs refer to Slots by a stable name.
30. As the Commander, I want inherited fields to show the Unit's value greyed out with an Override switch, so that I always know what comes from the Unit and what I changed here.
31. As the Commander, I want a Context tab with Task documents, Knowledge Sources and Checkout on by default and earlier Slot Outputs off by default, so that Slot isolation is the default and wiring is deliberate.
32. As the Commander, I want a Done Condition tab, a Loop tab (target among earlier Slots, iteration limit) and an Exit tab (Exit Point flag, Exit Condition), so that every per-Slot setting of the POC SPEC has one place.
33. As the Commander, I want the last Slot's Exit Point flag to be forced on and its Exit Condition optional, so that the normal case "the Mission ends when the last Slot is done" needs no configuration.
34. As the Commander, I want to flag an earlier Slot as an Exit Point with an Exit Condition, so that an Assembly can end early when the work turns out to be unnecessary.

Validation

35. As the Commander, I want Save to be refused while hard errors exist, with each error listed under the canvas and selecting its Slot when clicked, so that I fix problems where they are.
36. As the Commander, I want warnings that do not block Save, so that unusual but valid Assemblies are allowed.
37. As the Commander, I want an Assembly that was broken by hand to appear as invalid with its errors and to be unstartable, so that a Mission never starts from something the runner cannot execute.
38. As the Commander, I want deleting an Assembly or a Project to be refused while it has active Missions, so that a Mission never loses its definition.

## Requirements

### Functional

Common

- FR-1. The UI has a Hangar area listing the shared Units and a Projects area listing Projects; a Project page shows its Project Profile and its Assemblies. Assemblies are reachable only through their Project. The Projects page shows each Project expanded with its Assemblies, each valid Assembly with a Launch button (see ../missions-ui/SPEC.md FR-1).
- FR-2. Every editor saves explicitly (Save button and Cmd+S), shows an unsaved-changes indicator and asks before discarding unsaved changes on navigation. There is no autosave.
- FR-3. If the underlying file changed on disk since the editor loaded it, Save offers Reload (lose UI changes) or Overwrite. No merging.
- FR-4. Every editor offers "Open in editor", which opens the underlying file in the Commander's code editor. The UI has no raw-file editing mode.
- FR-5. Model fields (Unit, Slot override, Core) offer only the models reported by the Engine Adapter.
- FR-6. Names are unique: Unit names across the Hangar, Assembly names within a Project, Project names across the system. Renaming uses the same name field.
- FR-7. Duplicate exists for Units (in the Hangar) and for Assemblies (within the same Project only).
- FR-8. Editing any Unit, Assembly or Project Profile is allowed while Missions are active; the editor shows how many active Missions use a snapshot of it.
- FR-9. Deleting a Unit is refused while any Assembly uses it; the refusal lists those Assemblies. Deleting an Assembly is refused while it has active Missions; deleting a Project is refused while any of its Assemblies has active Missions.

Checks

- FR-10. The system provides a fixed catalogue of Checks: a command exits with code 0 (parameter: command), CI is green, the Pull Request exists, the Pull Request has no open comments, LLM judgment (parameter: criterion text). The Commander cannot define new kinds of Check.
- FR-11. A Done Condition and an Exit Condition are each an ordered list of Checks; all Checks must hold. The same Check-list widget is used wherever a condition is edited.

Unit editor

- FR-12. The Unit form has: name, Rules (markdown), Instructions (markdown), model, default Done Condition (Check list), default "may ask the Commander" flag.
- FR-13. A Unit has no Exit Point and no Exit Condition; those exist only on Slots.

Project Profile editor

- FR-14. The repository location is typed as an absolute path and checked by the system to exist; the remote and default branch are read from the repository and remain editable.
- FR-15. Knowledge Sources are typed as paths relative to the repository and checked by the system to exist.
- FR-16. Branch name template and Pull Request description template are text fields with named placeholders (at least the Work Item ID and the Task slug).
- FR-17. The form also holds the repository host, the Engine and the CI wait timeout, as in POC FR-4.

Assembly editor: canvas

- FR-18. The Assembly editor is a canvas that can be zoomed with the wheel around the centre, panned by dragging empty space and reset with Fit. The Units palette (left) and the inspector (right) are outside the canvas and unaffected by zoom.
- FR-19. The Core is drawn as a circle in the centre; clicking it opens the Core Directives panel with: Core model, default Attempt limit, default Loop limit, and one free-text instructions field covering context composition, judgment of Checks, when to go to Needs Attention and how to report.
- FR-20. A Start marker sits at twelve o'clock. Slots are placed evenly on a ring clockwise from Start, for any number of Slots. The layout is computed from the Slot order; no coordinates are stored.
- FR-21. Forward arrows between consecutive Slots are derived from the order and cannot be drawn or deleted by the Commander.
- FR-22. Dragging a Slot along the ring reorders it; other Slots make room and the Slot snaps to a position on release.
- FR-23. A Loop is created by dragging from a Slot's failure handle to an earlier Slot, or in the inspector's Loop tab; it is drawn as a counter-clockwise chord with the iteration limit as a badge. Hovering a Loop highlights both Slots.
- FR-24. An Exit Point is drawn as a short arrow leaving the ring from its Slot, labelled with a one-line summary of its Exit Condition, or "when done" when the Exit Condition is empty. The last Slot always shows one.
- FR-25. When a Slot is selected, dashed chords are drawn from each earlier Slot whose Slot Output it reads. Nothing is drawn when no Slot is selected. Context wiring is edited in the inspector, not by drawing.
- FR-26. A Slot is added by dragging a Unit from the palette onto a position on the ring, or by a "+" control between any two Slots, before the first or after the last, which opens a Unit picker. A new Slot is named after its Unit; a duplicate name gets a numeric suffix.
- FR-27. A Slot card shows: Slot name, Unit name when it differs, model, a "may ask the Commander" icon, a "persistent" icon, a one-line Done Condition summary and a Loop badge ("↩ target, max N") when a Loop exists.
- FR-28. The Delete key removes the selected Slot. If other Slots reference it (Loop target, Slot Output), the UI asks for confirmation and removes those references.
- FR-29. Double-clicking a Slot opens the inspector on the General tab.
- FR-30. A new Assembly opens as an empty clock with the Start marker and a hint to drag a Unit in. An Assembly with no Slots cannot be saved.

Assembly editor: inspector

- FR-31. Selecting a Slot opens an inspector with tabs: General (name, Unit, model, Memory Mode, "may ask the Commander", additional Instructions), Context, Done Condition, Loop, Exit.
- FR-32. Fields inherited from the Unit (model, Instructions, Done Condition, "may ask the Commander") show the Unit's value greyed out with an Override switch; the field becomes editable only when Override is on.
- FR-33. The Context tab offers Task documents, Knowledge Sources and Checkout (on by default) and one checkbox per earlier Slot's Slot Output (off by default).
- FR-34. The Loop tab offers a target among earlier Slots and an iteration limit (default 3).
- FR-35. The Exit tab offers the Exit Point flag and an Exit Condition (Check list). On the last Slot the flag is on and not editable; its Exit Condition is optional.
- FR-36. Every Slot name must be unique within the Assembly.

Validation

- FR-37. Hard errors block Save: a Slot whose Unit does not exist; a non-unique Slot name; a Loop targeting itself or a later Slot; a Context reference to a later or missing Slot; an Exit Point that is not last with an empty Exit Condition; an Assembly with no Slots; the last Slot not flagged as Exit Point.
- FR-38. Errors are listed under the canvas; clicking one selects the Slot; the Slot card shows a red badge. Warnings (for example, a Slot Output nobody reads) are listed but do not block Save.
- FR-39. An Assembly file that fails validation when loaded is shown as invalid with its errors and cannot be used to start a Mission.
- FR-40. When a reorder makes a different Slot the last one, the editor turns its Exit Point flag on; the previous last Slot keeps its flag and is reported by validation if its Exit Condition is empty.

### Non-functional

- NFR-1. Everything visible on the canvas is derived from the configuration file; a file edited by hand and reloaded shows exactly what the file says (POC FR-14).
- NFR-2. The canvas stays readable from three to about twelve Slots without manual zoom; more Slots require zoom but remain editable.
- NFR-3. Single user, local only, as the POC.

## Constraints

- Configuration files remain plain files editable by a code editor; the editor must not write layout data into them.
- The Check catalogue is fixed by the system; the UI cannot add Check kinds.
- Only models reported by the Engine Adapter can be selected.
- The Laws of the POC are not configurable from any editor.

## Out of Scope

- Raw file editing inside the UI.
- Parallel branches and conditional branches on the canvas (the clock leaves room for them later).
- Commander-defined Check kinds.
- Assembly templates across Projects; copying an Assembly into another Project.
- Merge of concurrent edits between the UI and a code editor.
- Undo/redo history beyond unsaved changes.
- Search and filtering in the Unit library.
- Importing or exporting configuration.

## Open Questions

- OQ-1. Closed on 2026-10-22 by ../suptron-poc/PLAN.md (decision 5): `{work_item_id}`, `{task_slug}`, `{task_title}`.
- OQ-2. Whether the Core Directives free-text field should be split into several fields once real Assemblies show which parts recur. Commander, after the first real Missions.

## Further Notes

- The Commander prefers rendering the clock with the HTML Canvas API. This is an implementation choice for /to-plan, where it should be weighed against SVG for text rendering, hit-testing and accessibility.
- Runtime decisions taken in this session and recorded in the POC SPEC rather than here: the Core never declares a Mission Completed on its own; Needs Attention interrupts the running Pilot; Exit Conditions are evaluated only after a Slot is done.
- The clock layout was chosen over a left-to-right track; see ADR-0002 for the alternatives.
