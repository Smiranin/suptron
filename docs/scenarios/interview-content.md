# Scenario: interview preparation content

**Status:** planned, waiting for the content site repository
**Created:** 2026-10-26
**Glossary:** ../GLOSSARY.md
**Example Assembly this builds on:** ../../examples/suptron-home/projects/my-app/assemblies/feature.yaml

## Why this scenario exists

The POC was built and judged on one scenario: a SPEC and a PLAN become a draft Pull Request. This scenario is the
second, deliberately different one. Its purpose is to exercise every mechanic of the system on a task that is not
software development, find what breaks or feels wrong (flow, UI, architecture), fix it and improve. The content it
produces is useful on its own: questions and answers for interviews as a React.js, Node.js and Python developer.

The Commander's goal for the content: good interview questions with answers that are current and modern (2025 to
2026), with best-practice code examples and sources.

## Two projects, two sessions

1. **Content site** (separate session, separate repository, PRD written by the Commander): a website the Commander
   will use to learn from the content. The content lives inside that repository, in a data folder (name to be
   decided there). That repository is the Project of this scenario; the Assembly below writes into its data folder.
2. **Content Assembly** (this document, this session): the Units, the Assembly and the content requirements that
   produce the content through Suptron.

Order: the site repository is created first, then this scenario is configured against it. Until then, everything
below is a plan, not configuration.

### What the site session must give back

- Repository URL and the absolute path of the local clone.
- Name of the data folder and the file format the site reads (Markdown with frontmatter, MDX, JSON, ...). The
  content requirements and the validator script follow that format.
- Whether one file per topic or one file per role suits the site. Default: one file per topic,
  `data/<role>/<topic>.md`.
- Any site conventions worth being a Knowledge Source (schema of frontmatter, how topics are listed).

## The Assembly (option B, agreed 2026-10-26)

One Mission produces the content for one role. Three Missions (React, Node, Python) run in three worktrees of the
site repository, which also tests concurrent Missions on one Project.

| # | Slot               | Unit               | Memory     | Context                                   | Done Condition                                                                     | Loop / Exit                            | What it tests                                       |
| - | ------------------ | ------------------ | ---------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| 1 | `planner`          | `planner` (new)    | fresh      | Task, Knowledge Sources                   | `llm_judgment`: OUTLINE.md lists topics with question counts and covers the Task   | may ask the Commander                  | Human Checkpoint, Task documents, `llm_judgment`    |
| 2 | `researcher`       | `researcher` (new) | fresh      | Task, Slot Output of `planner`            | `command`: validator checks RESEARCH.md has sources with URL and date per topic    |                                        | web tools inside a Pilot, long Slot, Slot Output    |
| 3 | `writer`           | `writer` (new)     | persistent | Task, Knowledge Sources, Outputs of 1 and 2 | `command`: validator checks every question has answer, example, sources           |                                        | `command` Check, Attempts, persistent memory        |
| 4 | `content-reviewer` | `content-reviewer` (new) | fresh | Task, Knowledge Sources, Output of `writer` | `llm_judgment`: no blocking findings remain                                     | Loop → `writer`, limit 3               | Loop with feedback, reviewer isolation              |
| 5 | `publisher`        | `publisher` (reuse) | fresh     | Git conventions                           | `pr_exists`                                                                        | Exit Point, empty Exit Condition       | GitHub host, Completed, final report                |

Core Directives: `opus`, default limits, instructions as in the example Assembly plus "judge content against the
requirements document named in the Knowledge Sources".

### Units to add to the Hangar

- **planner** (`sonnet`, may ask the Commander). Reads the Task (the role file) and the requirements. Asks the
  Commander what the Task leaves open: seniority level, topics to stress or skip, number of questions, language.
  Writes `OUTLINE.md` next to the Task: topics, question count per topic, agreed answers. Never changes existing
  Task documents. Output: the outline summary.
- **researcher** (`sonnet`). For every topic of the outline searches the web for current material: official docs,
  release notes, well-known blogs, dated 2024 or later unless the topic is timeless. Writes `RESEARCH.md` next to
  the Task: per topic, the facts that matter and the sources with URL and date. Never writes into the data folder.
  Output: the list of topics with source counts and anything it could not find.
- **writer** (`sonnet`, persistent). Writes the content files into the data folder in the format of the
  requirements, one file per topic, using only RESEARCH.md and its own knowledge, citing sources from RESEARCH.md.
  On Loop feedback addresses every finding and says what changed. Never edits site code. Output: list of files and
  question counts.
- **content-reviewer** (`opus`, fresh). Reviews the content files against the requirements: is every answer correct,
  current, does the example show the best practice, is a source cited, is the level right. Lists every blocking
  finding with file and question. States explicitly whether a blocking finding remains. Never edits files.
- **publisher**: reused from the example Hangar (commit, push, draft Pull Request).

### Project side (inside the site repository)

- `REQUIREMENTS.md` (Knowledge Source): what a question entry contains (question, short answer, detailed answer,
  code example, common follow-ups, sources with date), what "current" means per stack (versions to assume), style,
  level labels, language.
- `tasks/react.md`, `tasks/node.md`, `tasks/python.md`: the Task of each Mission. Role, level, topic hints,
  target number of questions, anything role-specific.
- `scripts/check-content.*`: the validator behind the `command` Checks of `researcher` and `writer`. Deterministic,
  exits non-zero with a readable list of violations, so that Attempt feedback is actionable.
- Data folder: the output of `writer`.

### Content requirements, first draft

- Per role: 8 to 12 topics; per topic: 5 to 10 questions; levels middle and senior marked per question.
- Each answer: a two-sentence answer for the interview itself, then the detail, then a code example that shows the
  current best practice, then likely follow-up questions, then sources with dates.
- "Current" means the versions the Commander will meet in 2026: React 19 with Server Components and Actions,
  current LTS Node with native test runner, fetch and ESM, Python 3.12+ with typing, asyncio and modern tooling.
  Exact versions are fixed in REQUIREMENTS.md when the site session settles the stack.
- No answer without a source for a claim that depends on a version.

## What we expect to learn

A checklist to walk through while the Missions run; every item that fails becomes a finding below.

- Human Checkpoint: the planner's questions reach the UI, the answers reach the Pilot, the Mission continues.
- Web tools: a Pilot on the Claude Code preset can use WebSearch and WebFetch; the transcript shows them.
- `command` Check: the validator's output reaches the next Attempt as feedback and the writer acts on it.
- Loop: the reviewer's findings reach the writer, the writer keeps its session, the loop count shows in the UI.
- `llm_judgment` without a meaningful diff: the Check reads the diff summary against the protected branch; for
  content the diff is the content itself, check the verdicts make sense.
- Three concurrent Missions in three worktrees: no shared state leaks, the Missions list stays readable.
- Final report: says what was produced, where, and what remains open.
- UI: can the Commander tell from the Mission page alone what each Slot did and why it looped.

## Findings and improvements for Suptron

Recorded as they come up; each one that earns a design gets its own SPEC or ADR under `docs/features` or `docs/adr`.

### F-1: git must not be mandatory (raised 2026-10-26, closed 2026-10-26: ../adr/0005-workspaces.md, ../features/workspaces/SPEC.md, implemented by ../features/workspaces/PLAN.md)

A Mission that books a flight, writes a document or prepares content has no repository, no branch and no Pull
Request. Today git is assumed throughout:

- `Project Profile` requires `repository.path`, a protected branch and a branch name template
  (`packages/runtime/src/config/schemas.ts`).
- Starting a Mission requires a `checkoutPath` (`apps/server/src/routes/missions.ts`), and the Mission summary reads
  the current branch (`refreshBranch` in `packages/runtime/src/runner/runner.ts`).
- The `llm_judgment` Check feeds a git diff summary to the Core (`packages/runtime/src/checks/runners.ts`).
- The Laws on paths know about `.git`, and the Laws on commands are git-centred (`packages/runtime/src/laws`).
- `pr_exists`, `pr_no_open_comments` and `ci_green` only make sense with a host.
- Completion looks up a Pull Request for the branch (`complete` in the Runner).

Decision (ADR-0005): a Project Profile declares a Workspace of one kind, `none`, `folder` or `repository`; the
kind is the single source of truth and the runtime talks to one Workspace interface. The scenario above still uses
git (the site repository), so this does not block it. Implemented 2026-10-26: the example home has a `research`
Project of kind `none` with the `brief` Assembly (`researcher` → `brief-writer`).

## Open items

- Site repository details (see "What the site session must give back").
- Whether the Task files and OUTLINE.md / RESEARCH.md live in the site repository or outside it; the Laws allow
  writes only inside the Checkout and the Task location, so "next to the Task" works either way.
- Whether the validator is written here or in the site session (it depends on the site's data format).
