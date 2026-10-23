# Missions screens: starting, watching and controlling Missions

**ADR:** ../../adr/0003-missions-ui.md
**Status:** draft
**Amended:** 2026-10-22 by ../../adr/0004-robot-vocabulary.md: the product is named Suptron and the main nouns are renamed (Brick → Unit, Workflow → Assembly, Node → Slot, Master Agent → Core, Master Rules → Core Directives, Node Agent → Pilot, Run → Mission, Owner → Commander, Never-list → Laws); the `core` package is `runtime`.
**Source:** implements POC SPEC FR-16 to FR-18, FR-26, FR-32 to FR-41 (../suptron-poc/SPEC.md) in the UI shell of ../assembly-editors/SPEC.md. Vocabulary follows ../../GLOSSARY.md.
**Amends:** POC PLAN HTTP contract (`GET /api/missions` returns every Mission known since the application started; a Dismiss call is added); editors SPEC FR-1 (the Projects page shows each Project expanded with its Assemblies and a Launch button).
**Amended:** 2026-10-22 by ./PLAN.md: the Constraints line on the contract (the Mission page's reload data is part of the contract).

## Problem Statement

The runtime of the POC can start a Mission, stream its events and accept Stop, Retry and answers over HTTP, and the configuration UI can build Assemblies, but the Commander has no screen to start a Mission, to see which Missions are going, to read what a Pilot is doing, to answer a Human Checkpoint, to understand why a Mission went to Needs Attention, or to read the result of a Completed Mission. Without these screens the UI cannot be "the only place I need to watch" (POC user story 29), and success indicator 3 of the POC ("the Commander can tell from the UI alone why a Mission went to Needs Attention") cannot be met.

## Goal and Success Criteria

Goal: the Commander starts a Mission from its Assembly, watches it move around the clock, reads the transcript of any Slot, answers questions, acts on Needs Attention and reads the Completed result, all from the UI.

Success criteria:

1. The primary-scenario Assembly of the POC can be started from the Projects page and followed to Completed with the Commander typing nothing but Human Checkpoint answers (POC indicator 1).
2. For a Mission in Needs Attention, the Commander can name the cause, the Slot and the failed Checks from the Mission page alone (POC indicator 3).
3. Two Missions on the same Project in different Checkouts can be watched at the same time, and the list shows which one needs the Commander.
4. Nothing shown on the Mission page lags behind the Mission in a way a human watching would notice (POC NFR-6).

## Solution

**Three places, no separate "new Mission" screen.** The Missions area has a **Missions list** and a **Mission page** per Mission. A Mission is started from its Assembly: the **Projects** page shows every Project expanded with its Assemblies, each valid Assembly has a **Mission** button, and the Assembly editor has the same button in its header. Mission opens a **Start Mission** dialog over the current page with the Checkout, the Task location, an optional Work Item ID and, folded under Advanced, the per-Slot "may ask the Commander" toggles. Start takes the Commander to the Mission page.

**The Mission page is the clock, read-only, with a side panel.** The same clock the Commander built the Assembly on shows where the Mission is: Slots coloured by state, the current Slot pulsing, Attempt counters on Slots, iteration counters on Loop chords, the Exit arrow lit when the Mission left through it, the Core in the centre showing the Mission's state and cost. Clicking a Slot opens its transcript in the side panel; by default the panel follows the current Slot. Clicking the Core opens the Mission-level view: state, costs, the Needs Attention explanation when there is one, the final report when Completed, and a table of Slots with Attempts, Loops and cost.

**The page follows the Mission's state.** When a Slot asks a question, a Question tab appears in the side panel and a banner over the clock says the Mission waits for the Commander. When the Mission goes to Needs Attention, an Attention tab appears with the cause, the Core's explanation, the failed Checks, an optional note and the Retry and Stop buttons. When the Mission is Completed, the Mission-level view opens with the Pull Request link, the report and the Slots table. When Stopped, the transcript is frozen under a Stopped banner. There are no modal dialogs for any of this; the only modal is the confirmation before Stop.

**The Missions list is an overview.** It groups Missions into Needs you (Waiting for Commander, Needs Attention), Running and Finished (Completed, Stopped), updates in real time, and offers nothing but opening a Mission and Dismissing a finished one. The Missions entry in the navigation carries the number of Missions that need the Commander, and so does the browser tab title; the UI is the only notification channel.

**Finished Missions stay until Dismissed.** There is no Mission history, but a Completed or Stopped Mission stays in the list and keeps its page until the Commander Dismisses it or the application restarts.

## User Stories

Starting a Mission

1. As the Commander, I want a Launch button next to every valid Assembly on the Projects page and in the Assembly editor, so that I start a Mission where the Assembly lives.
2. As the Commander, I want an invalid Assembly to have no Launch button, with a hint why, so that I never start something the runner cannot execute.
3. As the Commander, I want the Start Mission dialog to ask only for the Checkout, the Task location and an optional Work Item ID, so that starting a Mission is a few seconds of work.
4. As the Commander, I want busy Checkouts shown but disabled with the Mission that uses them, so that I understand why I cannot pick one.
5. As the Commander, I want the Task location to be a typed path checked to exist, accepting a folder or a single document, so that a typo is caught before the Mission starts.
6. As the Commander, I want the last used Checkout and Task location of this Project prefilled, so that repeating a Mission is one click.
7. As the Commander, I want the per-Slot "may ask the Commander" toggles folded under Advanced, prefilled from the Assembly, so that I can change the level of autonomy for one Mission without seeing the toggles every time.
8. As the Commander, I want to land on the Mission page as soon as the Mission starts, so that I see the first Slot begin.

Missions list

9. As the Commander, I want all Missions on one list, with the ones that need me on top, so that I know at a glance where I am wanted.
10. As the Commander, I want each row to show Project and Assembly, the Task, the Checkout's branch, the current Slot, the state, the cost so far and when it started, so that I can tell Missions apart without opening them.
11. As the Commander, I want the list to update in real time, so that I never refresh.
12. As the Commander, I want to Dismiss a finished Mission from the list or from its page, so that the list only holds what I still care about.
13. As the Commander, I want interrupted Missions (application closed while they ran) to appear as Stopped with an "interrupted" note, so that I am not misled.
14. As the Commander, I want the number of Missions that need me on the Missions navigation entry and in the browser tab title, so that I notice from any screen of the UI.

Mission page: clock

15. As the Commander, I want the Mission page to show the same clock I built the Assembly on, read-only, so that I recognise the Assembly immediately.
16. As the Commander, I want every Slot coloured by its state (pending, running, done, failed Attempt) and the current Slot clearly marked, so that I see where the Mission is.
17. As the Commander, I want Attempt counters on Slots and iteration counters on Loop chords, and the chord to light up when a Loop fires, so that I see review-fix cycles happening.
18. As the Commander, I want the Exit arrow lit when the Mission left the Assembly through it, so that I see how the Mission ended.
19. As the Commander, I want the Slot that waits for my answer or caused Needs Attention marked on the clock, so that I know which Slot to look at.
20. As the Commander, I want each Slot's cost and the Mission's total cost on the clock, so that I see which Slots are expensive.

Mission page: side panel and transcript

21. As the Commander, I want a side panel that shows the transcript of the current Slot and follows the Mission to the next Slot, so that I can watch without clicking.
22. As the Commander, I want to click any Slot to pin its transcript and a "Back to current" action to resume following, so that I can look back without losing the live view.
23. As the Commander, I want the transcript split into sections per execution of the Slot (Attempt N, or Loop N from another Slot), so that I can tell the executions apart.
24. As the Commander, I want agent text rendered as markdown, tool calls as collapsed rows that expand to input and output with errors highlighted, and Check results as one-line rows, so that the transcript is readable at a glance and detailed on demand.
25. As the Commander, I want the transcript to auto-scroll while I am at the bottom and stop when I scroll up, with a Follow action to resume, so that reading is never interrupted by new lines.
26. As the Commander, I want earlier Slots' sections collapsed and marked when truncated, so that the current Slot stays in focus and I know when something is missing.
27. As the Commander, I want my Human Checkpoint answers and my Retry note to appear in the transcript where the agent received them, so that I can reconstruct what the agent knew.
28. As the Commander, I want the Mission-level view behind the Core circle to show the state, total cost, the Needs Attention explanation, the final report and a Slots table including a Core row, so that everything about the Mission as a whole is in one place.

Human Checkpoint

29. As the Commander, I want a Question tab to appear in the side panel and a banner over the clock when a Slot asks me something, so that I notice without a popup.
30. As the Commander, I want each question shown with its options and descriptions, single or multiple choice as the agent asked, and an Other field for a free answer, so that I answer in the form the agent expects.
31. As the Commander, I want one Answer action for all questions of a checkpoint, so that the agent receives a complete answer.

Needs Attention

32. As the Commander, I want an Attention tab with a readable cause, the Core's explanation and the failed Checks with their details, so that I understand what went wrong from the UI alone.
33. As the Commander, I want an optional note to the agent next to Retry, so that I can tell it what to do differently.
34. As the Commander, I want Retry to return the Mission to Running and open the new Attempt's transcript, so that I see whether the note helped.

Stop, Completed, Stopped

35. As the Commander, I want Stop in the Mission page header in every non-terminal state, behind a confirmation that says what stays untouched and that the Mission cannot be resumed, so that I stay in control without accidents.
36. As the Commander, I want the Completed Mission page to show the Pull Request link, the final report and the Slots table with Attempts, Loops and cost, so that I can decide what happens next.
37. As the Commander, I want a Stopped Mission page to keep its transcript frozen under a Stopped banner, so that I can still read what happened.
38. As the Commander, I want the page to tell me when the transcript was lost in a restart, so that an empty page never looks like an idle Mission.

Connection

39. As the Commander, I want a banner when the UI lost its connection and a silent catch-up when it is back, so that I never read a stale page as current.
40. As the Commander, I want a Mission page whose Mission was Dismissed elsewhere or lost in a restart to say so with a link to the list, so that I am never stuck on a dead page.

## Requirements

### Functional

Starting a Mission

- FR-1. The Projects page lists every Project expanded with its Assemblies. Each valid Assembly has a Launch button; an invalid or unparseable Assembly has none and shows why. The Assembly editor header has the same Launch button when the Assembly is valid and has no unsaved changes.
- FR-2. Mission opens a Start Mission dialog over the current page. The dialog holds: Checkout (select), Task location (typed absolute path, file or folder, checked to exist), Work Item ID (optional text), and an Advanced section, collapsed by default, with one "may ask the Commander" toggle per Slot prefilled from the Assembly and marked when changed from the Assembly's value.
- FR-3. The Checkout select lists every Checkout of the Project with its path and current branch. A Checkout busy with an active Mission is shown disabled with that Mission named. A Project whose Checkouts cannot be read shows the error in place of the list and cannot start.
- FR-4. The dialog prefills Checkout and Task location with the values last used for this Project on this browser, when the Checkout is not busy. This is a convenience; nothing depends on it.
- FR-5. Start creates the Mission and navigates to its page. A validation refusal is shown at the field it concerns; a busy-Checkout refusal is shown at the Checkout field with the list refreshed.

Missions list

- FR-6. The Missions list shows every Mission the application knows since it started, in three groups in this order: Needs you (Waiting for Commander, Needs Attention), Running, Finished (Completed, Stopped). Within a group, newest start first.
- FR-7. Each row shows: Project and Assembly, Task (folder or file name, with the Work Item ID when given), the Checkout's current branch, the current Slot (none for finished Missions), the state, the cost so far in dollars, and the start time as a relative time. Hovering the cost shows tokens. Clicking a row opens the Mission page.
- FR-8. The list updates in real time from the Mission events; no manual refresh exists.
- FR-9. Finished Missions have a Dismiss action in the row. Dismiss removes the Mission from the list and from the application; it is available only for Completed and Stopped Missions. The list offers no other action: no Start, no Stop.
- FR-10. Missions interrupted by an application shutdown appear in Finished as Stopped with an "interrupted" note.
- FR-11. The empty list shows a hint that Missions are started from an Assembly on the Projects page, with a link there.
- FR-12. The Missions navigation entry shows the count of Missions in Needs you when it is above zero; the browser tab title carries the same count as a prefix. There are no sounds and no notifications outside the UI.

Mission page: layout and clock

- FR-13. Every Mission has one page at one address for its whole life; the layout changes with the state, the address does not.
- FR-14. The page header shows: Project and Assembly, Task (name and Work Item ID), Checkout path and current branch, state, Mission cost so far in dollars with tokens on hover and marked as an estimate, the Pull Request link as soon as the Mission knows one, and the Stop button in every non-terminal state.
- FR-15. The page shows the Mission's Assembly as the clock of the editors SPEC in a read-only form: no palette, no inspector, no dragging, no editing; zoom, pan and Fit remain.
- FR-16. Each Slot card shows its state: pending, running (visibly animated), done, or failed Attempt; the current Slot is marked. A Slot that is waiting for the Commander or that caused Needs Attention is marked distinctly. Cards show the Attempt counter when the Slot has been attempted more than once and the Slot's cost so far.
- FR-17. Each Loop chord shows its iteration counter against its limit and is highlighted when the Loop fires. The Exit arrow through which the Mission was Completed is highlighted.
- FR-18. The Core circle shows the Mission state and the Mission's total cost. Clicking it opens the Mission-level view in the side panel.

Mission page: side panel and transcript

- FR-19. A side panel on the right, resizable and collapsible, shows either the transcript of one Slot or the Mission-level view. By default it shows the current Slot and follows the Mission when the current Slot changes. Clicking a Slot pins that Slot; a "Back to current" action resumes following.
- FR-20. A Slot's transcript is divided into sections, one per execution, headed "Attempt N" or "Loop N from <Slot>", in time order; the Commander's Retry note heads the section of the Attempt that received it, and the answers to a Human Checkpoint are recorded in the section where the question was asked.
- FR-21. Transcript entries are: agent text (rendered markdown), tool call (a collapsed row with the tool name and a one-line summary of its input, expanding to the full input and the result, with errors highlighted), and Check result (one row with the Check's summary, pass or fail, and the detail on fail).
- FR-22. The transcript auto-scrolls to the newest entry while the Commander is at the bottom; scrolling up stops it; a Follow action resumes it.
- FR-23. The transcript of an earlier execution or an earlier Slot is shown as the application kept it; when entries were dropped, the section says so. The earlier Slots' sections are collapsed by default.
- FR-24. The Mission-level view shows: the state with its cause when Needs Attention; the Mission's total cost; the Core's explanation when there is one; the final report (rendered markdown) when Completed; a table of Slots in Assembly order with Attempts, Loops and cost, plus a Core row with cost only.

Human Checkpoint

- FR-25. When a Slot asks a question, the page shows a banner over the clock, marks the Slot, and the side panel gains a Question tab that comes to the front. The tab shows every question of the checkpoint with its title, text and options with descriptions, as single or multiple choice as the agent asked, and an Other field for a free answer under each question.
- FR-26. One Answer action submits all answers of the checkpoint. After it the tab disappears, the Mission returns to Running and the transcript shows the question and the answers.
- FR-27. Stop while a question is pending is allowed and dismisses the question.

Needs Attention

- FR-28. When the Mission enters Needs Attention, the page shows a banner over the clock naming the cause and the Slot, marks the Slot, and the side panel gains an Attention tab that comes to the front with: the cause in words (Attempt limit reached, Loop limit reached, last Exit Condition failed, CI timed out, Engine error), the Core's explanation, the failed Checks with details, an optional note to the agent, and the Retry and Stop buttons.
- FR-29. Retry sends the note (possibly empty), closes the tab, returns the Mission to Running and shows the transcript of the new Attempt. Retry is offered only in Needs Attention.

Stop, Completed, Stopped

- FR-30. Stop asks for confirmation stating that the branch, the Checkout and the Pull Request stay as they are and that a Stopped Mission cannot be resumed. On confirmation the Mission becomes Stopped; the transcript stays readable under a Stopped banner.
- FR-31. When the Mission is Completed, the side panel opens the Mission-level view with the Pull Request link (or a note that no Pull Request was opened), the final report and the Slots table; the clock shows the lit Exit arrow. The transcript of every Slot remains reachable by clicking the Slot.
- FR-32. A Mission shown as Stopped with the "interrupted" note has no transcript; its page says that the transcript was lost when the application restarted and shows the header and what is known of the Slots.
- FR-33. Dismiss on a finished Mission's page returns to the Missions list.

Connection and absence

- FR-34. When the live connection is lost, the page shows a banner and reconnects; on reconnection the page reloads the Mission's state so that nothing missed is lost silently.
- FR-35. A Mission page for a Mission the application no longer knows (Dismissed elsewhere or lost in a restart) says so and links to the Missions list.

### Non-functional

- NFR-1. Updates on the Mission page and in the Missions list appear with no delay a watching human would notice (POC NFR-6).
- NFR-2. A transcript of several thousand entries stays scrollable and responsive; collapsed sections are not rendered until opened.
- NFR-3. Single user, local only, as the POC; nothing is sent anywhere but the local server.
- NFR-4. The read-only clock stays readable for the same range of Slots as the editor (editors NFR-2).

## Constraints

- The runtime and its HTTP and event contract are those of the POC PLAN; the screens consume them and may extend them only by the Dismiss call, by the Missions route returning every Mission known since start, and by the data a Mission page needs on reload (the Assembly document, transcript sections, the Needs Attention explanation with its failed Checks, the Completed result, and a sequence number for joining the live stream), as listed in ./PLAN.md "Contract amendments". Amended 2026-10-22 by ./PLAN.md.
- The UI shell, stack and the clock are those of the editors SPEC and PLAN; the Missions screens plug into the existing Missions route and reuse the clock layout.
- The Human Checkpoint question format is the Engine's: titled questions with options and descriptions, single or multiple choice, plus a free answer.
- The Laws are not visible or configurable from any Missions screen.
- Nothing is persisted across restarts except the active-missions ledger that marks interrupted Missions; transcripts live only in memory.

## Out of Scope

- Starting a Mission from the Missions list or from any screen other than an Assembly's Launch button.
- Search, filtering or sorting in the Missions list.
- Mission history, statistics, cost reports, transcript export or persistence.
- Pausing or resuming a Mission; changing "may ask the Commander" or any other setting during a Mission; any mid-mission instruction other than the Retry note.
- Editing the Assembly from the Mission page.
- Notifications outside the UI (sound, system notifications, chat).
- Showing the Core's own transcript; only its explanations and the report are shown.
- Multiple users or sharing a Mission page.

## Open Questions

- OQ-1. Whether the Projects page should remember which Projects are expanded. Commander, during implementation; default is all expanded.
- OQ-2. How the browser tab title reads when a Mission page itself is open (count prefix plus Mission name, or Mission name only). Commander, during implementation.

## Further Notes

- The editors SPEC FR-1 ("Assemblies are reachable only through their Project") still holds: the Projects page shows Assemblies inside their Project groups; there is no cross-Project Assembly list.
- The "may ask the Commander" toggles at Mission start were questioned in this session and kept because POC FR-16 and user story 11 want a per-Mission level of autonomy; folding them under Advanced is the compromise.
- The Retry note was questioned and kept because POC FR-33 and ADR-0001 make it the only mid-mission instruction; it stays optional.
- The transcript-first layout with a linear strip of Slot chips and the popup transcript were considered and rejected; see ADR-0003.
