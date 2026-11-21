# Show a running Mission as a Universe, and keep the clock for the Assembly editor

Status: accepted

ADR-0003 put the Mission page on the same clock the Assembly was built on, so that the Commander sees one picture when building and when watching. The Commander now wants the Mission page to be beautiful, not only correct: an illustrated world seen from one fixed angle, the Universe. We decided that the Mission page shows the Universe by default and offers the clock through a switch whose choice is remembered, while the Assembly editor stays on the clock. This knowingly gives up the one-picture principle of ADR-0003 for the time the idea is being tried: the Mission page is where the Commander watches, the editor is where precision and drag-and-drop matter, and trying the idea on one page costs far less than on two.

## Considered Options

- **Universe on the Mission page with a switch to the clock (chosen)**: the clock's code stays anyway because the editor uses it, so the switch is nearly free and an unfinished Universe never blocks work on a real Mission.
- **Universe on both pages at once**: the correct end state, and the Commander said so, but it means building an editor (adding, moving and configuring Slots) inside an untested picture. Postponed until the Commander has approved the Universe on the Mission page.
- **Universe replaces the clock on the Mission page with no way back**: one view less to keep, but any gap in the first version would hide information the Commander needs during a Mission. Rejected for the trial.
- **Feature flags with a screen to toggle them**: more machinery than one switch needs. Rejected.

## Consequences

- The Universe must show everything the clock shows and open the same side panel on a click; otherwise the Commander keeps switching back and the trial proves nothing.
- The trial ends on the Commander's word, with no numeric bar. After it, the switch is removed or kept, and the editor's move to the Universe is decided.
- The glossary gains one term, Universe. What world it draws is deliberately not part of the term, so that the world can change without renaming anything.
