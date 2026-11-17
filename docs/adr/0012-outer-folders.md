# A Project Profile may list Outer Folders that its Pilots may write to

Status: accepted (2026-11-17); specified in ../features/sub-pilots-and-side-slots/SPEC.md, not implemented yet

The Laws let a Pilot write to the Workspace and the Task location and nowhere else, and the glossary said of the Laws that no configuration can change them. The work the Commander wants from Side Slots ([ADR-0011](0011-sub-pilots-and-side-slots.md)) lives elsewhere by nature: knowledge about a Project that grows with its Missions is kept outside a repository shared with many developers, and a log of the Commander's achievements belongs to no Project at all.

We decided that a Project Profile lists **Outer Folders**: absolute paths outside the Workspace that every Pilot of the Project's Missions may write to, Sub-pilots and Side Slots included. The Law now reads: no writing outside the Workspace, the Task location and the Project's Outer Folders. What stays beyond any configuration: the configuration home can never be an Outer Folder or lie inside one, and every other Law is untouched. This follows ADR-0001: the policy lives in the Project Profile, the floor in the system. The floor moved from "two places" to "the places the Commander named".

## Considered Options

- **A list on the Profile, open to every Pilot of the Project (chosen).** One list, nothing to wire per Slot.
- **Named folders that a Slot opts into.** Least privilege: an implementer could not touch the achievements log. Rejected by the Commander as more configuration than a personal system needs.
- **Only Side Slots may write to them, and Side Slots may not write to the Workspace.** Would have ruled out two Pilots writing to one Checkout. Rejected for the same reason; the Commander answers for where Side Slots are placed.
- **A fixed folder per Project inside the configuration home.** Nothing to configure, but it breaks the Law that keeps Pilots out of the configuration home, and the Commander's documents already live elsewhere. Rejected.
- **Keep such files in the Workspace.** No change to the Laws, but a Pull Request that is ready to merge would get new files, and personal notes would land in a shared repository. Rejected.

## Consequences

- An Outer Folder is not a Knowledge Source by itself; the Commander lists it as one when Pilots should read it.
- Two Missions of one Project may write to the same Outer Folder at the same time; nothing guards against it.
- An Outer Folder is not cleaned by Dismiss: what Pilots write there outlives the Mission, which is its purpose.
- The same folder may be listed by several Projects, which is how one achievements log serves them all.
