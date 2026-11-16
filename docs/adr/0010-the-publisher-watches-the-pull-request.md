# The publisher watches the Pull Request until it is ready to merge

Status: accepted (2026-11-16); implemented in the runtime (the Check `pr_mergeable`, `laws/commands.ts`) and in the Hangar Units `publisher` and `implementer`

The first Mission on a large repository ended the moment the Pull Request was opened: the publisher's Done Condition was `pr_exists`, and nobody waited for a CI run of forty minutes or for the review of a bot. The stage after the Pull Request had been on the to-do list as a Slot of its own. Three things on a real repository shaped it: smoke jobs fail at random and only need a rerun, a bot review arrives a few minutes after the Pull Request and is worth acting on before CI ends, and a conflict with the base branch can appear at any time, before CI or while it runs.

We decided four things.

**The publisher stays until the Pull Request is ready to merge.** Its Done Condition in such an Assembly is `pr_exists`, `pr_mergeable`, `pr_no_open_comments`, `ci_green`, `pr_mergeable`, with a Loop to the implementer. The Checks stop at the first that fails, so a conflict or a comment sends the work back without waiting for CI; the second `pr_mergeable` catches a conflict that appeared during the wait. No new Slot: the publisher already knows the Pull Request and runs again after every fix anyway.

**The Pilot watches and sorts, the Checks decide.** After opening the Pull Request the publisher polls it. It reruns the jobs its Slot names as rerunnable without looking into the cause, up to the Slot's limit; on anything else (a conflict, review comments, another failed job) it ends its turn and puts every problem it sees into one Handover, so the implementer fixes them in one round. On its next run it pushes, answers each thread from the implementer's report, resolves it and asks the bot for a new review when the bot does not review new pushes by itself.

**`pr_mergeable` is a Check.** A conflicting Pull Request runs no CI, and `ci_green` reads "no checks" as "no CI", so without it a conflict passed as green. The host computes mergeability in the background; the Check waits while it is unknown and times out (a Resolution) if the host never answers.

**Two Laws are narrowed.** Rerunning a CI job is allowed: it changes no CI setting. Marking a Pull Request ready for review is no longer a Law: whether a Pull Request is a draft is the Commander's choice for each Project, and the `publisher` Unit keeps "never mark it ready" as its own rule.

## Considered Options

- **The publisher watches, with `ci_green` in its Done Condition (chosen).** The rules for flaky jobs and bots belong to the Project and live in the Slot.
- **The runtime waits and calls the Pilot only on a failure.** No tokens while waiting, but a failed Check would have to choose between a new Attempt and the Loop by the Pilot's verdict, a new kind of Loop. Rejected for now.
- **Only the Done Condition, no rerun.** Every flaky smoke job costs a full round through the implementer, the reviewer and the tester. Rejected.
- **Rebase and force-push on a conflict.** Needs a Law that knows the Mission's own branches. Merging the base branch into the Mission's branch needs no Law change and the history is squashed on merge. Rejected.

## Consequences

- A publisher's session can last as long as CI does; the Engine has no limit on a Pilot session.
- A Pilot can rerun a job that fails for a real reason; the Slot's limit of reruns bounds the cost.
- A Mission may now open a Pull Request that is not a draft and may mark one ready; both are left to the Slot's Instructions.
- A `pr_mergeable` that times out is reported under the cause `ci_timeout`.
