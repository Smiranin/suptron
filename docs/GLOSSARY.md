# Suptron

A personal system that assembles specialized AI agents into one robot that carries a Task from start to finish without step-by-step prompting. The agents run on an existing agent (the Engine), and nothing in the system is tied to one Engine or to one kind of work: what a Mission produces is defined only by the Slots of its Assembly and their Conditions. The first use is software development, where an Assembly turns a SPEC and a PLAN into a draft Pull Request; that is the primary scenario, not the purpose of the system. The name joins "Sup", the first letters of the author's surname (with a nod to support, super and supreme), and "-tron" from combining robots like Voltron.

## Language

The main nouns follow one metaphor: a combining robot. Units wait in the Hangar, are mounted into the Slots of an Assembly, are flown by Pilots under the Core, and go out on a Mission given by the Commander; the Laws hold whatever happens. The mechanics (Done Condition, Exit Point, Loop, Attempt, Check, Checkout) keep plain names on purpose. The former names are listed under _Avoid_ so that old text is recognisable.

**Project**:
The place the system works on, described by its Project Profile. Its Workspace says what kind of place it is: a code repository, a plain folder, or no folder at all.
_Avoid_: Repo (when the profile is meant), codebase

**Task**:
The input of a Mission: one or more documents that describe the work (usually a SPEC and a PLAN, sometimes a single implementation plan) or text typed at start, optionally with a Work Item ID. Text is stored as `task.md` in the Mission folder, so every Mission has a Task location on disk.
_Avoid_: Ticket, ADR (an ADR is only one possible part of a Task), issue

**Work Item ID**:
An optional identifier from the Commander's tracker attached to a Task; used only to name what the Mission produces, such as a branch and a Pull Request.
_Avoid_: Ticket number, story ID

**Assembly**:
The Core Directives plus an ordered, configured list of Slots (Units placed with their settings) that together carry a Task to its result. What the result is (a Pull Request, a report, anything else) is defined only by the Slots and their Conditions; the system has no built-in goal. An Assembly is bound to one Project and is never shared between Projects; a Project may have several Assemblies.
_Avoid_: Pipeline, flow, process, Workflow (former name)

**Unit**:
A reusable, Project-independent building block of an Assembly: an agent definition with a name (analyst, implementer, reviewer, tester), Rules, Instructions, a required model and a default Done Condition. Units live in one shared Hangar; placing one into an Assembly makes a Slot.
_Avoid_: Sub-agent, component, module, plugin, agent role, Brick (former name)

**Hangar**:
The one shared library of Units, independent of Projects. A Unit is defined once in the Hangar and can be placed into any Assembly of any Project.
_Avoid_: Library, catalogue, registry, Unit library

**Rules**:
The constraints and prohibitions of a Unit that hold wherever the Unit is used; a Slot can add Rules but never weaken them.
_Avoid_: Policies, guardrails (those are the Laws), constraints

**Instructions**:
The description of the job a Unit does; a Slot extends it with its own additional Instructions.
_Avoid_: Prompt, system prompt, guidance

**Slot**:
One Unit placed at one position of an Assembly under a name unique within that Assembly, with its concrete configuration: model override, additional Instructions, context sources, Done Condition override, Memory Mode, Loop rule, Exit Point flag with Exit Condition, and the "may ask the Commander" flag. The same Unit may appear as several Slots; Loops and Slot Outputs refer to Slots by name.
_Avoid_: Step, stage, phase, task, Node (former name)

**Slot Output**:
The result a Slot leaves behind (text or markdown) that later Slots receive only when their configuration names it. Slots are isolated by default.
_Avoid_: Step output, artifact, handoff, result, Node Output (former name)

**Handover**:
The block every Pilot ends its Slot Output with: what it produced, what is done, what is open, and a Status line (`done`, `open` or `failed`). The system tells every Pilot how to write it; no Unit does. Plain code reads the Status: `done` is trusted and the Done Condition runs; anything else, a missing Status line included, is the Core's to decide by a Resolution.
_Avoid_: Report, summary, handoff, sign-off

**Loop**:
A rule on a Slot: "if my Done Condition does not hold, go back to Slot X", with a Loop limit: how many times the work may go back (its own, or the default of the Core Directives: 3, so the looping Slot runs up to four times). At the limit the Core takes a Resolution: its `retry` grants one more round (the target works again with the Core's note and the last findings, then the looping Slot runs once), and when that fails the limit is reached again. The Commander's Retry from Needs Attention grants a round the same way. Two Slots may loop to the same earlier Slot. A round of a later Slot's Loop makes every Slot in between run again and is new work for them: a Loop inside it counts from zero, so in the worst case the rounds multiply (outer limit times inner limit). A Slot with the setting "do not run again" (`skipWhenDone`) that is already done is passed by in such a round: it does not run, keeps its last Slot Output for the Slots that read it, and the final report names it. Its own Loop is not affected; the setting is off by default.
_Avoid_: Cycle, retry (a retry is one Slot repeating, a Loop is several)

**Memory Mode**:
Whether a Slot's agent is created fresh on every execution (fresh) or keeps its session for the whole Mission (persistent). A reviewer is typically fresh, an implementer persistent.
_Avoid_: Session mode, statefulness

**Attempt**:
One execution of a single Slot. A Slot may be attempted several times before its limit is reached; at the limit the Core takes a Resolution or the Mission goes to Needs Attention.
_Avoid_: Retry, try

**Resolution**:
A decision the Core takes in the Commander's place at a point where plain code cannot go on (a Handover that is not `done`, an Attempt or Loop limit, a failed last Exit Condition, a CI timeout, an Engine error): one more Attempt with the Core's own note, or the result accepted with its open points. An accepted Handover still has to pass the Done Condition. Each Slot has a limit of Resolutions (Core Directives, default 3, 0 turns them off); a forward move, a Loop into the Slot and the Commander's Retry start the count afresh; a looping Slot keeps its count across a round it was granted. When the limit is used up and there is something to accept, the Core has the final word: it accepts or hands the Mission to the Commander, with no further Attempt to grant. Plain code keeps what a Resolution can never be: accepting a Check that is not an `llm_judgment`, accepting an Exit Condition, retrying a second Engine error in a row. Every Resolution is written to the transcript and to the final report.
_Avoid_: Auto-retry, override, self-healing

**Done Condition**:
The list of Checks that must all hold for a Slot to count as done, so that the Core may move past it. Deterministic where possible (tests pass, CI green, no open comments); an LLM judgment only when configured.
_Avoid_: Acceptance criteria, gate, exit condition (that is the condition to leave the Assembly)

**Exit Point**:
A Slot flagged as a place where the Assembly may end. The last Slot of an Assembly is always an Exit Point; an earlier Exit Point must carry a non-empty Exit Condition, or the Slots after it would be unreachable.
_Avoid_: End node, terminal node, final node

**Exit Condition**:
The list of Checks on an Exit Point, evaluated only once the Slot is done: when they hold, the Mission is Completed and the remaining Slots do not run. An empty Exit Condition means "exit as soon as the Slot is done".
_Avoid_: Early exit, completion condition, done condition

**Check**:
One verifiable condition from the system's fixed catalogue (for example: a command exits with 0, CI is green, the Pull Request exists, the Pull Request has no open comments, an LLM judgment against a written criterion), with its parameters. An LLM judgment is an explicit test of a result: the Core reads the files the criterion names and judges strictly. Done Conditions and Exit Conditions are built from Checks; the Commander cannot define new kinds of Check.
_Avoid_: Assertion, validation, test (a test is one thing a Check may run)

**Core**:
The LLM agent that orchestrates a Mission under the Core Directives of its Assembly: it hands each Pilot its context, checks Done Conditions and Exit Conditions with deterministic tools, decides on Attempts and Loops, and stands in for the Commander: where a Mission would wait for them it takes a Resolution, and sends the Mission to Needs Attention only when the decision is not its own to take. It trusts a Handover that says `done`; it can read the Task folder and the Workspace, and does so only before a Resolution and in an LLM judgment. It never declares a Mission Completed on its own, never changes the structure of the Assembly and never touches code itself. On the Assembly's clock it is the circle in the centre.
_Avoid_: Orchestrator, supervisor, manager, brain, Master Agent (former name)

**Core Directives**:
The configurable part of an Assembly that governs the Core: its model, Attempt, Loop and Resolution limits, how context is assembled, how Checks are judged, when to go to Needs Attention, how to report. Core Directives can never reorder, skip or add Slots.
_Avoid_: Core config, orchestration policy, Master Rules (former name)

**Pilot**:
The agent instance that performs the work of one Slot, created from the Slot's Unit. The agent that reviews is never the agent that implemented.
_Avoid_: Step agent, worker, sub-agent, Node Agent (former name)

**Project Profile**:
The rarely changing facts about one Project shared by all its Assemblies: its Workspace (and, for a repository, its Git conventions, host and CI timeout), its Knowledge Sources and its Engine.
_Avoid_: Project config, project settings

**Workspace**:
Where the Missions of a Project work, declared once in the Project Profile as exactly one kind: `none` (the Mission folder in `SUPTRON_HOME`), `folder` (a fixed directory, git in it ignored) or `repository` (a Checkout of a git repository). The kind decides what a Mission is given (the working directory, the write roots of the Laws, the Checks and context sources an Assembly may use, whether a Checkout is picked at Launch) and what the screens show; nothing else configures these.
_Avoid_: Environment, target, location (when the kind is meant)

**Knowledge Source**:
A document or folder listed in a Project Profile (as a path, relative to the Workspace root or absolute), or a text written into the Profile, that tells agents how the Project works: conventions, architecture notes, ADRs.
_Avoid_: Context files, docs, rules (rules belong to Units)

**Human Checkpoint**:
The moment a Pilot asks the Commander a question and the Mission waits for the answer. Only Slots flagged "may ask the Commander" can do this; by default only the analyst Unit is flagged. The set of flagged Slots is the Mission's level of autonomy.
_Avoid_: Approval gate, pause point, manual step, autonomy level

**Mission**:
One execution of an Assembly for one Task in the Project's Workspace: a Checkout for a repository (under the Project's Git conventions; the system itself never creates or switches branches, a Slot does when its Instructions say so), the folder, or the Mission folder. Every Mission has a title, given by the Commander at start or made of the Project name and the date, which names the Mission and, through the Git conventions, what it produces. Every Mission has a Mission folder `missions/<id>/` in `SUPTRON_HOME`, removed on Dismiss. Several Missions may be active at the same time, also on the same Project: in different Checkouts, or any number on a Project without a folder.
_Avoid_: Job, execution, session, Run (former name)

**Checkout**:
An existing working copy (the main clone or a git worktree) of a Project whose Workspace is a repository, picked by the Commander when starting a Mission. A Checkout is busy while a Mission uses it; the system never creates or deletes Checkouts.
_Avoid_: Working copy, worktree (a worktree is one kind of Checkout)

**Needs Attention**:
The state of a Mission that cannot continue without the Commander: the Core used up its Resolutions on a Slot, judged that the decision belongs to the Commander (it would change the Task, break a Unit's Rules, or the Engine has no access), or met a point plain code reserves for the Commander. Nothing runs while a Mission is in Needs Attention; the Mission waits, it does not end.
_Avoid_: Failed, error, blocked

**Stopped**:
The state of a Mission the Commander stopped, or that a restart of the application interrupted (it then carries the note "interrupted"). Whatever the Mission produced so far (in the software scenario, the branch and the Pull Request) is left as it is. A Stopped Mission frees its Workspace and waits for a Resume or a Dismiss.
_Avoid_: Cancelled, aborted, killed

**Resume**:
The Commander's action that lets a Stopped Mission go on. The Workspace is reopened and the Slot the Mission stood at runs again as a new Attempt, in the Engine session of the interrupted one where that session still exists, told that it was interrupted and that it first checks what is already there. Slots that were done do not run again; their Slot Outputs, the Loop counts and the Resolution counts are kept. A resumed Mission runs on the configuration it started with, not on the files as they are now. A busy Workspace or a missing folder refuses the Resume.
_Avoid_: Restart, continue, rerun

**Waiting for usage**:
The state of a Mission whose Engine refused a call by the usage limit and said when the limit resets. Nothing runs; at the reset the Mission goes on by itself with the same Attempt in the same session, or with the same Core call. The wait costs neither an Attempt nor a Resolution, the Workspace stays busy, and Stop works. A refusal without a reset time is an Engine error.
_Avoid_: Rate limited, paused, throttled

**Completed**:
The state of a Mission that left its Assembly through an Exit Point: a Slot flagged as an Exit Point is done and its Exit Condition holds, both checked by the Core against the Slot's Checks. What Completed means is therefore defined entirely by the Slots' Conditions; the Core never declares a Mission Completed on its own. In the primary software scenario: the last Slot is done, meaning no open Pull Request comments and CI passed.
_Avoid_: Done (a Slot is done, a Mission is Completed), finished, merged

**Dismiss**:
The Commander's action that removes a Completed or Stopped Mission from the Missions list. A Stopped Mission stays until it is dismissed, over restarts too; a Completed one that was not dismissed disappears with a restart.
_Avoid_: Delete, archive, clear, close

**Commander**:
The single user of the system: the person who starts Missions, answers Human Checkpoints, decides what happens to the result and judges whether the POC succeeded.
_Avoid_: User, developer, operator, Owner (former name)

**Laws**:
The set of actions the system never performs regardless of configuration: writing outside the Workspace and the Task location, touching the configuration home, pushing to or merging into the protected branch (where the Workspace knows one), force-pushing, deleting or renaming any branch, deploying, changing repository, CI or secret settings, marking a Pull Request ready for review. Like the laws of robotics, they are built into the system and no configuration can change them.
_Avoid_: Guardrails, safety rules, Never-list (former name)

**Engine**:
The underlying coding agent that actually writes and reviews code on behalf of a Pilot. Claude Code is the only Engine of the POC.
_Avoid_: Backend, provider, runtime

**Engine Adapter**:
The single interface through which the system talks to an Engine, so that another Engine can be added without rebuilding the system.
_Avoid_: Driver, plugin, connector
