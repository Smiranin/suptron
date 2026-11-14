# A Pilot hands over with a Status; the Core trusts it and reads only where asked

Status: accepted (2026-11-12); implemented in the runtime (`domain/handover.ts`, `Runner.decide`, the Core calls `resolveAttention` and `judge`)

ADR-0006 made the Core the Commander's deputy but left it blind: it decided on Check results and on what the judge had said, and an `llm_judgment` was judged on the Slot Output and a change summary, never on the files. In the content scenario this failed in both directions. A researcher wrote in its own output that entries were missing and the Mission went on, because nothing read that. A judge asked whether a document was complete answered from the Pilot's summary of the document.

We decided three things.

**Every Pilot ends with a Handover.** The runtime appends to the Instructions of every Slot how to end the Slot Output: a block `Produced / Done / Open` and a last line `Status: done | open | failed`. No Unit says anything about it. Plain code reads the last Status line. `done`: the Core is not asked, the Done Condition runs. `open`, `failed`, or no readable Status line: the Runner asks the Core for a Resolution with the new cause `handover_not_done`, the same way for all three.

**The Core has the final word.** While a Slot has Resolutions left, the Core may answer `retry`, `accept` or `commander`. When they are used up and an `accept` is possible, the Core is asked once more with `mayRetry: false`: it accepts the result as it is or sends the Mission to the Commander. The final word is not counted against the limit. An accepted Handover does not replace the Done Condition: its Checks still run. What plain code keeps from ADR-0006 is unchanged: a failed Check that is not an `llm_judgment` and the last Exit Condition are never accepted, and there the Mission goes straight to the Commander when the Resolutions are used up.

**The Core can read, always; its instructions say when.** The Core gets `Read`, `Glob` and `Grep` in every call, with the Task folder as its working directory and the Workspace next to it. It reads at a Resolution (to see what is really open or failed) and in an `llm_judgment` (the Commander asked for a check of the result); never while composing a prompt, explaining a Needs Attention or writing the report. A Handover that says `done` is trusted and not verified. An `llm_judgment` is therefore an explicit, strict test that costs a Core call with file reads, set only where a real check is wanted.

## Considered Options

- **Trust the Status, read on demand (chosen).** The Core is not a second worker: on the usual path (`done`) it is not called at all. It costs a Core call only where the Pilot itself says something is open, and file reads only where a decision or a test needs them.
- **The judge verifies every Handover against a list of files plain code supplies.** Grounded, but the Core repeats every Pilot's work on every Slot and the Mission pays twice. Rejected.
- **Grant read access per call (Resolution and judgment only).** The same behaviour by construction instead of by instruction, at the price of two Engine configurations for one persistent Core session. Rejected: one session with one set of tools is simpler, and the instruction is short.
- **Leave the Core blind and only add the Status.** An `open` could be sent back, but the Core would still decide on words, and an `llm_judgment` about a file would stay a judgment about a summary. Rejected.

## Consequences

- A Pilot that marks `done` over open points is still trusted. The Handover text says so plainly; the guard against it is an `llm_judgment` on the Slot, where the Commander wants one.
- The Status is the Pilot's word on its own job: a reviewer that finished its review hands over `done` whatever it found. What it found is the business of its Done Condition and its Loop.
- A Slot Output without a Status line costs a Core call; the Core then reads the output and decides as for `open`.
- ADR-0006's option "the Core reads the Task folder and the Workspace before deciding", deferred there, is now taken.
