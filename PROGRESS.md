# Progress

The plan agreed with the Commander on 2026-11-12, in the order of work: A, B, D, C, F; E along the way. A group
leaves this file when it is done; the file is deleted after the last one. Done: A (Handover and the Core) and
B (Loop), both in ADR-0007, D (Mission title, limit fields) and C (Resume, Waiting for usage; ADR-0008). The
groups below are not implemented yet.

Not verified against the real Engine: a refusal by the usage limit (it cannot be provoked) and a whole
Resume of a real Mission. Verified live on 2026-11-13: Claude Code resumes a session from a new process.

The Units, the Project `dojo-content` and the Assemblies `cards` and `cards-write` live in `~/.suptron` (the
only copies). The Commander commits; never commit or push unasked.

## F. Slots a later Loop passes through

Wanted for an Assembly with a Pull Request: implementer, tester, reviewer, publication, a Slot that checks
CI and the review comments and loops to the implementer. Not needed while the reviewer is the last Slot.

### Rules

- **A Slot setting "do not run again".** A Slot with it that has an accepted result is skipped when the
  Mission passes through it again because a later Slot's Loop sent the work back. Its own Loop works as
  before: the reviewer loops with the implementer until it accepts, and is not returned to after that.
- The skipped Slot keeps its last Slot Output, which goes on to the Slots that read it. The final report
  says which Slots were skipped in later rounds, because their Output describes earlier work.
- Off by default: a tester and a publication must run again after every change.
- **An outer Loop renews the inner Loop's count.** Two Slots may loop to the same earlier Slot, and a later
  Loop makes every Slot in between run again, an inner looping Slot included. Today the Loop count of a
  Slot is kept for the whole Mission, so an inner Loop that used its three rounds is at its limit at once
  when an outer Loop brings the Mission back to it. It becomes: every round of an outer Loop is new work
  and the inner Loop counts from zero. The worst case multiplies (outer limit times inner limit), which is
  why the default limits stay small (3). No test covers nested Loops today.

### Files

- `config/schemas.ts`, `config/snapshot.ts`, `config/serialize.ts`: the Slot setting.
- `runner/runner.ts`: skip the Slot on a forward pass inside a later Slot's Loop, with an event for the
  skip; reset the Loop count of the Slots between a Loop's target and its looping Slot when that Loop fires.
- Web: the setting in the Slot inspector; the skipped Slot shown as skipped in the Mission.
- Tests: a nested Loop with and without the setting; the skipped Slot's Output still reaches its readers;
  the inner Loop counts from zero after an outer round.
- Docs: `docs/GLOSSARY.md`, `docs/api.md`, `README.md`.

## E. Cleanup

- `core.instructions` of `cards` and `cards-write` lose "the Git conventions", "where the Pull Request is"
  and "judge against the Content requirements".
- Delete this file after the last group.
