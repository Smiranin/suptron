# Sub-pilots, Side Slots and Outer Folders

**ADRs:** ../../adr/0011-sub-pilots-and-side-slots.md, ../../adr/0012-outer-folders.md
**Status:** draft

## Problem Statement

An Assembly is one ordered list of Slots, each flown by one Pilot, and a Pilot may write only to the Workspace and the Task location. Three things the Commander wants do not fit.

1. **Work that follows the result but is not the result.** When a Task is implemented, the Commander wants the Project's glossary and notes brought up to date, a note for a demo written, an entry added to a log of achievements, perhaps a message sent. As ordinary Slots this work would stand in the Mission's way: a failure would send the Mission to Needs Attention although the Pull Request is ready.
2. **Several specialists inside one Slot.** A tester will soon want one agent for unit tests and another for browser tests, working at the same time, with the tester answering for both. Today a Pilot can only call the Engine's nameless general agents, not the Units of the Hangar.
3. **Files that live outside the Workspace.** A Project's growing knowledge and the Commander's own logs are kept outside the repository, where the Laws forbid every Pilot to write.

The Commander wants a general mechanism, not one built for the three examples.

## Goal and Success Criteria

A Slot can carry two kinds of attached work, both made from Units of the Hangar, and a Project can name folders outside its Workspace that its Pilots may write to.

Done when:

- An Assembly whose last Slot has three Side Slots runs to Completed with the same Mission result whether the Side Slots succeed, fail or are stopped.
- A failing Side Slot never causes a Needs Attention, a Resolution, a Loop or an extra Attempt of any Slot.
- A Slot with two Sub-pilots, both required, is not done in an Attempt in which its Pilot called only one of them.
- A Pilot writes a file into an Outer Folder of its Project, and is refused by the Laws in a folder that is not listed.
- On the Mission page the Commander sees for every Side Slot and Sub-pilot whether it ran and how it ended, and can read what it did.

## Solution

**Sub-pilots.** In the Assembly editor the Commander adds Units to a Slot as Sub-pilots. During an Attempt the Slot's Pilot may call them by name, several at once if it chooses, and waits for what they return. The Pilot answers for their work: the Slot's Done Condition judges the Slot as a whole. A Sub-pilot marked as required must be called and must return in every Attempt, or the Slot is not done.

**Side Slots.** The Commander adds Units to a Slot as Side Slots. Each time that Slot is done, its Side Slots start one after another, beside the ordered list, which goes on without waiting. Whatever happens to a Side Slot, the Mission's course is the same. Only at its end does the Mission wait: it is Completed when its Exit Condition holds and every started Side Slot has ended. A running Side Slot can be stopped on its own; a failed or interrupted one can be run again by hand.

**Outer Folders.** In the Project Profile the Commander lists folders outside the Workspace. Every Pilot of the Project's Missions may write there.

The Units that update documents, write a demo note or keep a log of achievements are the Commander's to write; this work only makes them possible.

## User Stories

1. As the Commander, I want to attach Side Slots to a Slot, so that follow-up work starts by itself when that Slot is done.
2. As the Commander, I want a Side Slot to be made from any Unit of the Hangar, so that I reuse Units and write no new kind of thing.
3. As the Commander, I want a failed Side Slot to leave the Mission's course untouched, so that an unimportant failure never costs me a finished result.
4. As the Commander, I want the ordered list to go on without waiting for Side Slots, so that follow-up work does not slow the Mission.
5. As the Commander, I want the Mission to become Completed only when its Side Slots have ended, so that Completed means nothing is still working in my Checkout.
6. As the Commander, I want a Mission whose Side Slots failed to be Completed all the same, so that the state tells me about the result and not about the side work.
7. As the Commander, I want to see the result of the Mission (the report, the Pull Request) while the last Side Slots still run, so that I do not wait for side work to read it.
8. As the Commander, I want to stop one running Side Slot, so that a hanging one does not hold the Mission and I do not have to stop the whole Mission.
9. As the Commander, I want to run a failed or interrupted Side Slot again, so that a dropped connection does not lose an update of my documents.
10. As the Commander, I want every Side Slot to show its status, transcript and cost, so that I know what it did and what it cost.
11. As the Commander, I want the final report to name the Side Slots and how each ended, so that one text tells the whole Mission.
12. As the Commander, I want a Side Slot to receive the Task, the Knowledge Sources and the Slot Outputs I name, so that it knows what the Mission did.
13. As the Commander, I want a Side Slot to end with a status and a short note of what it did, so that I learn how it went without reading its transcript.
14. As the Commander, I want to give a Slot Sub-pilots, so that its Pilot can hand parts of the job to specialists.
15. As the Commander, I want the Pilot to call Sub-pilots at the same time, so that independent parts of a job do not wait for each other.
16. As the Commander, I want a Sub-pilot to be made from a Unit with its Rules, Instructions and model, so that a specialist behaves the same wherever it is used.
17. As the Commander, I want to add Instructions and a model override to a Sub-pilot in the Slot, so that the Unit stays Project-independent.
18. As the Commander, I want to mark a Sub-pilot as required, so that a Pilot that does everything itself is caught.
19. As the Commander, I want the Pilot alone to answer for its Sub-pilots, so that the Core, the Checks and the Loops deal with one party per Slot.
20. As the Commander, I want to see which Sub-pilots a Slot called, whether they returned and what they wrote, so that I can follow the work inside a Slot.
21. As the Commander, I want Side Slots and Sub-pilots drawn at their Slot outside the ring, each in its own look, so that the ring still shows only what decides the Mission.
22. As the Commander, I want to list Outer Folders in the Project Profile, so that Pilots can keep files outside the Workspace.
23. As the Commander, I want the Laws to hold for Sub-pilots and Side Slots, so that attached work is no way around them.
24. As the Commander, I want the configuration home to stay closed whatever I list, so that a mistake in a Profile cannot open it.
25. As the Commander, I want an Assembly without Sub-pilots, Side Slots or Outer Folders to behave exactly as before, so that my running Projects are not disturbed.
26. As an Assembly author, I want the editor to refuse what the system does not support (a Loop on a Side Slot, a Side Slot of a Side Slot), so that I learn it while editing and not during a Mission.

## Requirements

### Functional

**Sub-pilots**

- FR-1. A Slot may list Sub-pilots. Each names a Unit of the Hangar and may carry a model override, additional Instructions and the flag "required". The same Unit may be a Slot, a Sub-pilot and a Side Slot.
- FR-2. During an Attempt the Slot's Pilot can call each of its Sub-pilots by name, any number of times, also several at once, and receives what each returns. A Sub-pilot works under its Unit's Rules and Instructions and the Slot's additions.
- FR-3. The system records for every Attempt which Sub-pilots were called and which returned.
- FR-4. A required Sub-pilot that was not called, or did not return, in an Attempt makes the Slot's Done Condition fail for that Attempt, with a message that names the Sub-pilot. What follows is what follows any failed Done Condition.
- FR-5. A Sub-pilot has no Done Condition, Attempt count, Loop, Exit Point or Handover status of its own, cannot ask the Commander, and calls no Sub-pilots.
- FR-5a. Sub-pilots are an addition: every Pilot, with or without Sub-pilots, can still call the Engine's own general agents as before. Such a call is not a Sub-pilot: it is not counted for FR-3 and FR-4.
- FR-6. A Sub-pilot may write where its Slot's Pilot may write. The Laws apply to it as to any Pilot.
- FR-7. The cost of a Sub-pilot is part of the cost of its Slot.

**Side Slots**

- FR-8. A Slot of the ordered list may list Side Slots. Each names a Unit and may carry a name unique within the Assembly, a model override, additional Rules and Instructions, context sources and Sub-pilots.
- FR-9. A Side Slot has no Done Condition, Loop, Exit Point, Exit Condition, Memory Mode (its Pilot is always fresh), "may ask the Commander" flag or Side Slots; a configuration that gives it one is invalid.
- FR-10. Each time a Slot is done, also when the Core accepted it with open points, its Side Slots start in the order listed, one after another; a Side Slot that fails does not keep the next from starting. A Slot that is passed by (`skipWhenDone`) does not start them.
- FR-11. The ordered list does not wait for Side Slots: the Mission moves on as it would without them.
- FR-12. When a Slot is done again while its Side Slots from an earlier time still run, the new start is left out and the transcript says so.
- FR-13. A Side Slot runs once per start: one Attempt, no Resolution. It ends as done (its Pilot handed over `done`) or failed (anything else, an Engine error included). No Check runs and the Core judges nothing; the text its Pilot handed over is the Side Slot's note.
- FR-14. The outcome of a Side Slot never changes the Mission's state, the current Slot, any Slot's Attempt, Loop or Resolution count, or any Slot's Slot Output. No Slot can name a Side Slot's output as context.
- FR-15. A Side Slot's context sources are those of a Slot; it can name the Slot Outputs of Slots that are done when it starts.
- FR-16. A Side Slot may write where any Pilot of the Mission may write.
- FR-17. When the Mission's Exit Condition holds, the final report is written and shown, the Mission stays Running while any Side Slot still runs or waits its turn, and becomes Completed when the last has ended, whatever the outcomes. The report names every Side Slot that was started, with its outcome and note as far as known; the Mission page shows the final outcomes.
- FR-18. A running Side Slot can be stopped by the Commander on its own; it then counts as failed and the next one in its list starts.
- FR-19. While the Mission is in the Missions list, a failed or interrupted Side Slot can be run again by the Commander. The system never runs one again by itself. Running again is refused with a message when the Workspace is busy with another Mission.
- FR-20. In Needs Attention, at a Human Checkpoint and in Waiting for usage, Side Slots that were started go on. A Side Slot refused by the usage limit fails.
- FR-21. Stop and Dismiss of the Mission stop every Side Slot of it.
- FR-22. After a restart of the application the Side Slots that were running or waiting are marked interrupted. A Resume does not start them. A Mission interrupted while it only waited for Side Slots becomes Completed on Resume.
- FR-23. A Side Slot has its own status (waiting, running, done, failed, interrupted), note, transcript and cost; its cost counts towards the Mission's cost.

**Outer Folders**

- FR-24. A Project Profile may list Outer Folders as absolute paths. A path that is the configuration home, inside it, or contains it is invalid, and so is a relative path.
- FR-25. Every Pilot of a Mission of the Project, Sub-pilots and Side Slots included, may write inside the Project's Outer Folders. Writing anywhere else outside the Workspace and the Task location stays forbidden by the Laws.
- FR-26. An Outer Folder that does not exist when a Mission starts is reported at the start of the Mission; the system does not create it.
- FR-27. An Outer Folder is not a Knowledge Source unless the Profile lists it as one.

**Screens**

- FR-28. The Assembly editor lets the Commander add, configure, reorder and remove the Sub-pilots and Side Slots of a Slot, and shows both at their Slot outside the ring, each kind in its own look.
- FR-29. The Mission page shows the Side Slots and Sub-pilots of each Slot at that Slot outside the ring, each kind in its own look, with its status. Selecting a Side Slot shows its transcript, cost, and the actions Stop and Run again where they apply. Selecting a Sub-pilot shows what it wrote; in the Slot's transcript its messages are marked as its own.
- FR-30. The Project Profile form lets the Commander edit the list of Outer Folders.
- FR-31. Validation reports, at edit time: a Sub-pilot or Side Slot whose Unit does not exist, a Side Slot with a setting of FR-9, a name that is not unique, an invalid Outer Folder.

### Non-functional

- NFR-1. An Assembly and a Profile written before this work stay valid and behave as before.
- NFR-2. A Mission in which Side Slots run uses at most one Engine session for Side Slots per Slot that started them, beside the session of the ordered list.
- NFR-3. Everything a Side Slot or a Sub-pilot does is subject to the Laws by the same technical means as a Pilot's work, not by instruction.

## Constraints

- A Unit stays Project-independent: nothing about Sub-pilots, Side Slots or Outer Folders is written into a Unit.
- The Core Directives still cannot reorder, skip or add Slots; the Core never starts a Side Slot, writes no prompt for one, judges none, and never calls a Sub-pilot.
- The Mission still stands at exactly one Slot of the ordered list; Resume keeps its meaning.
- A resumed Mission runs on the configuration it started with, its Sub-pilots, Side Slots and Outer Folders included.
- Sub-pilots exist only as far as the Engine can run named agents inside a session; an Engine that cannot is the Engine Adapter's matter, not the Assembly's.
- The repository is public: no file names a Project of the Commander.

## Out of Scope

- The Units that update a glossary, write a demo note, keep a log of achievements or send messages, and any Assembly that uses them.
- Slots of the ordered list that run at the same time.
- Sub-pilots of Sub-pilots, Side Slots of Side Slots.
- Automatic retries of a Side Slot, and running a Side Slot again after its Mission was dismissed or lost with a restart.
- Guards against two Pilots writing to the same file, in the Workspace or in an Outer Folder.
- Per-Slot permissions for Outer Folders.
- A time limit for a Side Slot.
- Checks, Attempts or a Handover status for a Sub-pilot.
- A Done Condition for a Side Slot: its Pilot's Handover is its outcome. It can be added later without changing what exists.

## Open Questions

- OQ-1. Do the Laws' technical means hold inside an agent the Pilot calls, and can such an agent be kept from calling agents itself? Resolved on the real Engine: yes to both. The Laws stop a write of a called agent as they stop a Pilot's, and a called agent can be given no way to call agents or to ask the Commander.
- OQ-2. Does the Engine tell the messages and the cost of a called agent from its caller's? Resolved on the real Engine: the messages, yes; the cost, no. The Engine reports one cost for the session, called agents included, which is what FR-7 asks; a Sub-pilot shows no cost of its own.
- OQ-3. A Completed Mission that was not dismissed disappears with a restart, and with it the chance to run a Side Slot again. Accepted for now; revisit if it hurts. (Commander)

## Further Notes

- The first use is three Side Slots on the last Slot of a software Assembly; there "each time the Slot is done" happens once, at the end.
- The Engine's general agents stay open to every Pilot (FR-5a): a Pilot in a large repository uses one to search without filling its own context. Closing them was considered and dropped for that reason.
- A Side Slot on a Slot inside a Loop runs once per round in which that Slot is done. Whether that is wanted is the Assembly author's decision.
- A Side Slot may write to the Workspace while later Slots work there. The Commander chose no guard; Side Slots meant to leave the Workspace alone say so in their Instructions.
- The idea "a context file that grows with the Missions" in `TODO.md` is now a matter of writing a Unit: an Outer Folder holds the file, a Side Slot keeps it, and the Profile lists it as a Knowledge Source.
