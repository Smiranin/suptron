# Export and Import

**ADRs:** ../../adr/0013-export-and-import.md
**Status:** draft

## Problem Statement

The Hangar, the Project Profiles and the Assemblies exist only on the machine where the Commander made them. The Commander works on two machines, a personal and a work one, and keeps rewriting the same Units by hand on both, so they drift apart. Projects that make sense on both machines have to be built twice. And there is no way to hand a good Unit or a whole Project to a friend who runs their own Suptron, other than finding the files on disk and sending them.

## Goal and Success Criteria

The Commander can move any chosen part of the configuration to another machine or another person in a few clicks, without a second repository, and without losing a change made on the receiving side.

Done when:

- The Commander exports the whole Hangar and every Project on one machine, imports the file on the other, and both machines show the same Units, Profiles and Assemblies.
- After editing a Unit on both machines, an Import shows that Unit as different and keeps the receiving machine's version unless the Commander chooses to replace it.
- An imported Project whose paths do not exist on the receiving machine can be corrected during the Import and launched right after it.
- A friend on Windows or Linux imports an Export made on macOS without any extra tool.
- Nothing in the configuration changes until the Commander applies an Import; a file that is not an Export changes nothing.

## Solution

A new page **Export & Import**, reached from the bottom of the navigation, apart from Projects, Hangar and Missions.

**Export.** The page lists every Unit of the Hangar and every Project, each with a checkbox, all checked by default. Checking a Project also checks the Units its Assemblies place. The Commander clicks Export and the browser downloads one file, `suptron-export-<date>.zip`. It holds the chosen Units and, for each chosen Project, its Profile and all its Assemblies, exactly as the system keeps them, invalid ones included. It never holds Missions. Unpacked, it is a set of ordinary Unit markdown and YAML files that a person can read.

**Import.** The Commander picks an Export file with the usual file picker. Before anything changes, the page shows a preview of everything in the file: every Unit, every Profile and every Assembly, each marked **new**, **same** or **different** compared with what exists. For each different one the Commander chooses **replace** or **keep mine**; keep mine is preselected. For each Project in the file the preview shows its paths (its Workspace, its Outer Folders, its Knowledge Sources given as absolute paths) and lets the Commander correct them. Validation problems of an element are shown next to it but do not block it. Nothing is written until the Commander clicks Apply; afterwards the page says what was added and replaced.

## User Stories

1. As a Commander, I want to export my whole Hangar and all my Projects into one file, so that I can set up my second machine in one step.
2. As a Commander, I want everything checked by default when I open the Export, so that moving everything needs no clicks beyond Export.
3. As a Commander, I want to uncheck Projects that belong to one machine only, such as a work Project, so that they never reach the other machine.
4. As a Commander, I want checking a Project to check the Units its Assemblies use, so that the Project arrives working on the other side.
5. As a Commander, I want to export a single Unit, so that I can send it to a friend.
6. As a Commander, I want the Export to be downloaded by the browser like any other file, so that I do not have to type a path and can attach it to a message right away.
7. As a Commander, I want the Export to contain the same files the system keeps, so that a friend can unpack it and read the Units without Suptron.
8. As a Commander, I want Missions never to be part of an Export, so that the state of my running and finished work stays on its machine.
9. As a Commander, I want invalid Units and Assemblies exported as they are, so that an Export is a faithful copy and not a silently filtered one.
10. As a Commander, I want to see everything an Import would bring before it changes anything, so that I am never surprised by what happened to my configuration.
11. As a Commander, I want each element marked new, same or different, so that I see at a glance what an Import really changes.
12. As a Commander, I want a different Unit, Profile or Assembly to keep my version unless I choose to replace it, so that an edit I made on this machine is never lost by a move.
13. As a Commander, I want to decide replace or keep mine for each Profile and each Assembly separately, so that I can take a friend's new Assembly without giving up my Profile.
14. As a Commander, I want to correct the paths of an imported Project before applying, so that the Project points to where things are on this machine.
15. As a Commander, I want validation problems shown in the preview without blocking the Import, so that I can bring things in and fix them in the usual editors.
16. As a Commander, I want a file that is not an Export rejected as a whole with a clear message, so that a wrong file can never damage my configuration.
17. As a Commander, I want a summary of what was added and replaced after applying, so that I know the Import is done and what it did.
18. As a friend of the Commander, I want to import an Export made on another operating system, so that sharing works whatever machine we use.
19. As a friend of the Commander, I want to import a file whose Units I edited in a Windows editor, so that line endings never break the Import.
20. As a Commander who wants a variant of a Unit, I want to give it a new name, so that it lives next to the original without any versioning.
21. As a Commander who wants a friend's Unit next to my own of the same name, I want to rename mine first and then import, so that both end up in my Hangar.

## Requirements

### Functional

- FR-1. The UI has one page, Export & Import, reached from the navigation apart from Projects, Hangar and Missions. Export and Import are offered nowhere else.
- FR-2. The Export lists every Unit of the Hangar and every Project with a checkbox; all are checked when the page opens.
- FR-3. Checking a Project checks every Unit that one of its Assemblies places; the Commander may uncheck them again.
- FR-4. An Export of a Project holds its Profile and all its Assemblies; single Assemblies cannot be chosen.
- FR-5. Export produces exactly one file, downloaded by the browser, named `suptron-export-<date>.zip`, whatever was chosen.
- FR-6. The file holds the chosen elements as the same files, with the same content and the same layout, as the configuration home keeps them. It never holds Missions or anything else from the configuration home.
- FR-7. Invalid Units, Profiles and Assemblies are exported unchanged.
- FR-8. Import takes a file chosen with the browser's file picker.
- FR-9. A file that is not an Export (not a zip archive, or holding anything outside the Export layout) is rejected as a whole with a message that says why; nothing changes.
- FR-10. Import accepts element files with LF and with CRLF line endings alike.
- FR-11. Before anything is written, Import shows a preview of every Unit, Profile and Assembly in the file, each marked new, same or different compared with the configuration home.
- FR-12. For each element marked different the Commander chooses replace or keep mine; keep mine is the default. New elements are added; same elements are left alone.
- FR-13. Import offers no way to bring an element in under another name.
- FR-14. For each Project in the file the preview shows its Workspace path, its Outer Folders and its Knowledge Sources given as absolute paths, and lets the Commander edit them; the edited values are what is written.
- FR-15. The preview shows the validation problems of each element against the configuration as it will be after the Import; they do not prevent applying.
- FR-16. Nothing in the configuration home changes until the Commander applies the Import; leaving the page or choosing another file discards the preview.
- FR-17. After applying, the page lists what was added and what was replaced.
- FR-18. An Import applied while a Mission runs does not change that Mission; it keeps running on the configuration it started with.

### Non-functional

- NFR-1. An Export made on macOS, Windows or Linux opens with the operating system's own tools and imports on any of them.
- NFR-2. Applying an Import is all or nothing: if writing fails part way, the configuration home is left as it was before and the page says what failed.

## Constraints

- The Export layout is the configuration home's layout. Any later change to that layout must keep older Exports importable or say clearly why one is refused.
- The Laws are untouched: the Hangar stays in the configuration home, out of every Pilot's reach.
- Names keep their current rule (lowercase letters, digits and "-"), which is what makes the file names safe on every operating system.

## Out of Scope

- Automatic sync between machines, a backend, or any remote copy kept by the system.
- Git for the Hangar, or a Hangar outside the configuration home.
- A shared registry of Units between people; searching or browsing other people's Units.
- Namespaces or versions of Units.
- Importing an element under another name, and rewriting the Assemblies that refer to it.
- Exporting Missions, or backing up and restoring a whole machine.
- Exporting single Assemblies.
- Improving the starting Units shipped with Suptron as examples: a separate piece of content work, which is what a new Commander such as the friend starts from.

## Open Questions

- A name such as `con`, `nul`, `aux`, `prn` or `com1` passes the name rule but cannot be a file on Windows; should the name rule forbid them? To be answered by the Commander when Windows use becomes real.
- When a backend arrives, does Export stay as it is next to Sync, or become part of it? To be answered by the Commander then.

## Further Notes

- The receiving machine never learns that the sending machine has newer Units; the Commander moves configuration when they decide to.
- A Project exported from a machine where its Workspace is a repository arrives with that repository's path; the paths step of the preview is where the Commander points it to the Checkout location on the new machine.
