# TODO

Open work and ideas. Delete an entry when it is done; delete the file when it is empty.

## Next

- [ ] **Make the rest of the Hangar Project-agnostic:** `planner`, `researcher`, `writer`.
      Decided: `writer` stays a Unit of its own (`implementer` is about code: names, errors,
      framework); it only loses its Project specifics to the Slot.
- [ ] **Check on the real Engine:** a Resume of a real Mission, a refusal by the usage limit,
      the Core reading files together with structured output, the list of worktrees in the
      start form of a `repository` Project.
- [ ] **Show what a running Pilot is doing.** Seen on 2026-11-20: the publisher failed on
      "PR not mergeable", and the Mission looked failed and finished, while a new Pilot was
      already merging `main` into the branch. The only sign of life in the UI was the Core
      marked as running. Minutes later the log and the status of the Pilot did show up, so
      the UI covers the case in part. To find first: in which stretch nothing is shown (a
      guess: while the Core decides after a failure and no Pilot runs yet). To decide: what
      to show there and how a failure that is being repaired differs on screen from one
      that waits for the user.
- [ ] **Stop a Loop that cannot change its result.** Seen on 2026-11-20: a test that fails
      the same way on the base branch sent the Loop to the implementer three times, and the
      Rules forbade the implementer to touch the file. To decide: who notices that the
      failure is outside the Task (the tester, by a run on the base branch, or the Core, by
      the same failure twice in a row) and that the user is asked at once.
- [ ] **A Pilot removes what it creates outside the Checkout.** Seen on 2026-11-20: a Pilot
      added a git worktree in the Mission folder to run a test on the base branch, left it
      there, and the Core asked the user to remove it by hand.

## Ideas

- [ ] **A context file that grows with the Missions.** A Slot keeps a file up to date (a
      glossary or the like), and the file is a Knowledge Source of the Project. To decide:
      where the file lives (the repository, seen by everyone, or outside it, where the Laws
      forbid a Pilot to write), which Slot writes it, and what is worth an entry (true for
      any Task of the Project and not already in `CLAUDE.md`).
