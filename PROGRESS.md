# Progress: interview content scenario (Dojo)

The to-do of the scenario that produces interview Cards for the Dojo (`/Users/asuprun/Projects/dojo`) with
Suptron. The Units, the Project
`dojo-content` and the Assemblies `cards` and `cards-write` live in `~/.suptron` (the only copies). Decisions
dated 2026-11-05 were taken with the Commander after run 6.

## State

- Runs 1 to 6 done. Run 4 (React, 80 Cards) and run 6 (Python, 62 Cards, $17.19) completed; the Cards are on
  the Dojo branch `content/task`, committed by the Commander, not pushed.
- The suptron repo holds uncommitted work (batch of 2026-11-03/04, the Engine crash fix with
  `engine-failure.test.ts`); `mise run check` is green. The Commander commits; never commit or push unasked.
- Nobody commits in the Dojo but the Commander; the publisher is not part of the flow and is not planned.

## To do

### Runtime

- [ ] **The judge is an administrator accepting a handover, not a reviewer.** An `llm_judgment` judge sees the
      Slot Output and the Workspace change summary only (`runLlmJudgment` in `checks/runners.ts`; the Core has no
      tools), and we wrote criteria about document contents. Change: (a) `composeSlotPrompt` always asks the Pilot
      to end with a handover: `Produced` (files, where), `Done`, `Open`; Units say nothing about it; (b) the judge
      gets the Task folder's changes of the Attempt (file, created or changed, size; no contents) as a fourth input,
      and its instruction says "accept the handover: holds when the delivery the criterion names is there; never
      fail only because file contents are not visible, say so in the reason"; (c) the editor shows at the criterion
      field what the judge sees; (d) the Core's final report gets an "Open points" part fed by the handovers.
- [ ] **Resume an interrupted or stopped Mission.** The ledger (`missions/active.json`) keeps the summary, the
      Assembly snapshot and every SlotRecord (`attempts`, `loops`, `lastOutput`, Check results, cost); the Mission
      folder and the Workspace stay on disk. Resume builds a runner that starts at the first Slot without a stored
      output, with the finished Slots' `lastOutput` as Slot Outputs and the Loop counters carried over; the
      interrupted Slot gets a fresh Attempt (persistent sessions are lost) with feedback naming the interruption.
      One Resume action for `interrupted` and for stopped by hand. The transcript is not persisted. With it: the
      Engine's `SessionCostLedger` kept in a file next to `active.json`, so a resumed session is not charged its
      running total again.
- [ ] **Two guards before a Loop fires again.** (1) Code: the Loop target's Attempt changed nothing in the
      Workspace and the Task folder and the looping Slot's Done Condition failed again: Needs Attention
      `loop_no_change`, no Core call. (2) Core: something changed; a new call `loopDecision` (the review, the
      target's handover, the round) answers `continue` or `needs_commander` with a reason. Since ADR-0006 the
      Core is the Commander's deputy: both guards go through the Runner's `decide` (a Resolution first, the
      Commander only when the Core may not or could not), and `loopDecision` leans towards deciding, not asking.
      The Retry note of both causes goes to the Loop target; the UI says so. A finding only the Commander can
      resolve is named by the target under `Open`. Sessions stay: reviewer `fresh`, writer `persistent`.
- [ ] **Loop limit: fix the words, keep the count.** The limit counts how many times the Loop may send the work
      back (limit 5: six runs of the looping Slot). Editor field ("Iteration limit" today) and Mission UI say so;
      the round shows as "Loop 3 of 5". Default stays 3.
- [ ] **Title field on the start form**, optional; empty means Project name plus date
      (`dojo-content-2026-11-05`). Slug and Mission name come from it; the first line of a text Task and the
      folder name stop serving as the title. No transliteration.

### Configuration (`~/.suptron`)

- [ ] Writer Unit: remove "Commit with a message that says which items were added". Git is never a working
      Unit's rule; a Slot that must commit says so in its `instructions` in the Assembly.
- [ ] Planner and researcher Units: rewrite the `llm_judgment` criteria about the delivery (OUTLINE.md handed over
      and the interview finished; RESEARCH.md handed over), not the contents; drop "Summarize the requirements as
      your output" from the planner (the handover replaces it).
- [ ] Assembly `cards`: `core.instructions` loses "judge against the Content requirements"; the reviewer's Loop
      limit goes from 5 to the default 3.

### Docs and repo

- [ ] Commit the uncommitted suptron work: the Commander, when they choose; one commit before the code of the
      items above, so the next changes are their own diffs.

## Open, not designed yet

- **Tell the Commander when a Mission needs them.** With Resolutions (ADR-0006) a Needs Attention is rare and
  real; the Commander is away by then and learns of it only on return. A notification (system, push) on
  `needs_attention`, `waiting_for_owner` and `completed`.
- **The Core reads before it resolves.** Today a Resolution rests on the Check results and the Slot Output the
  Core already has. Read access to the Task folder and the Workspace would ground an `accept`; design it with
  the judge item above, only if runs show blind Resolutions going wrong.

- **Cost and usage limits per Mission.** The Commander runs on a subscription: the real limit is usage, which runs
  out and resets hours later. Wants planning (know the window, wait for the reset, resume), not a dollar cap
  alone. Ideas for then: `costCap` in `core` with Needs Attention `cost_cap`; a per-Mission cap on the start form;
  no interrupt inside an Attempt. Run 5: the planner's interview alone took 495k input tokens.

## Decided, no action

- Accept Condition stays judged at the Loop limit only; run 6 was an edge case.
- The 13 Python Cards (FastAPI, Pydantic, pytest) with unversioned documentation sources are accepted as they
  are; the version is named in each Explanation.
- OUTLINE.md's "the owner commits" line was a one-off from the interview; the planner is not changed for it.
- The publisher Slot is dropped from the plan; the Commander commits and reviews the branch by hand.
