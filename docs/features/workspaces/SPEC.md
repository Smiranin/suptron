# Workspaces: Projects without a repository or without a folder

**ADR:** ../../adr/0005-workspaces.md
**Status:** implemented (2026-10-26)
**Amended:** 2026-10-26 by ./PLAN.md: FR-6 and FR-15 (the `checkout` context source is removed; the Workspace fragment is always in the Core's bundle, so a hand-written Assembly of a `none` Project is valid by default), FR-10 (one busy rule over one key: the realpath of the Checkout or folder, none for `none`), FR-2 (a Knowledge Source reaches the Core as a path or text reference; relative paths resolve against the Workspace's working directory).
**Source:** finding F-1 of ../../scenarios/interview-content.md. Vocabulary follows ../../GLOSSARY.md.
**Amends:** POC SPEC FR-4, FR-6, FR-16 to FR-19, FR-41, FR-43 (../suptron-poc/SPEC.md); editors SPEC FR-14, FR-15, FR-33 (../assembly-editors/SPEC.md); Missions SPEC FR-2, FR-3, FR-7, FR-14 (../missions-ui/SPEC.md).

## Problem Statement

Every Project of the POC is a code repository. A Project Profile cannot be saved without a repository path, a Mission cannot start without a Checkout, and the runtime reads branches and diffs on every Mission. Tasks that have no repository (research, content, booking a flight) or a folder without git (notes, a data folder) cannot be run at all, although the GLOSSARY promises that what a Mission produces is defined only by its Slots. The second test scenario needs this, and the Commander wants a Project to declare its type once rather than toggle a set of independent options.

## Goal and Success Criteria

Goal: the Commander chooses one of three project types when creating a Project, and the system asks for, offers and shows only what that type has.

Success criteria:

1. A Project of kind `none` runs an Assembly of `command` and `llm_judgment` Checks to Completed without the Commander choosing any directory.
2. A Project of kind `folder` runs the same Assembly in its directory and refuses a second Mission while the first runs.
3. The existing primary scenario (kind `repository`) runs unchanged: Checkout selection, Git conventions, Pull Request Checks, Pull Request in the report.
4. An Assembly that uses a Check or context source its Project's kind does not provide is invalid in the editor, with the reason shown, before any Mission starts.

## Solution

**One field decides.** The Project Profile has a `workspace` section with a `kind` of `none`, `folder` or `repository` and the fields of that kind only. `folder` has a path. `repository` has a path, a protected branch, a host (`github` or `none`), the Git conventions and the CI wait timeout. Nothing else in the Profile depends on git.

**One interface underneath.** At Mission start the runtime resolves the Profile's Workspace into one object that answers: the working directory of the Engine, the roots a Pilot may write to, the capabilities (`files`, `git`, `host`), the context fragment for the Core (Git conventions for a repository, the path for a folder, nothing for `none`), the change summary for `llm_judgment` (the diff against the protected branch, or nothing), whether the Workspace is busy, and the outcome for the report (branch and Pull Request, path, or nothing). The Runner, the Checks, the Laws and the report composition use this object and never the kind.

**Capabilities gate Checks and context.** Every Check in the catalogue declares the capabilities it requires: `command` and `llm_judgment` none, `pr_exists`, `pr_no_open_comments` and `ci_green` the host. Context sources declare them too: Checkout and Git conventions require `git`. Assembly validation takes the Project's kind and rejects anything the kind does not provide; the editors do not offer it.

**The Mission folder is always there.** Every Mission gets `missions/<id>/` in `SUPTRON_HOME`: `task.md` for a text Task, notes a Pilot leaves next to the Task, later the transcript. For kind `none` it is also the working directory. It is removed on Dismiss.

**Knowledge Sources are paths or texts.** A relative path resolves inside the Workspace of the Mission (the Checkout, so a worktree reads its own copy); an absolute path or an inline text works for every kind; a relative path is invalid for kind `none`.

## User Stories

Project types

1. As the Commander, I want to choose "no folder", "folder" or "repository" when I create a Project, so that a Project for booking a flight does not ask me for a repository.
2. As the Commander, I want the Profile form to show only the fields of the chosen type, so that I am never asked for a branch name of a Project that has no git.
3. As the Commander, I want to change the type of an existing Project, with the fields of the old type dropped and a warning when an Assembly becomes invalid, so that a Project can grow from a folder into a repository.
4. As the Commander, I want to write background knowledge directly into the Profile as text, so that a Project without files still has conventions.

Assemblies

5. As the Commander, I want the Check picker to offer only Checks my Project's type can evaluate, so that I never build a Done Condition that cannot run.
6. As the Commander, I want the Context tab to offer Checkout and Git conventions only for a repository Project, so that the editor matches the Project.
7. As the Commander, I want an Assembly saved by hand with an unavailable Check to be marked invalid with the Check named, so that the mistake is visible on the Projects page.

Missions

8. As the Commander, I want the Start Mission dialog to ask for a Checkout only for a repository Project, so that starting a Mission on a folder or "no folder" Project is Task and Start.
9. As the Commander, I want a folder Project to refuse a second Mission while one runs, and a "no folder" Project to allow any number, so that concurrent Missions never write into each other.
10. As the Commander, I want the Missions list and the Mission page to show the branch and the Pull Request only when the Project has them, and the folder path for a folder Project, so that the screens are not full of empty fields.
11. As the Commander, I want the final report of a "no folder" Mission to say what was produced and where (the Mission folder, the Task location), so that I can find the result.

## Requirements

### Functional

Project Profile

- FR-1. A Project Profile has a `workspace` section with `kind` ∈ {`none`, `folder`, `repository`}. `folder` has `path` (absolute, must exist). `repository` has `path` (absolute, must be a git repository), `remote`, `protectedBranch`, `host` ∈ {`github`, `none`}, `git` (branch name template, Pull Request template, labels, reviewers) and `ciWaitTimeoutMinutes`. A kind has no fields of another kind; unknown fields are a validation error.
- FR-2. A Knowledge Source is `{ path }` or `{ text }` (with an optional `title`). A relative `path` is resolved against the Workspace root of the Mission and is invalid for kind `none`; an absolute `path` must exist at save time; `text` is given to Slots verbatim under its title.
- FR-3. The Profile form shows the kind as the first choice and only the fields of the chosen kind. Changing the kind drops the fields of the old kind after a confirmation and re-validates the Project's Assemblies.
- FR-4. The Profile editor's git defaults lookup (remote, protected branch) runs only for kind `repository`.

Capabilities and validation

- FR-5. Each Check kind in the catalogue declares the capabilities it requires: `command` and `llm_judgment` require none; `pr_exists`, `pr_no_open_comments` and `ci_green` require `host`. Each Workspace kind provides a fixed set: `none` provides nothing, `folder` provides `files`, `repository` provides `files` and `git`, plus `host` when its host is not `none`.
- FR-6. The context source Git conventions requires `git`. Task documents, Knowledge Sources and Slot Outputs require nothing. There is no Checkout context source: every Slot receives the Workspace fragment of FR-15. Amended 2026-10-26 by ./PLAN.md.
- FR-7. Assembly validation takes the Project's Workspace kind. A Check or context source whose requirements the kind does not provide makes the Assembly invalid with a message naming the Slot and the Check or source. The Check picker and the Context tab do not offer them; an Assembly file written by hand is validated the same way.
- FR-8. A Unit's default Done Condition is not validated against a kind (Units are Project-independent); the validation happens where the Unit is placed in a Slot.

Mission start and execution

- FR-9. Starting a Mission on a `repository` Project requires a Checkout as today. On a `folder` or `none` Project no Checkout exists and none is asked for or accepted.
- FR-10. Busy rule: every Workspace instance has a busy key (the realpath of the folder, the realpath of the Checkout, none for `none`); a Mission cannot start while an active Mission has the same key. So a `folder` Workspace is busy while any Mission of that Project is active, a `repository` Checkout is busy as today, and a `none` Workspace is never busy. Amended 2026-10-26 by ./PLAN.md.
- FR-11. Every Mission has a Mission folder `missions/<id>/` in `SUPTRON_HOME`, created at start for every kind and every Task form. It holds `task.md` for a text Task and whatever a Pilot writes next to the Task when the Task is text. It is removed on Dismiss.
- FR-12. The Engine's working directory is the Checkout (`repository`), the folder (`folder`) or the Mission folder (`none`). The Task location is an additional directory in every case.
- FR-13. The Laws on paths allow writes only inside the Workspace's write roots and the Task location; the `.git` rule applies wherever a `.git` directory is found. The Laws on commands are the same for every kind; the protected-branch rule applies only where the Workspace knows a protected branch.
- FR-14. The `llm_judgment` Check feeds the Core the Slot Output and the Workspace's change summary: the diff against the protected branch for `repository`, nothing otherwise. The criterion is judged on what is available.
- FR-15. The Core's context for every Slot includes the Workspace's own fragment: the Checkout, its branch and the protected branch for `repository`, the folder path for `folder`, the Mission folder path for `none`. The rendered Git conventions stay a separate context source a Slot of a `repository` Project asks for. Amended 2026-10-26 by ./PLAN.md.
- FR-16. On completion the Mission's outcome comes from the Workspace: branch and Pull Request (when found) for `repository`, the path for `folder`, the Mission folder for `none`. The Core's report is asked to describe what was produced and where.

Screens

- FR-17. The Start Mission dialog shows the Checkout select only for `repository` Projects; the Task location, Work Item ID and Advanced section are unchanged.
- FR-18. Missions list rows and the Mission page header show the branch only for `repository`, the folder path for `folder` and nothing for `none` in the place of the Checkout; the Pull Request link appears only when a Pull Request is known.
- FR-19. The Completed view shows the Workspace outcome of FR-16 in place of the Pull Request link when there is no Pull Request.
- FR-20. The Projects page shows each Project's kind next to its name.

### Non-functional

- NFR-1. The runtime has exactly one place that maps a Profile to a Workspace; nothing else in `packages/runtime`, `apps/server` or `apps/web` switches on the kind except the Profile form and the two display rules of FR-18 and FR-19.
- NFR-2. The primary scenario's behaviour, events and HTTP contract do not change for `repository` Projects beyond the Profile file format and the fields listed here.

## Constraints

- The Engine always needs a working directory; "no folder" is a Commander-facing promise, not an Engine property.
- No backward compatibility for the Profile file format; the example home is rewritten and gains a `none` Project with one small Assembly.
- The fixed Check catalogue stays fixed; capabilities are declared by the system, not by the Commander.

## Out of Scope

- Tools or MCP servers per Project (browser control for a flight booking).
- Persisting transcripts into the Mission folder (the folder is prepared for it, nothing is written yet).
- Hosts other than GitHub; a `repository` with `host: none` simply has no host capability.
- Several Workspaces per Project or per Mission.
- Migration tooling for existing Profiles.

## Open Questions

- OQ-1. Whether a `folder` Workspace that happens to be a git repository should warn the Commander in the Profile form. Default: no warning; `folder` means "git ignored" by definition.
- OQ-2. Where the Knowledge Source texts are edited in the UI: a list of path-or-text rows in the Profile form is assumed.
