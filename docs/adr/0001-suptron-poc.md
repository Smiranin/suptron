# Build the POC as a generic Assembly runner: LLM Core over reusable Units

Status: accepted

We want to take a Task from documents to a draft Pull Request without prompting between stages. We decided to build a thin local layer on top of an existing coding agent (Claude Code, behind an Engine Adapter) in which an LLM Core executes a project-bound Assembly composed of reusable, project-independent Units. The system knows nothing about the primary scenario: any ordered Assembly of any Units runs the same way, and Done is simply the Exit Condition of the last Slot. We chose this over a single do-everything agent and over a hard-coded pipeline because the hypothesis under test is that specialized agents per Slot, composed per project, produce better results, and that hypothesis can only be tested if the composition is free.

## Considered Options

- **Generic Assembly runner with LLM Core and reusable Units (chosen)**: Units are shared across Projects and configured per Slot; Assemblies are bound to one Project; the Core's rules are configurable but can never reorder, skip or add Slots. Lets the Commander remove or add any Slot (for example drop the PR review) without changing the system.
- **Hard-coded primary scenario**: fastest to build, but it tests one flow, not the thesis that assemblies should differ per project. Rejected.
- **Single agent that implements, reviews and tests its own work**: the status quo we are trying to beat. Rejected by definition.
- **Deterministic orchestrator in code instead of an LLM Core**: predictable, but cannot judge free-form situations (what context to assemble, whether a retry makes sense). Rejected; instead the Core is an LLM but every Exit Condition is checked by deterministic tools where possible.
- **New coding agent instead of a layer**: huge scope, and Claude Code already does the hard part. Rejected; the Engine Adapter keeps the door open for other engines later.

Secondary decisions taken in the same session, recorded here because they are easy to get wrong later:

- **Project Profile lives in the system's own data, not in the repository**: work repositories stay clean, all Checkouts of a repository share one profile, and the UI owns the files it edits.
- **Missions use an existing Checkout picked by the Commander, the system never creates or deletes worktrees**: the Commander already keeps several worktrees per project and does not want more created; parallel Missions on one Project simply use different Checkouts.
- **Laws are enforced technically and cannot be configured away**: the configurable policy lives in the Project Profile, the floor lives in the system.
- **Needs Attention offers Stop or Retry with a note, never Continue**: Continue would allow a Pull Request with failing tests; Retry with a note is the only mid-mission instruction in the POC.
- **No CLI, no per-Mission budget, no Mission history in the POC**: everything goes through the local web UI; the only cost guard is the Loop iteration limit.

## Consequences

- Slots are isolated by default; information flows between Slots only through explicitly named Slot Outputs, the Checkout and the Task documents. Assembly authors must wire the implementer to the reviewer's output themselves.
- The Commander cannot work in a Checkout while a Mission uses it; the system does not police this.
- Because the Core is an LLM, its model is part of the Assembly's Core Directives and its cost is part of the Mission's cost.
