# The Core decides in the Commander's place before a Mission waits for them

Status: accepted (2026-11-12); implemented in the runtime (`Runner.decide`, the Core call `resolveAttention`). Extended by [ADR-0007](0007-handover-and-the-reading-core.md): the Handover as a further cause, the final word when the Resolutions are used up, a Core that reads files, and a `retry` at the Loop limit that grants a round instead of repeating the looping Slot.

Suptron exists to run Missions while the Commander does something else. In the POC every point plain code could not pass (an Attempt or Loop limit, a failed last Exit Condition, a CI timeout, an Engine error) sent the Mission to Needs Attention, and the Core was only asked to explain it. Across the runs of the content scenario this stopped Missions at arbitrary Slots, and the Commander found on return that nothing had finished. The run that triggered this decision is typical: the researcher's `llm_judgment` failed on one Card of seventy, the Core's explanation named both ways to fix it and worded the note, and the Commander's Retry added nothing the Core did not already have.

We decided that **the Core is the Commander's deputy**: where a Mission would wait for the Commander, the Runner asks the Core first, and the Core takes a **Resolution** or hands the decision on. A Resolution is one of two things: one more Attempt with the Core's own note, or the Slot counted as done with its failed Checks as open points. Needs Attention remains for what the Core may not or could not resolve.

The limits are split by who can hold them:

| Limit                                                                 | Held by                                      |
| --------------------------------------------------------------------- | -------------------------------------------- |
| At most `core.resolutionLimit` Resolutions per Slot (default 3; 2 until ADR-0007)        | plain code                                   |
| `accept` only at an Attempt or Loop limit, only when every failed Check is an `llm_judgment` | plain code                |
| The last Exit Condition is never accepted (it would declare the Mission Completed) | plain code                      |
| A second Engine error in a row goes to the Commander                  | plain code                                   |
| Nothing that changes what the Task asks for or leaves its stated limits | the Core's instruction                     |
| No note that needs the Pilot to break its Unit's Rules                | the Core's instruction; the Rules and the Laws still bind the Pilot |
| Engine errors about access, credentials or a usage limit              | the Core's instruction                       |

The count of Resolutions starts afresh when a Slot is entered by a forward move or a Loop, and when the Commander answers a Needs Attention with Retry. Every Resolution is an event (`core.resolved`), a note in the transcript of the Attempt it closes, an entry on the Slot record (and so in the ledger), and a part of the final report ("Decisions the Core took").

## Considered Options

- **The Core decides on what it already sees (chosen)**: one new Core call at the one place every such point passes through. The Core has the Check results, the Slot's Rules and Instructions and, in its session, the Slot Output it judged. Small, and structure stays with plain code. The cost: an `accept` rests on the judge's and the Pilot's words, not on the files.
- **The Core reads the Task folder and the Workspace before deciding**: better grounded and closest to "a second Commander", but it ends "the Core has no tools", costs more per decision, and overlaps the planned rework of the judge. Deferred until runs show blind Resolutions going wrong.
- **The Core fixes the result itself**: fastest, but the judge would accept its own work, and "the Core never touches the result" is what keeps Pilot and Core apart. Rejected.
- **Raise the Attempt limit**: no design change, but more Attempts with the same feedback do not choose between two fixes or accept a minor gap; the Mission still stops, later and dearer. Rejected.

Secondary decisions taken in the same session:

- **`resolutionLimit: 0` is the switch back** to the POC's behaviour; there is no separate autonomy flag.
- **Human Checkpoints stay the Commander's.** A Pilot flagged "may ask the Commander" asks at a moment the Commander chose (the planner's interview at the start); the Core does not answer for them.
- **A limit on tokens or cost is not part of this**; the Resolution limit bounds extra Attempts, not spend (see PROGRESS.md, cost and usage limits).
- **ADR-0001 stands**: the Core still can never reorder, skip or add Slots, and never declares a Mission Completed. What changes is the runtime's rule that the Core is consulted for text and judgments only: it now also decides what the Commander would at the points listed above.
