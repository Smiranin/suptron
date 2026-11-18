# Configuration moves between machines and people only as an Export file

Status: accepted (2026-11-17); implemented by ../features/export-import/PLAN.md (the runtime module `transfer/`, the routes `/api/export` and `/api/import`, the page Export & Import)

The Hangar, the Project Profiles and the Assemblies live only in the configuration home of one machine. The Commander works on two machines and wants the same Hangar on both, the Projects too where they make sense, and wants to hand Units and Projects to a friend who runs their own Suptron. We decided that configuration leaves a system only as an **Export**: one file the Commander downloads from the UI, and brings into another system through an **Import** that shows what would change and changes nothing until the Commander applies it. The system itself keeps no remote copy, does no git and syncs nothing.

## Considered Options

- **Export and Import files (chosen).** One feature serves moving to another machine, sharing with another person and keeping a copy. The Hangar stays in the configuration home, so the Law that keeps Pilots out of it keeps protecting the Units. Costs a manual step on every move and has no history.
- **The Hangar in its own git repository, pointed to by the system or linked into the configuration home.** Gives history and a familiar sync. Rejected by the Commander as a second repository to look after; a link would also move the Units out of the configuration home, where the Laws, which resolve links, would no longer protect them from Pilots.
- **The Units in the Suptron repository.** Mixes everyone's personal Units with the system's code. Rejected; the repository keeps only the starting set of examples.
- **A synced cloud folder.** No history, and editing on two machines silently leaves conflict copies. Rejected.
- **A backend that syncs configuration.** The real answer for many machines and many people, and far beyond a personal POC. Left for later; an Export stays useful next to it.

Secondary decisions taken in the same session:

- **An Export is a `.zip` with the same files and the same layout the configuration home keeps**, so there is no second format: whoever unpacks it reads ordinary Unit markdown and YAML. Changing how the configuration home is laid out from now on also means importing older Exports.
- **A Unit has one name and nothing else identifies it**: no namespaces, no versions. A variant of a Unit for one Project goes into the Slot's additional Instructions; a general variant is a new Unit with a new name. Import offers no "bring it in under another name", because the Assemblies in the same Export refer to the Unit by its name.
- **Import never overwrites without asking**: each Unit, Profile and Assembly that differs from what exists is replaced only when the Commander chooses so. This is what makes a manual move between two machines that were both edited safe.
- **The terms are Export and Import, not Backup and Restore**: an Export is a chosen part of the configuration meant for another machine or person, never the Missions, and an Import merges element by element instead of putting a machine back as it was.

## Consequences

- Two machines drift apart between moves; nothing tells the Commander that the other machine has a newer Unit.
- A Project's paths (its Workspace, its Outer Folders, its Knowledge Sources given as absolute paths) belong to the machine it was exported from, so Import lets the Commander correct them before applying.
