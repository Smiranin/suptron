# A later Loop renews the Loops inside it and may pass done Slots by

Status: accepted (2026-11-12); implemented in the runtime (`Runner`: `loopBack`, `moveOn`; the Slot setting `skipWhenDone`)

An Assembly with a Pull Request has two Slots that loop to the implementer: a reviewer in the middle, and at the end a Slot that checks CI and the review comments. A round of the later Loop makes every Slot in between run again, the reviewer included. Two things were wrong with that. The Loop count of a Slot was kept for the whole Mission, so a reviewer that had used its rounds before the Pull Request was at its limit the moment the later Loop brought the Mission back to it. And a review that had accepted the work ran again in full after every CI fix, although nobody asked for a second review.

We decided two things.

**A round of a later Loop is new work.** When a Loop fires, the Loop counts of the Slots between its target and its looping Slot start from zero. The looping Slot's own count goes on: its limit bounds its rounds as before.

**A Slot may say "do not run again".** A Slot with `skipWhenDone` that has an accepted result is passed by when the Mission comes through it in the round of a later Slot's Loop: it does not run, an event says so (`slot.skipped`), and its last Slot Output still goes to the Slots that read it. In the round of its own Loop it runs as ever, so a reviewer loops with the implementer until it accepts and is not returned to after that. The setting is off by default: a tester and a publication must run again after every change.

## Considered Options

- **Renew the inner counts (chosen).** Each limit keeps the meaning the Commander set it with: so many rounds for this piece of work.
- **Keep one count per Slot for the whole Mission.** Bounds the total, but the inner limit then depends on what happened before the outer Loop existed, and the usual outcome is a Needs Attention nobody can act on. Rejected.
- **Skip every done Slot in a later round by default.** Shorter Missions, but a tester that does not run after a fix is a gap. Rejected; the Slot's author says which Slots are safe to pass by.
- **Let the looping Slot name the Slots it passes by.** The knowledge sits with the Slot that is skipped, not with the one that loops, and two looping Slots would have to agree. Rejected.

## Consequences

- The worst case multiplies: outer limit times inner limit rounds. The default limits stay small (3).
- The Slot Output of a Slot that was passed by describes the work as it was before those rounds. The Slot record counts how often (`skipped`), the Mission page shows it, and the final report names such Slots under the open points.
- A Slot that was passed by is not an Exit Point in that round: its Exit Condition is not judged again.
