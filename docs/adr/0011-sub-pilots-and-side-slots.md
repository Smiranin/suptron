# Work attached to a Slot is a Sub-pilot or a Side Slot, never a parallel Slot

Status: accepted (2026-11-17); specified in ../features/sub-pilots-and-side-slots/SPEC.md, not implemented yet

An Assembly is one ordered list of Slots, and the Mission stands at exactly one of them. Two needs did not fit. After a Mission's work is done the Commander wants more work that must never decide the Mission's fate: a glossary brought up to date, a note for a demo, a line in a log of achievements, a message sent. And a Slot such as a tester will want two specialists working at the same time, with the Slot answering for both. The first idea was one mechanism: a Slot with nested Slots and a flag "blocking or not". We decided against it, because the flag would change everything about the nested Slot: who starts it, who answers for it, and what "done" means.

We decided on two things, both built from Units of the Hangar.

**A Sub-pilot is called by the Pilot.** A Slot lists Units its Pilot may call during an Attempt. They are given to the Pilot through the Engine's own mechanism for sub-agents; the Pilot decides when to call them and whether at the same time, waits for them and answers for the result. The Core deals with the Pilot only. The runtime sees from the Engine's events which Sub-pilots were called and which returned, and a Sub-pilot marked as required that was not called, or did not return, fails the Slot's Done Condition. A Sub-pilot has no Checks, Attempts, Loop or Handover status of its own and cannot ask the Commander. The Mission still stands at one Slot.

**A Side Slot is started by the system.** A Slot lists Side Slots; each time the Slot is done they start, one after another in the order listed, apart from the ordered list, which does not wait for them. A Side Slot has one Attempt and no Loop, Exit Point, Human Checkpoint or Resolution; when it fails, only its own status says so. The one place the Mission waits is its end: a Mission is Completed when its Exit Condition holds and every Side Slot that was started has ended, failed ones included.

## Considered Options

- **Sub-pilots inside the Pilot's Engine session, Side Slots beside the ordered list (chosen).** Each of the two is simple. Parallel work costs nothing in the Runner: the Engine already runs sub-agents side by side, and the Mission's position, the ledger, Resume and the Loops stay as they are.
- **One nested Slot with a blocking flag.** One word for the Commander, but two behaviours under it, and the blocking kind needs what the next option needs. Rejected.
- **Parallel Slots in the Runner.** Each branch with its own Checks, Attempts and transcript. It ends "the Mission stands at one Slot", on which the ledger and Resume rest, and needs rules for a Loop out of one branch and for two Core conversations at once. Rejected until a Sub-pilot proves too weak.
- **A second Assembly started when a Mission is Completed.** A new kind of link between Missions and a second claim on the Workspace, for work that belongs to one Slot of one Mission. Rejected.
- **Side Slots only on Exit Points.** Rules out a Side Slot running next to later Slots. Rejected by the Commander: where a Side Slot makes sense is the Assembly author's call.

Secondary decisions taken in the same session:

- **No guards around Side Slots.** A Side Slot may write wherever any Pilot may, the Workspace included, and runs while later Slots work there. There is no queue across Slots. The only rule against overlap: when a Slot is done again while its Side Slots from the time before still run, that start is left out and noted. The Commander places Side Slots so that they do not collide.
- **A Mission is not Completed while a Side Slot runs.** The alternative, Completed at once with the Workspace kept busy, needed a state between "over" and "still working". Each running Side Slot can be stopped on its own and then counts as failed, so a hanging one does not hold the Mission.
- **A failed or interrupted Side Slot can be run again by hand** while the Mission is in the list. Nothing runs it again by itself, and a Resume does not.
- **The Engine's own general agents stay open to every Pilot.** Sub-pilots are an addition, not a replacement: closing the general agents would make a Pilot in a large repository search with its own context.
- **One level.** A Sub-pilot calls no Sub-pilots; a Side Slot may have Sub-pilots and has no Side Slots.

## Consequences

- A Sub-pilot is not in the ledger: an interrupted Attempt runs again as a whole, its Sub-pilots included.
- The cost of a Sub-pilot is part of its Slot's cost; a Side Slot has a cost of its own that counts towards the Mission.
- The quality of a Sub-pilot's work is judged only through the Checks of its Slot.
- A Side Slot of a Slot inside a Loop runs once for every time the Slot is done.
- "No Slot runs in Needs Attention" now has an exception: a Side Slot that was started goes on.
- To check on the real Engine before building: that the Laws' hooks hold inside a sub-agent, that a sub-agent cannot call sub-agents, and that the events tell a sub-agent's messages from its caller's.
