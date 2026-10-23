# Watch a Mission on the same clock the Assembly was built on, with the transcript beside it

Status: accepted

The POC SPEC requires a list of active Missions, a Mission page with the live transcript, a place to answer Human Checkpoints and act on Needs Attention, and a Completed page (FR-36 to FR-41), but leaves their shape open. We decided that the Mission page reuses the clock of ADR-0002 as a read-only picture of where the Mission is in its Assembly, with a side panel that shows the transcript of the selected Slot or, when the Core is selected, everything that concerns the Mission as a whole. Needs Attention and Completed are not separate screens: a Mission has one page whose layout follows its state. A Mission is started only from its Assembly, through a Start Mission dialog; the Missions list is read-only.

## Considered Options

- **Clock plus side panel (chosen)**: the Commander sees the same picture when building an Assembly and when watching it run; Loops and Exit Points light up where they were drawn; clicking a Slot opens its transcript and clicking the Core opens the Mission-level view, the same gesture as the editor's inspector. The Commander chose this over a transcript-first page.
- **Transcript-first page with a linear strip of Slot chips in the header**: gives the transcript the whole width and is simpler to build, but shows Loops poorly and breaks the one-picture principle. Rejected.
- **Transcript in a popup opened from a Slot**: hides the clock while reading; the Commander watches both at once. Rejected in favour of a resizable side panel.
- **Modal dialogs for Human Checkpoints and Needs Attention**: would force an answer before the Commander can read the transcript that explains the question. Rejected; both appear as a tab in the side panel with a banner over the clock.
- **Separate routes for Needs Attention and Completed**: a link to a Mission would change as the Mission moves. Rejected; one URL per Mission, the layout follows the state.
- **Starting a Mission from the Missions list through a New Mission route**: the Commander wants the list to be a read-only overview and the Launch button next to the Assembly it runs. Rejected; the Start Mission dialog opens from the Projects page and from the Assembly editor.

Secondary decisions taken in the same session:

- **Terminal Missions stay until Dismiss**: there is no Mission history, but the Completed page must be readable after the fact. A Completed or Stopped Mission remains in memory and in the list until the Commander Dismisses it or the application restarts. This amends the POC PLAN's `GET /api/missions` ("active Missions only") and adds a Dismiss call to the API contract.
- **"May ask the Commander" toggles stay at Mission start, hidden under Advanced**: POC FR-16 and user story 11 are kept; the dialog folds the toggles away so the typical start is Checkout, Task location, Work Item ID and Start.
- **The Retry note stays optional**, as POC FR-33 states; it is the only mid-mission instruction in the POC.
- **Lost transcripts are shown as lost**: after an application restart an interrupted Mission is Stopped with no transcript, and the page says so instead of showing an empty one.

## Consequences

- The clock layout of the Assembly editor (`layoutClock` in the editors PLAN) must be reusable in a read-only mode with per-Slot state, Attempt and Loop counters and cost, which the editors PLAN did not foresee.
- The POC PLAN's HTTP contract gains a Dismiss call and the Missions route returns every Mission the server knows since it started, not only active ones.
- The Projects page, defined by the editors SPEC as a list of Projects, now shows each Project expanded with its Assemblies and a Launch button per valid Assembly.
