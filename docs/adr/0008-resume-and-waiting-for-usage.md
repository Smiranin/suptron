# A Stopped Mission can be resumed; a usage limit is waited out

Status: accepted (2026-11-12); implemented in the runtime (`runner/ledger.ts`, `MissionRegistry.resume`, `Runner.progress` and `Runner.waitForUsage`) and in the Claude Engine (`session`, `usage_limit`, `SessionCostLedger`)

A Mission of the content scenario runs for an hour or more. Two things ended such a Mission for good: a restart of the application (the Mission came back as Stopped, "interrupted", and could only be dismissed) and the usage limit of the Engine (an Engine error, then Needs Attention, and every Retry before the reset failed the same way). In both cases the work in the Workspace was fine and only the run was lost.

We decided two things.

**Resume.** A Stopped Mission, stopped by hand or interrupted by a restart, has one action: Resume. The ledger (`missions/active.json`) keeps every Mission that is not over, and for each what a Resume needs: the snapshot the Mission started with, its fixed data (Task location, title, Git conventions, Knowledge Sources), the Checkout that reopens the Workspace, and where the Runner stood (the Slot, what that Slot was given, the Attempt, Loop and Resolution counts, the Slot Outputs, the Engine sessions, the Core's session). A Resume reopens the Workspace and runs the Slot the Mission stood at again as a new Attempt. That Attempt continues the Engine session of the interrupted one, whatever the Slot's Memory Mode, and its prompt says that it was interrupted and that the Pilot first checks what is already there. Slots that were done do not run again. The configuration is the stored snapshot, never the files as they are now. A busy Workspace, a missing Workspace folder, Task location or Mission folder refuses the Resume with a message.

**Waiting for usage.** The Engine reports a refusal by the usage limit together with the time the limit resets. The Mission enters the state Waiting for usage, which shows that time, and goes on by itself a minute after it: a Pilot's turn continues in the same session with a short "go on", a Core call is made again as it was. The wait costs neither an Attempt nor a Resolution, the Workspace stays busy, Stop works. One rule covers every kind of limit. A refusal without a reset time stays an Engine error. A restart during the wait leaves the Mission interrupted, and the Commander resumes it.

What both rest on: the Engine names the session of a turn as soon as it starts, not only with the result, so an interrupted turn has a session to go back to; and it marks the error of a session that does not exist any more, so the runtime falls back (the Slot's kept session, then a new one) instead of failing every Attempt the same way.

## Considered Options

- **Run the interrupted Slot again (chosen).** The Runner's position is one Slot and a few counters, written to the ledger on every notable event. The Slot is the unit the Mission already knows how to repeat: an Attempt.
- **Continue inside the Slot, at the Check or the Exit Condition that was running.** Saves one Pilot turn when the interruption fell between a Slot's end and its Checks, at the price of a second kind of position and of Checks judged against an output from before the restart. Rejected; the resumed Pilot is told to check what is there, so the repeated turn is short.
- **Replay the Mission from its events.** Would bring the transcript back too, but needs every event on disk and a Runner that can be driven by a log. Rejected for the POC: the transcript before a restart stays lost, Slot Outputs and Check results stay.
- **Resume on the files as they are now.** Lets the Commander fix a Unit and go on, but a Mission would then run on two configurations, and a renamed Slot would have no position. Rejected; a changed configuration is a new Mission.
- **At the usage limit, go to Needs Attention with the reset time.** No new state, but the Commander has to come back at the right moment and it costs a Resolution or an Attempt for something no Attempt can fix. Rejected.

## Consequences

- The transcript from before a restart is gone; a resumed Mission shows the sections since the Resume, and the Slots that ran before say that theirs was lost.
- A Mission interrupted between a Slot's end and its Checks runs that Slot's Pilot once more.
- A Completed Mission is not in the ledger: one that was not dismissed disappears with a restart, as before. Stopped Missions now stay until Dismiss.
- The ledger holds a snapshot per Mission (the Units' texts included) and is rewritten on every cost update; it stays in the tens of kilobytes per Mission.
- What an Engine session has cost so far is kept in `missions/session-costs.json`, so a resumed session is charged only what it adds. Sessions nobody called for 30 days are forgotten.
- A ledger entry written before this decision holds nothing to resume from; such a Mission can only be dismissed.
- The refusal by the usage limit is known from the SDK's types and from the "allowed" events it sends in every query; it could not be provoked. The tests use the fake Engine. Should the SDK report a refusal while the turn still succeeds, the runtime would stop that turn and continue it after the reset.
- Verified on 2026-11-13 with the real Engine: a session is resumed by a new process, and resuming an unknown session fails with "No conversation found with session ID".
