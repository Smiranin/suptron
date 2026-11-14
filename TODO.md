# TODO

Open work and ideas. Delete an entry when it is done; delete the file when it is empty.

## Next

- [ ] **Make the rest of the Hangar Project-agnostic:** `planner`, `researcher`, `writer`.
      Decided: `writer` stays a Unit of its own (`implementer` is about code: names, errors,
      framework); it only loses its Project specifics to the Slot.
- [ ] **The stage after the Pull Request: comments and CI.** A Slot with the Checks
      `pr_no_open_comments` and `ci_green` that loops back to `implementer`. Decided:
      `publisher`, when it runs again after the fix, pushes, answers each thread from the
      implementer's report (what was changed, or why not) and resolves it. Kept simple on
      purpose: the Commander reads the Pull Request anyway.
- [ ] **Check on the real Engine:** a Resume of a real Mission, a refusal by the usage limit,
      the Core reading files together with structured output, the list of worktrees in the
      start form of a `repository` Project.

## Ideas

- [ ] **A context file that grows with the Missions.** A Slot keeps a file up to date (a
      glossary or the like), and the file is a Knowledge Source of the Project. To decide:
      where the file lives (the repository, seen by everyone, or outside it, where the Laws
      forbid a Pilot to write), which Slot writes it, and what is worth an entry (true for
      any Task of the Project and not already in `CLAUDE.md`).
