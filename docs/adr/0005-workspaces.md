# A Project declares its Workspace kind; git is one kind, not a prerequisite

Status: accepted (2026-10-26); implemented by ../features/workspaces/PLAN.md

The POC built every Project as a code repository: the Project Profile requires a repository path, a protected branch and Git conventions; a Mission starts in a Checkout; the `llm_judgment` Check feeds a git diff to the Core; the Laws reason about branches; the final report looks for a Pull Request. The GLOSSARY and the POC SPEC already say the system is not tied to software work, but the infrastructure is. The second test scenario (docs/scenarios/interview-content.md, finding F-1) made it concrete: a Mission that books a flight has no repository and no folder of its own; a Mission that writes notes has a folder and no git.

We decided that a Project Profile declares a **Workspace** of exactly one kind, and that everything git-related belongs to one of those kinds:

| Kind         | Where the Mission works                       | Commander picks at Launch | Capabilities           |
| ------------ | --------------------------------------------- | ------------------------- | ---------------------- |
| `none`       | the Mission folder in `SUPTRON_HOME`          | nothing                   | none                   |
| `folder`     | a fixed directory; git in it is ignored       | nothing                   | files                  |
| `repository` | a Checkout of the repository                  | the Checkout              | files, git, host (opt) |

The kind is the single source of truth. The Engine's working directory, the roots a Pilot may write to, the Checks and context sources an Assembly may use, what the Start Mission dialog asks, and what the report and the Mission page show are all derived from it and are never configured separately. Under the hood the Runner, the Checks and the Laws talk to one Workspace interface resolved at Mission start, not to the kind.

## Considered Options

- **Explicit Workspace kind on the Project Profile, a discriminated union (chosen)**: the Commander chooses a project type once; each kind carries only its own fields; validation and the editors know at edit time which Checks and context sources exist. Costs a format change of the Profile and a Workspace abstraction in the runtime.
- **Optional `repository` and `host` fields on the Profile**: the smallest diff, but every consumer branches on "is there a repository?", and the Profile grows a set of fields that only mean something together. The Commander judged it a code smell. Rejected.
- **Choose the Workspace at Mission start, Project holds only Knowledge Sources and Assemblies**: most flexible, but an Assembly's Checks depend on the Workspace's capabilities, so an Assembly could only be validated at Launch, and "where this Project lives" and the busy-Checkout rule would have no home. Rejected.
- **No folder at all for the `none` kind**: not possible with the Engine; Claude Code always runs in a working directory and reads its settings there. The Mission folder, which already exists for text Tasks, is that directory. Rejected as stated, achieved for the Commander: nothing to pick.

Secondary decisions taken in the same session:

- **Every Mission has a Mission folder**, for every Workspace kind and whether the Task was given as text or as a path: `task.md` for a text Task, notes a Pilot leaves next to the Task, and in the future the transcript. It lives in `SUPTRON_HOME`, outside any repository, and is removed on Dismiss as today.
- **A Knowledge Source is a path or an inline text.** A relative path resolves against the Workspace root (the Checkout of this Mission, so worktrees read their own copy) and is invalid for the `none` kind; an absolute path and an inline text are valid for every kind.
- **The git Laws on commands stay on for every kind.** Forbidding force-push and branch deletion outside a repository is harmless, and one set of Laws is simpler to reason about than a conditional one. The protected-branch Law applies where a protected branch is known.
- **No backward compatibility** for the Profile format; the example home is rewritten and gains a `none` example. The POC is personal.
- **The term is Workspace, not a themed noun**, following ADR-0004: it is a mechanic that implementing agents must read literally. Checkout stays the name of a Workspace instance of the `repository` kind.

## Consequences

- The GLOSSARY gains Workspace and its kinds, Checkout is narrowed to the `repository` kind, and "workspace" leaves its _Avoid_ list.
- The POC SPEC is amended: FR-4 (Profile contents), FR-6 and FR-16 to FR-19 (Checkout and Git conventions only for `repository`), FR-41 (the Completed page shows a Pull Request only when there is one), FR-43 (permission-free work inside the Workspace, not the Checkout). The editors SPEC FR-14, FR-15 and FR-33 and the Missions SPEC FR-2, FR-3, FR-7 and FR-14 follow.
- Checks declare the capabilities they need; `validateAssembly` needs the Project's Workspace kind as input, so an Assembly is validated against its Project, never alone.
