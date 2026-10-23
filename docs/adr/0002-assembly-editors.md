# Edit Assemblies on a clock-shaped canvas, Units and Project Profiles as forms

Status: accepted

The POC needs UI editors for Units, Assemblies and Project Profiles (OQ-2 of ADR-0001) while plain files stay the source of truth. We decided that Units and Project Profiles are edited as structured forms, and that an Assembly is edited visually: a clock-shaped canvas with the Core in the centre, the Slots placed clockwise on a ring, Loops drawn as chords and Exit Points as arrows leaving the ring. The canvas is only a view of the ordered Slot list; the Commander drags Slots along the ring to reorder them and draws only Loops by hand, so nothing on the canvas can produce an Assembly that is not a strictly ordered list, and no coordinates are stored in the files.

## Considered Options

- **Clock-shaped canvas (chosen)**: puts the Core visibly in the centre, which matches the domain (the Core touches every Slot, Slots never talk to each other); a Loop is naturally a chord and an exit naturally leaves the circle; balances any number of Slots around the ring; zooms around one centre; leaves room for parallel branches later without changing the metaphor.
- **Left-to-right track with the Core as a bar above**: simpler to draw and to reorder, but the Commander judged the clock better from a UI/UX standpoint. Rejected.
- **Free graph canvas where the Commander draws every arrow**: would allow drawing Assemblies the runner cannot execute and would force x/y coordinates into the configuration files, breaking the equivalence between editing in the UI and in a code editor. Rejected.
- **Plain ordered list of Slot cards, no canvas**: safe and fast but hides Loops and context wiring. Rejected.
- **Raw file editor inside the UI**: duplicates the Commander's code editor and gives two ways to break a file. Rejected; the UI offers "Open in editor" instead.

Secondary decisions taken in the same session, recorded here because they change the domain model of ADR-0001:

- **The per-Slot condition is renamed Done Condition; Exit now means leaving the Assembly**: a Slot may be flagged as an Exit Point with an Exit Condition that is evaluated only once the Slot is done; the last Slot is always an Exit Point. This gives Assemblies an early exit without conditional branches. The Mission state Done is renamed Completed so that "a Slot is done" and "a Mission is Completed" never mix.
- **Done Conditions and Exit Conditions are lists of Checks from a fixed catalogue**: the Commander composes conditions from Checks the system provides and cannot define new kinds of Check. This is what keeps conditions deterministically checkable.
- **The Core never declares a Mission Completed on its own**: Completed happens only through an Exit Point. Every situation the Core cannot resolve leads to Needs Attention, so the Commander can always read from the UI why a Mission ended.
- **Needs Attention interrupts the running Pilot**: nothing executes while a Mission waits for the Commander; Retry starts a new Attempt.
- **Explicit Save, no autosave, no merge on conflict**: a half-written autosaved file would be visible to a code editor; on an external change the UI offers Reload or Overwrite only.
- **Deleting is blocked by use**: a Unit used by an Assembly, or an Assembly or Project with active Missions, cannot be deleted.

## Consequences

- The POC SPEC (features/suptron-poc/SPEC.md) is amended: FR-10, FR-21, FR-24, FR-31 to FR-33 and the Out of Scope list follow the new vocabulary, and OQ-2 is closed.
- The configuration files carry Exit Point flags and Exit Conditions in addition to Done Conditions; the file format must be defined with the three levels (Slot done, Assembly exit, Mission Completed) kept distinct.
- The Commander's preference for rendering with the HTML Canvas API is recorded for the implementation plan, not decided here; text rendering, hit-testing and accessibility must be weighed in /to-plan.
