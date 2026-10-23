# Suptron: POC

**ADR:** ../../adr/0001-suptron-poc.md
**Status:** draft
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Source:** supersedes "Suptron PRD, Draft v0.1" (2026-10-21). Vocabulary follows ../../GLOSSARY.md.
**Amended:** 2026-10-22 by ../../adr/0002-assembly-editors.md: Exit Condition renamed Done Condition, Exit Points and Checks introduced, Mission state Done renamed Completed, OQ-2 closed.
**Amended:** 2026-10-22 by ./PLAN.md: FR-19 (the system performs no git operations; Git conventions are given to Slots), FR-25 (Loop feedback), FR-42 (no branch deletion at all).

## Problem Statement

Coding agents such as Claude Code can implement, review and test code, but driving one through a whole task is manual work. The Commander prompts each stage separately, re-explains project conventions on every task, waits between stages, and gets one agent that implements, reviews and tests its own work with one model for everything. The Commander works across very different Projects (several work repositories with team conventions, personal repositories with a different flow and higher trust) and cannot express "this is how this Project's work gets done" once and reuse it.

## Goal and Success Criteria

The system itself is not tied to software work: what a Mission produces is defined only by the Slots of its Assembly and their Conditions (see the glossary). This POC proves it on software development, where the result is a draft Pull Request, and its infrastructure (Projects as code repositories, Checkouts, Git conventions, the git-specific Laws) is built for that case only.

Goal: the Commander describes a Task once, starts a Mission, and the system delivers a draft Pull Request that has been implemented, internally reviewed, tested and PR-reviewed by separate agents, while the Commander watches progress and can stop at any time.

The POC is judged by the Commander, not by a metric. The POC is considered successful when the Commander, after running real Tasks through it, decides that composing specialized Units under a Core beats a single agent doing everything. Three indicators the Commander will look at:

1. A real Task reaches Completed without the Commander typing anything between Slots other than Human Checkpoint answers.
2. The same system runs two visibly different Assemblies for two different Projects without any change to the system itself.
3. The Commander can tell from the UI alone why a Mission went to Needs Attention.

## Solution

The system is a local web application on the Commander's machine. It is a layer on top of Claude Code (the Engine), not a new coding agent.

The Commander builds a **Hangar** of Units: reusable agent definitions such as analyst, implementer, reviewer, tester, publisher, each with its rules, instructions, a required model and a default Done Condition. For every Project the Commander writes a **Project Profile** once: where the repository is, which documents describe the Project's conventions (Knowledge Sources), and its Git conventions. Then the Commander composes one or more **Assemblies** per Project: Core Directives plus an ordered list of Slots, where each Slot is a Unit placed with concrete settings. An Assembly belongs to one Project and is never shared between Projects; Units are shared by all.

To start work, the Commander opens the UI, picks an Assembly, points it at the Task documents, picks a Checkout and starts a **Mission**. The **Core** executes the Slots strictly in order, gives each Pilot exactly the context configured for it, checks every Done Condition with deterministic tools, retries, follows Loop rules and marks the Mission Completed when it leaves the Assembly through an Exit Point (the last Slot is always one). The Core never declares a Mission Completed on its own. The Commander watches the live transcript of the current Slot, answers questions when a Slot is allowed to ask, and can Stop the Mission at any moment. If the Mission cannot continue it waits in Needs Attention, and the Commander chooses Stop or Retry with a note.

The system contains no knowledge of any particular scenario. The primary scenario from the original PRD is the **test configuration** of the POC, built entirely from Units and an Assembly:

analyst (may ask the Commander) → implementer → reviewer with Loop back to implementer → tester with Loop back to implementer → publisher (opens a draft Pull Request) → reviewer of the Pull Request with Loop back to implementer; Completed when the PR reviewer is done, meaning the PR has no open comments and CI passed.

## User Stories

Configuration

1. As the Commander, I want to create a Unit with a name, rules, instructions, a model and a default Done Condition, so that I define each specialized agent once.
2. As the Commander, I want to reuse the same Unit in several Assemblies and several times inside one Assembly, so that a reviewer's rules live in one place.
3. As the Commander, I want to flag a Unit as "may ask the Commander", so that only the analyst interrupts me by default.
4. As the Commander, I want to create a Project Profile with the repository location, Knowledge Sources and Git conventions, so that agents never guess how my Project works.
5. As the Commander, I want to create several Assemblies for one Project, so that a feature, a bug fix and a refactoring can follow different flows.
6. As the Commander, I want to place a Unit into an Assembly as a Slot and override its model, add instructions, pick which earlier Slot Outputs it sees, set its Done Condition, Memory Mode, Loop rule and Exit Point, so that the same Unit behaves differently in different positions.
7. As the Commander, I want to configure the Core Directives of an Assembly, including the Core's model, Attempt limits and Loop limits, so that orchestration fits the Project.
8. As the Commander, I want to do all of this in the UI, with files remaining the source of truth, so that I can also edit the configuration in my code editor and both ways stay equivalent.
9. As the Commander, I want to remove or add any Slot, including dropping the PR review entirely, and still have the Assembly run, so that the system does not lock me into one flow.

Starting a Mission

10. As the Commander, I want to start a Mission from the UI by choosing an Assembly, a Task location on disk, an optional Work Item ID and a Checkout, so that I never type a prompt to start work.
11. As the Commander, I want to toggle "may ask the Commander" per Slot when starting a Mission, so that I can run a Task fully autonomously or with more checkpoints without editing the Assembly.
12. As the Commander, I want to pick any existing Checkout of the Project that is not busy with another Mission, so that no extra worktrees are created on my machine.
13. As the Commander, I want to run several Missions at the same time, including on the same Project in different Checkouts, so that I am not blocked by one long Task.
14. As the Commander, I want a Task to be a folder (SPEC and PLAN) or a single document, so that I am not forced into one document structure.

Execution

15. As the Commander, I want the Core to run Slots strictly in the configured order and never skip, add or reorder them, so that the Assembly I wrote is the Assembly that runs.
16. As the Commander, I want each Slot to be executed by its own Pilot, and the reviewer to never be the agent that implemented, so that review stays critical.
17. As the Commander, I want each Slot to receive only the context configured for it, so that the tester judges the change by the diff and the rules, not by the implementer's reasoning.
18. As the Commander, I want to choose per Slot whether its agent is fresh on every execution or keeps its session for the whole Mission, so that the implementer can continue its own work while the reviewer looks with fresh eyes.
19. As the Commander, I want Done Conditions and Exit Conditions to be built from Checks and checked by deterministic tools (tests pass, CI green, no open comments) wherever possible, so that Completed means something.
20. As the Commander, I want a Slot whose Done Condition fails to be retried up to its Attempt limit, and a Loop rule to send the Assembly back to an earlier Slot up to its iteration limit, so that review-fix cycles happen without me.
21. As the Commander, I want the Mission to go to Needs Attention instead of ending when limits are exhausted, so that work is never silently lost.
22. As the Commander, I want the analyst to ask me questions about the Task and wait, and to record my answers in a new document next to the Task without editing my SPEC or PLAN, so that clarifications survive the Mission.
23. As the Commander, I want the publisher to open the Pull Request as a draft, so that nothing reaches my colleagues before I decide.
24. As the Commander, I want the PR reviewer to leave its comments on the real Pull Request and the implementer to resolve them, so that I can see the whole review cycle where I normally review code.
25. As the Commander, I want the Mission to wait for CI with a configurable timeout and treat a failed CI as another Loop iteration, so that Completed includes green CI where the Project has CI.
26. As the Commander, I want the Mission to use a snapshot of the Assembly, Units and Project Profile taken at start, so that editing a Unit does not change a Mission that is already going.

Observing and controlling

27. As the Commander, I want to see every active Mission with its current Slot and status on one screen, so that I know what is happening at a glance.
28. As the Commander, I want each Mission on its own page with the live transcript of the current Slot (agent messages and tool calls), so that I can follow and later understand what the agent did.
29. As the Commander, I want the UI to show me when a Mission is waiting for my answer and let me answer there, so that the UI is the only place I need to watch.
30. As the Commander, I want to Stop any Mission at any moment, leaving the branch and draft Pull Request as they are, so that I stay the final authority.
31. As the Commander, I want to Retry the current Slot from Needs Attention with an optional note to the agent, so that one wrong turn does not force me to restart the whole Mission.
32. As the Commander, I want to see the cost of a Mission so far and per Slot, in dollars with tokens as a secondary figure, so that I know which Slots are expensive.
33. As the Commander, I want a Completed page with the Pull Request link, the list of Slots with Attempt and Loop counts, the costs and the Core's final report, so that I can decide what happens next.
34. As the Commander, I want Missions interrupted by closing the application to appear as Stopped with an "interrupted" note, so that I am never misled about their state.

Safety

35. As the Commander, I want the system to be technically unable to push to or merge into the default branch, force-push, delete shared branches, deploy, change repository, CI or secret settings, or mark a Pull Request ready for review, regardless of any configuration, so that one bad configuration cannot damage a work repository.
36. As the Commander, I want agents to be unable to change their own rules or the Assembly, so that behaviour stays what I configured.

## Requirements

### Functional

Units

- FR-1. The system keeps one shared Hangar of Units, independent of Projects.
- FR-2. A Unit has a name, rules, instructions, a required model, a default Done Condition (a list of Checks) and a default "may ask the Commander" flag.
- FR-3. Units can be created, edited and deleted in the UI.

Project Profiles

- FR-4. A Project Profile holds: the repository's local location and remote, its Knowledge Sources (documents and folders), its Git conventions (default branch, branch name template, Pull Request description template, optional labels or reviewers), the repository host, the CI wait timeout and the Engine.
- FR-5. Project Profiles are stored by the system, outside the repository, and can be created, edited and deleted in the UI.
- FR-6. All Checkouts of one repository share one Project Profile.

Assemblies

- FR-7. An Assembly is bound to exactly one Project Profile. A Project may have several Assemblies. An Assembly is never shared between Projects.
- FR-8. An Assembly contains Core Directives and an ordered list of Slots.
- FR-9. Core Directives define the Core's model, default Attempt limit, default Loop limit, how context is assembled, how Checks are judged, when to go to Needs Attention and how to report. Core Directives cannot reorder, skip or add Slots, and can never declare a Mission Completed.
- FR-10. A Slot references one Unit and may set: a model override, additional instructions, the explicit list of context sources (Task documents, Knowledge Sources, the Checkout, named earlier Slot Outputs), a Done Condition override, a Memory Mode (fresh or persistent), a Loop rule (target Slot and iteration limit, default 3), an Exit Point flag with an Exit Condition, and the "may ask the Commander" flag. The last Slot is always an Exit Point; an earlier Exit Point must have a non-empty Exit Condition.
- FR-11. By default a Slot receives the Task documents, the Knowledge Sources, the Checkout and its instructions, and no Slot Outputs of earlier Slots.
- FR-12. The same Unit may appear as several Slots in one Assembly.
- FR-13. Assemblies can be created, edited and deleted in the UI.
- FR-14. Configuration files are the source of truth; editing in the UI and editing the files directly produce equivalent results.
- FR-15. The system executes any Assembly built from any Units in any order, with or without Loops, with or without a Pull Request. The system has no built-in knowledge of the primary scenario.

Missions

- FR-16. A Mission is started from the UI with: an Assembly, a Task location (folder or single document) on local disk, an optional Work Item ID, a Checkout and the per-Slot "may ask the Commander" toggles prefilled from the Assembly.
- FR-17. The list of Checkouts offered for a Project is discovered from the repository; the Commander selects one. A Checkout busy with an active Mission cannot be selected. The system never creates or deletes Checkouts.
- FR-18. Several Missions may be active at the same time, including on the same Project in different Checkouts.
- FR-19. A Mission works under the Project Profile's Git conventions. The system renders the conventions (branch name template with the Work Item ID, if given, and a slug derived from the Task; Pull Request description template; labels; reviewers) and gives them to every Slot as context. The system itself never creates, switches, pushes or deletes branches; a Slot creates the branch when its Instructions say so, and the Commander may start a Mission in a Checkout that is already on the intended branch.
- FR-20. A Mission uses a snapshot of its Assembly, Units and Project Profile taken at start; later edits do not affect it.
- FR-21. The Core runs Slots strictly in order. Before moving on it checks the current Slot's Done Condition; every Check is deterministic except the LLM-judgment Check, which is used only when configured. Done Conditions and Exit Conditions are lists of Checks from the system's fixed catalogue.
- FR-22. Every Slot execution is performed by a Pilot created from the Slot's Unit. The Pilot for a reviewer Slot is never the Pilot that implemented.
- FR-23. In Memory Mode "fresh" the Pilot is new on every execution; in "persistent" it keeps its session across all executions of that Slot within the Mission.
- FR-24. If a Slot's Done Condition fails, the Core retries the Slot up to its Attempt limit. If the Slot has a Loop rule, the Assembly instead returns to the target Slot, up to the Loop's iteration limit. When either limit is exhausted the Mission goes to Needs Attention.
- FR-25. Each Slot leaves a Slot Output that later Slots receive only when named in their context configuration. Two exceptions are implicit: when a Loop sends the Assembly back to an earlier Slot, that Slot receives the Slot Output of the Slot that looped together with its failed Checks (Loop feedback); when a Slot is attempted again, it receives its failed Checks and the Commander's Retry note, if any.
- FR-26. A Slot flagged "may ask the Commander" can ask questions; the Mission then waits for the Commander's answer in the UI (a Human Checkpoint). Slots without the flag cannot ask.
- FR-27. The analyst Unit's answers are recorded in a new document next to the Task; the system never modifies the Commander's existing Task documents.
- FR-28. The publisher opens the Pull Request as a draft. The system never marks it ready for review.
- FR-29. The PR reviewer posts its findings as comments on the real Pull Request; the implementer resolves them. The concrete definition of "open comment" belongs to the reviewer Unit's configuration, but it must be deterministically checkable.
- FR-30. When a Slot's Done Condition includes CI, the Mission waits for CI up to the Project Profile's timeout. A failed CI counts as a failed Done Condition (and so triggers the Loop rule); a timeout sends the Mission to Needs Attention.
- FR-31. Once a Slot is done, if it is an Exit Point and its Exit Condition holds (an empty Exit Condition always holds), the Mission is Completed and the remaining Slots do not run. The last Slot is always an Exit Point; if its Exit Condition is non-empty and fails, the Mission goes to Needs Attention. The Core never marks a Mission Completed by any other route.
- FR-32. Mission states: Running, Waiting for Commander (Human Checkpoint), Needs Attention, Stopped, Completed.
- FR-33. Entering Needs Attention interrupts the running Pilot; nothing executes while the Mission waits. From Needs Attention the Commander can Stop, or Retry the current Slot with an optional note that is given to the Pilot; Retry starts a new Attempt. There is no "continue despite failed Done Condition".
- FR-34. Stop interrupts the current Slot immediately, leaves the branch, Checkout and Pull Request untouched and marks the Mission Stopped. A Stopped Mission cannot be resumed.
- FR-35. Missions active when the application shuts down are shown as Stopped with an "interrupted" note on the next start.

UI

- FR-36. The UI lists all active Missions with current Slot and state, updating in real time.
- FR-37. Each Mission has its own page with the live transcript of the current Slot: agent messages and tool calls, scrollable.
- FR-38. The Mission page shows pending questions and lets the Commander answer them. The UI is the only notification channel.
- FR-39. The Mission page offers Stop at any time and Retry with a note in Needs Attention.
- FR-40. The Mission page shows cost so far in dollars (tokens secondary) for the Mission and per Slot, taken from the Engine.
- FR-41. The Completed page shows the Pull Request link, Slots with Attempt and Loop counts, costs and the Core's final report.

Safety

- FR-42. The Laws are enforced by the system, not by instructions to agents, and cannot be changed by any configuration: no push to or merge into the default branch, no force-push or rewriting of shared history, no deletion or renaming of any branch, local or remote, including the Mission's own, no deployment, no change to repository, CI or secret settings, no marking a Pull Request ready for review.
- FR-43. Inside its Checkout a Pilot works without permission prompts.
- FR-44. Agents cannot modify Units, Assemblies, Project Profiles or Core Directives.

### Non-functional

- NFR-1. Missions on the Commander's macOS machine only while the application is open; no requirement to run while the laptop is closed or on a server.
- NFR-2. Single user, no login, no sharing.
- NFR-3. The Engine is accessed only through the Engine Adapter so that another coding agent can be added later without rebuilding the system. Only Claude Code is implemented in the POC.
- NFR-4. The repository host is accessed only through a host-specific integration so that other hosts can be added later. Only GitHub is implemented in the POC.
- NFR-5. The system uses only models and tools allowed in the environment where it runs; company rules for work repositories apply and are the Commander's responsibility to respect through configuration.
- NFR-6. Progress shown in the UI must reflect the Mission with no perceptible delay for a human watching.

## Constraints

- Claude Code is the only Engine in the POC; the Commander's existing Claude Code setup and credentials are used.
- GitHub is the only repository host in the POC; the Commander's existing GitHub authentication is used.
- Task documents and Knowledge Sources are local files on the Commander's disk.
- The Laws from FR-42 apply to every Mission on every Project without exception.
- Configuration must be plain files that a code editor can edit (FR-14).
- The Commander must not work in a Checkout while a Mission uses it; the system does not police this.

## Out of Scope

- CLI for starting Missions (everything goes through the UI).
- Budget limit per Mission; the only cost guard is the Loop iteration limit.
- Parallel Slots and conditional branches inside an Assembly. An early exit through an Exit Point is not a branch and is in scope.
- Assembly templates shared across Projects (Units are the only shared building block).
- Pausing a Mission, resuming a Stopped Mission, or giving instructions mid-mission beyond the Retry note.
- Mission history, analytics, success metrics and reporting.
- Memory between Missions; every Mission starts from the Task, the Knowledge Sources and the Checkout only.
- Creating or deleting worktrees from the UI.
- Other Engines and other repository hosts.
- Notifications outside the UI.
- Multiple users, permissions, sharing.
- Automatic merge, marking a Pull Request ready, deployment.
- Self-tuning or self-learning agents.
- Reading the content of the Work Item from the tracker.

## Open Questions

- OQ-1. Closed on 2026-10-22: the product is named Suptron, see ../../adr/0004-robot-vocabulary.md.
- OQ-2. Closed on 2026-10-22: see ../assembly-editors/SPEC.md and ../../adr/0002-assembly-editors.md.
- OQ-3. Which Project will be the first real test. Commander, before the first Mission; the system itself is environment-agnostic.
- OQ-4. Company policy for work repositories (allowed models, tools, accounts). Commander and company policy, before the first Mission on a work repository.

## Further Notes

- The original PRD listed "ADR" as the Task. Under this project's own process an ADR records only why; the what and how live in SPEC and PLAN. The Task is therefore the feature documents, with the ADR reached through them.
- The original PRD had the Core asking clarification questions itself. That is now the analyst Unit; the Core never performs a Slot's work.
- Decisions carried over unchanged from the original PRD's decision log: layer over an existing coding agent; single user; strict ordered Assembly; agent-reviewed Pull Request; real-time UI required; several concurrent Missions; Stop as the only in-mission control besides Retry; runs only while the machine is awake.
