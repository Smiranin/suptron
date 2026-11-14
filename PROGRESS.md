# Progress

The plan agreed with the Commander on 2026-11-12, in the order of work: A, B, D, C, F; E along the way. A group
leaves this file when it is done; the file is deleted after the last one. Done: A (Handover and the Core) and
B (Loop), both in ADR-0007. The groups below are not implemented yet.

The Units, the Project `dojo-content` and the Assemblies `cards` and `cards-write` live in `~/.suptron` (the
only copies). The Commander commits; never commit or push unasked.

## D. Small UI

### Title on the start form

- An optional Title field. Empty means the Project name and the date (`dojo-content-2026-11-12`).
- The Mission's name and slug come from it; the first line of a text Task and the name of the Task folder
  stop serving as the title. No transliteration.
- Known and accepted: two Missions of one Project on one day without a Title get the same name; where a
  Project makes branches from the slug, set the Title by hand.
- Files: the start form's schema and dialog, the start request, `runner/mission-registry.ts`, tests,
  `docs/api.md`.

### Limit fields

- One shared number field that keeps the typed text and applies it on blur; an empty field shows the
  default as a placeholder instead of filling it in. Today a cleared field snaps back to the default, so
  `0` cannot be typed (it becomes `20`).
- It replaces "Core decision limit", "Default Attempt limit", "Default Loop limit" and the Slot's Loop
  limit.
- Files: a new component in `apps/web/src/components`, `CoreDirectivesPanel.tsx`, `Inspector.tsx`, the
  editor tests.

## C. Mission life cycle

### Resume

- **The ledger keeps what a Resume needs:** the resolved snapshot the Mission started with (Units,
  `mayAskCommander`), what reopens the Workspace, the Engine session ids, the Loop counts and the
  Resolution counts. Stopped and interrupted Missions stay in it until Dismiss, not until the next restart.
- **One Resume action** on a Stopped Mission, for stopped by hand and for interrupted.
- **Where it continues:** the first Slot without an accepted result. Finished Slots do not run again; their
  Slot Outputs go on as before.
- **The interrupted Slot** gets a fresh Attempt told that the previous one was interrupted and that it must
  check what is already there. What it left in the Workspace stays.
- **Configuration:** the stored snapshot, not the files on disk.
- **Pilot memory:** the Engine sessions are resumed; when a session cannot be resumed, the Slot starts a new
  one with the note. First step of the work: a live test that Claude Code resumes a session after a server
  restart; if it does not, every resumed Slot starts a new session.
- **Session costs** move from memory to a file next to the ledger, so a resumed session is not charged its
  running total again.
- **The Workspace is reopened;** a busy Checkout or a missing folder refuses the Resume with a message.
- **Accepted loss:** the transcript before the Resume is gone; Slot Outputs and Check results stay.

### Usage limit

- The Engine recognises a refusal by the usage limit (the SDK's `rate_limit_event` with status `rejected`)
  and reports when the limit resets.
- The Mission enters a new state "Waiting for usage" that shows the time; at the reset the same Attempt
  starts again in the same session. The wait costs neither an Attempt nor a Resolution. It covers Core
  calls too. Stop works during the wait.
- One rule for every kind of limit (five hours, seven days).
- No reset time reported: as today, an Engine error.
- A server restart during the wait leaves the Mission interrupted; the Commander resumes it.
- Known from the SDK's types only: the event cannot be provoked in a test, so the tests use the fake Engine.

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
