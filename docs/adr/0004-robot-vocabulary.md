# Name the product Suptron and give the main domain nouns a combining-robot vocabulary

Status: accepted

The product needed a name (OQ-1 of the POC SPEC) and the Commander chose Suptron: "Sup" from the first letters of the Commander's surname, with a nod to support, super and supreme, and "-tron" from combining robots like Voltron. We decided to carry that metaphor into the domain vocabulary as an easter egg: reusable agent definitions are Units kept in a Hangar, an Assembly mounts them into Slots, each Slot is flown by a Pilot, the Core in the centre of the clock orchestrates under its Core Directives, the Commander sends the Assembly on a Mission, and the Laws hold whatever the configuration says. Only the main nouns were renamed; the mechanics keep plain names. The rename was made before any code existed, so it costs only documents.

| Former name | New name |
|---|---|
| Brick | Unit |
| shared library of Bricks | Hangar |
| Workflow | Assembly |
| Node | Slot |
| Node Output | Slot Output |
| Master Agent | Core |
| Master Rules | Core Directives |
| Node Agent | Pilot |
| Run | Mission |
| Owner | Commander |
| Never-list | Laws |
| Autonomous Dev Workflows, `adw`, `ADW_` | Suptron, `suptron`, `SUPTRON_` |

## Considered Options

- **Theme the main nouns, keep the mechanics plain (chosen)**: the nouns the Commander sees in the UI carry the theme; Done Condition, Exit Point, Exit Condition, Loop, Attempt, Check, Checkout, Project and Engine stay literal, because they describe rules that implementing agents must read without guessing.
- **Theme everything** (Diagnostic for Check, Hail for Human Checkpoint, Powered Down for Stopped, Cold boot / Always-on for Memory Mode, Briefing for Task): more flavour, but every invented word in the state-machine rules is a chance for an implementing agent to misread a SPEC. Rejected.
- **Keep the generic names**: clear but anonymous; the Commander wanted the product to have a character. Rejected.

Secondary decisions taken in the same session:

- **The `core` package is renamed `runtime`**: `core` would collide with the Core (the former Master Agent). The package is `packages/runtime`, `@suptron/runtime` and `@suptron/runtime/browser`; the Core's client lives in `src/core-agent/` as `CoreAgent`.
- **"slot" no longer means a position on the clock ring**: the editor's ring positions are called positions (`positionIndexAt`, `plusPositions`); `ClockLayout.slots` keeps its name because each entry is one Slot.
- **Code uses the same words as the glossary**: `MissionSummary`, `SlotRecord`, `UnitFile`, `AssemblyFile`, `mayAskCommander`, `/api/missions`, `SUPTRON_HOME` (`~/.suptron`), configuration folders `hangar/` and `projects/<project>/assemblies/`. Agent roles are `'pilot' | 'core'`. The class that executes one Mission keeps the generic name `Runner`.
- **The system has no built-in goal**: definitions no longer say that an Assembly turns a Task into a Pull Request. What a Mission produces, and so what Completed means, is defined only by the Slots and their Conditions, checked by the Core. Software development with a draft Pull Request is the primary scenario and the scope of the POC's infrastructure (code repositories, Checkouts, Git conventions, git-specific Laws), not the purpose of the system.
- **Former names stay findable**: every renamed term lists its former name under _Avoid_ in the glossary.

## Consequences

- Documents, folders and files were renamed: `features/suptron-poc`, `features/assembly-editors`, `features/missions-ui`, `adr/0001-suptron-poc.md`, `adr/0002-assembly-editors.md`, `adr/0003-missions-ui.md`.
- OQ-1 of the POC SPEC is closed.
- A plural term reads as a plural: "the Laws are", "the Core Directives are".
