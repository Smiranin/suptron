# Suptron HTTP and SSE API

The local server listens on `http://127.0.0.1:4777` (`SUPTRON_PORT` overrides the port). Every route is
under `/api`; bodies and responses are JSON. The web application is served from `/` when `apps/web/dist`
exists. Configuration lives in `SUPTRON_HOME` (default `~/.suptron`) and is read on every request, so
hand edits show up immediately.

Types named below (`UnitFile`, `ProfileFile`, `AssemblyFile`, `Issue`, `MissionSummary`, `MissionDetail`,
`MissionEvent`, `TranscriptSection`, ...) are exported from `@suptron/runtime/browser`.

## Common conventions

- **ETags.** Every configuration read returns `etag`, the SHA-256 of the file text.
- **PUT semantics** (Units, Profiles, Assemblies): no `If-Match` and no `?force=1` → `201` when the file
  does not exist, `428 Precondition Required` when it does; `If-Match: <etag>` → `200`, or
  `412 { current: { data, etag } }` when the file changed; `?force=1` → `200` always. Files are rewritten
  canonically (fixed key order, defaults omitted); comments and hand formatting are lost.
- **Validation failures** → `400 { issues: Issue[] }` with `Issue = { code, message, slotName?, path? }`.
- **Name rules** → `409 { reason: 'name_taken' }`. Names are lowercase letters, digits and `-`.
- **Refusals by use** → `409 { reason: 'in_use', usedBy: [{ project, assembly }] }` or
  `409 { reason: 'active_missions', count }`.
- **Not found** → `404 { reason: 'not_found', message }`.
- **Profile format** (`ProfileFile`): `{ name, workspace, knowledgeSources, outerFolders, engine }`. `workspace` is one of
  `{ kind: 'none' }`, `{ kind: 'folder', path }` or `{ kind: 'repository', path, remote?, protectedBranch?, host?: 'github' | 'none', git: { branchNameTemplate, pullRequestTemplate?, labels?, reviewers? }, ciWaitTimeoutMinutes? }`;
  a field of another kind is a validation error. A Knowledge Source is `{ path, title? }` (relative to the
  Workspace root, or absolute; a relative path is invalid for kind `none`) or `{ text, title? }`.
  `outerFolders` is a list of absolute paths every Pilot of the Project's Missions may write to; a path that is
  relative, is the configuration home, lies inside it or contains it is an `Issue` with code
  `invalid_outer_folder` and path `outerFolders.N` (400 on `POST /api/projects` and the Profile `PUT`).
  Assemblies are validated against the Project's Workspace: a Check or context source it cannot provide is an
  `Issue` with code `check_unavailable` or `context_source_unavailable` (Amended 2026-10-26 by
  features/workspaces/SPEC.md).

## Health and models

```
GET /api/health   { engine: { ok, reason? }, host: { ok, reason? }, configHome }
GET /api/models   { id, displayName }[]
```

## Units (the Hangar)

```
GET    /api/units                    { items: { name, unit: UnitFile | null, etag, issues: Issue[] }[] }
GET    /api/units/:name              { name, unit, etag, issues, usage: { assemblies: [{ project, assembly }], activeMissions } }
PUT    /api/units/:name              body UnitFile → { unit, etag }   (body.name ≠ :name renames; 409 in_use when used)
DELETE /api/units/:name              204 | 409 in_use
POST   /api/units/:name/duplicate    { newName } → 201 { unit, etag }
```

`activeMissions` counts active Missions whose snapshot places the Unit in a Slot.

## Projects, Profiles and Assemblies

```
GET    /api/projects                                        { items: { name, profile, etag, issues, assemblies: [{ name, status, issues, activeMissions }], activeMissions }[] }
POST   /api/projects                                        { profile: ProfileFile } → 201 { profile, etag }
GET    /api/projects/:project                               { name, profile, etag, issues, assemblies, activeMissions }
PUT    /api/projects/:project/profile                       body ProfileFile → { profile, etag }   (body.name ≠ :project renames the folder; 409 active_missions)
DELETE /api/projects/:project                               204 | 409 active_missions
GET    /api/projects/:project/checkouts                     { path, branch, isMainWorktree, busyMissionId }[] | 404 { reason: 'not_found', message: 'This Project has no Checkouts' } (Workspace without git) | 500 { reason: 'checkouts_unavailable', message }
GET    /api/projects/:project/assemblies/:assembly          { name, assembly: AssemblyFile | null, text?, etag, status: 'valid' | 'invalid' | 'unparseable', issues: { errors, warnings }, activeMissions }
PUT    /api/projects/:project/assemblies/:assembly          body AssemblyFile → { assembly, etag, warnings }   (400 when validateAssembly reports errors)
DELETE /api/projects/:project/assemblies/:assembly          204 | 409 active_missions
POST   /api/projects/:project/assemblies/:assembly/duplicate { newName } → 201 { assembly, etag }
```

`status: 'unparseable'` carries the raw `text` and the parse error in `issues.errors[0]`.

## Export and Import

```
GET  /api/export/contents                         { units: [{ name, title? }], projects: [{ name, title?, units: string[] }] }
POST /api/export          body { units, projects } → { files: { path, text }[] }   | 400 unknown_unit, unknown_project, empty_selection
POST /api/import/preview  body { files, choices }  → { elements: ImportElement[] } | 400 { issues }
POST /api/import/apply    body { files, choices }  → { added: ElementRef[], replaced: ElementRef[] } | 400 { issues } | 500 { reason: 'import_failed', message }
```

An Export is a list of files at their paths in `SUPTRON_HOME` (`hangar/<unit>.md`,
`projects/<project>/profile.yaml`, `projects/<project>/assemblies/<assembly>.yaml`); the browser packs
it into a zip and unpacks a chosen zip. A project's `units` are the Hangar Units its Assemblies place.

The Import routes refuse a file set that is not an Export as a whole with `empty_export`,
`outside_layout` (a path outside the layout above) or `duplicate_path`, and `invalid_paths` when
`choices.paths` names a Project whose Profile is not written or does not fit its shape.
`choices` is `{ replace: string[], paths: Record<project, { workspace, outerFolders, knowledgeSources: [{ index, path }] }> }`:
a `different` element is replaced only when its path is in `replace`; edited paths are written into
the Profile. Each `ImportElement` has `status` (`new`, `same`, `different`, comparing text with CRLF
read as LF), `action` (`add`, `replace`, `keep`, `none`), the `issues` of the version that will exist
afterwards, and for a Profile that will be written its `paths`. Apply writes all or nothing; a failure
puts the home back and answers 500. Both Import routes take bodies of up to 32 MiB.

## Tools

```
POST /api/open                       { path } → 204 | 400 outside_home | 500 { reason: 'editor_failed', message }
GET  /api/git/remote-defaults?path=  { remote, remoteUrl, headBranch } | 404 { reason: 'not_a_repository' }
GET  /api/fs/stat?path=&base=        { exists, kind?: 'file' | 'dir', path }   (absolute path, or relative to ?base=)
```

`POST /api/open` runs `SUPTRON_EDITOR` (default `code --goto {path}`), falling back to `open {path}` on
macOS; the path must be inside `SUPTRON_HOME`.

## Missions

```
GET    /api/missions                  MissionSummary[]   (every Mission since start; Completed ones stay until Dismiss or a restart, Stopped and interrupted ones until Dismiss)
POST   /api/missions                  { project, assembly, task, title?, workItemId?, checkoutPath?, mayAskCommander?: Record<slot, boolean> } → 201 MissionSummary
                                      task: { kind: 'path', path } | { kind: 'text', text }; text is stored as missions/<id>/task.md and that folder becomes the Task location
                                      checkoutPath is required for a repository Project and refused for the other kinds (field 'checkoutPath')
                                      400 { issues: { field: 'taskPath' | 'taskText' | 'checkoutPath' | 'workspace' | 'assembly' | 'workItemId' | 'outerFolders', message }[] }
                                      ('outerFolders': an Outer Folder of the Profile does not exist; the system does not create it)
                                      409 { reason: 'workspace_busy', missionId }   (the Checkout or the folder is in use; a Project without a folder is never busy)
GET    /api/missions/:id              MissionDetail | 404
POST   /api/missions/:id/stop         204
POST   /api/missions/:id/resume       200 MissionSummary | 404 | 409 { reason: 'not_stopped' | 'cannot_resume', message } | 409 { reason: 'workspace_busy', missionId }
                                      a Stopped Mission goes on at the Slot it stood at, on the configuration it started with; `cannot_resume`: the Workspace,
                                      the Task location, an Outer Folder or the Mission folder is gone, or the Mission holds nothing to resume from (`message` says which)
POST   /api/missions/:id/retry        { note? } → 204 | 409 { reason: 'not_needs_attention' }
POST   /api/missions/:id/answer       { questionId, answers: Record<question, string> } → 204 | 409 { reason: 'no_such_question' }
POST   /api/missions/:id/side-slots/:name/stop   204 | 404 (Mission or Side Slot) | 409 { reason: 'side_slot_not_running', message }
                                      the Side Slot counts as failed with the note "Stopped by the Commander"; the next one of its chain starts
POST   /api/missions/:id/side-slots/:name/run    204 | 404 (Mission or Side Slot) | 409 { reason: 'side_slot_not_runnable', message } | 409 { reason: 'workspace_busy', missionId }
                                      a failed or interrupted Side Slot of a Mission that is not Stopped runs once more at the end of its Slot's chain;
                                      a Completed Mission is Running again for the time of the run (and holds its Workspace), then Completed again
DELETE /api/missions/:id              204 | 404 | 409 { reason: 'not_finished' }
```

`MissionDetail`:

```ts
interface MissionDetail {
                                    // taskTitle: the `title` given at start (at most 80 characters), or `<project>-<YYYY-MM-DD>` of the start day
  summary: MissionSummary;          // id, projectName, assemblyName, taskPath, taskTitle, workItemId?, state, currentSlot, workspace: { kind, path, branch }, startedAt, cost (estimated), pr?, note?, usageResetsAt?
                                    // state: 'running' | 'waiting_for_owner' | 'waiting_for_usage' | 'needs_attention' | 'stopped' | 'completed'; usageResetsAt (ISO) only in 'waiting_for_usage'
                                    // workspace.path: the Checkout or the folder, null for kind none; workspace.branch: the Checkout's branch, null otherwise
  assembly: AssemblyFile;           // the document at start, for the clock
  slots: SlotRecord[];              // Assembly order, then 'core': { name, attempts, loops, skipped?, lastOutput?, cost, checkResults, resolutions?, subPilots? }
                                    // loops: the rounds of the Slot's own Loop since a later Slot's Loop last sent the work back before it; skipped: how often the Slot was passed by
                                    // subPilots: per Sub-pilot of the Slot, its calls and its error-free returns in the last Attempt: { unit, calls, returns }[]
  sideSlots: SideSlotRecord[];      // the Side Slots started so far, Assembly order: { name, parent, unit, status: 'waiting' | 'running' | 'done' | 'failed' | 'interrupted', starts, note?, cost }
  transcript: TranscriptSection[];  // one section per execution: { execution: { slot, attempt, loopIteration?, loopFrom?, loopGrantedBy? }, sideSlotOf?, entries, dropped }
                                    // a Side Slot's run has a section of its own: `execution.slot` is its name, `sideSlotOf` its Slot
  transcriptLost: boolean;          // true for Missions recovered from the ledger after a restart; once resumed, `transcript` holds the sections since the Resume
  resumable: boolean;               // true for a Stopped Mission that holds what POST .../resume needs
  pendingQuestion?: { id, slot, questions: Question[] };   // one at a time: questions a Pilot asks while one is pending queue up and are shown after the answer
  attention?: { cause, reason, slot, failedChecks };        // cause: 'handover_not_done' | 'attempt_limit' | 'loop_limit' | 'last_exit_condition_failed' | 'ci_timeout' | 'engine_error'
  result?: { report, pr: PullRequestRef | null, exitSlot };  // present from `mission.reported` on, while Side Slots may still run
  seq: number;                      // the last event applied; pass it as ?after= to the event stream
}
```

Transcript entries are `text`, `tool_call` (with its `result` merged in), `check`, `question`, `answer`,
`note` (the Commander's Retry note, first entry of the Attempt that received it) and `error`. A `text` or
`tool_call` made inside an agent the Pilot called carries `agent: { name, callId }`. An entry goes into the
latest section of the Slot or Side Slot its event names. The current
section is kept in full; every earlier section is trimmed to its last 200 entries, `dropped` counting what
was removed.

## Events (Server-Sent Events)

```
GET /api/events?mission=<id>&after=<seq>
GET /api/events
```

Every `MissionEvent` carries `missionId` and `seq` (monotonic per Mission from 1). Each SSE message has
`id: <seq>` and `data: <MissionEvent JSON>`; a heartbeat comment is sent every 15 seconds.

With `?mission=`, buffered events with `seq > after` are replayed first (`Last-Event-ID` works the same
way), then live events follow. When `after` is older than the buffer, the first message is
`event: resync` with `data: {}` and the client should refetch `GET /api/missions/:id` and resubscribe with
its `seq`. Without `?mission=`, the stream carries every Mission's events except `agent.*`,
`check.evaluated`, `core.resolved` and `side_slots.left_out`, including `mission.dismissed`.

Event types: `mission.started`, `mission.state` (`state`, and `cause`, `reason`, `slot`, `failedChecks`
for `needs_attention`; `slot` for `waiting_for_owner`; `resetsAt` for `waiting_for_usage`), `mission.resumed` (`mission`: the summary of the resumed Mission, replacing the one the client holds; the Slot it stood at follows with `slot.started` and a `note`), `slot.started` (`attempt`, `loopIteration?`,
`loopFrom?`, `loopGrantedBy?: 'commander' | 'core'` on a round granted at the Loop limit, `note?`), `slot.skipped` (`slot`, `loopFrom`: a done Slot with `skipWhenDone` was passed by in the round of the Loop of `loopFrom`; it opens no transcript section), `slot.done` (`output`, `acceptedAtLimit?: true` when the Loop's Accept Condition stood in for the Done Condition at the limit), `agent.text`, `agent.tool_call`, `agent.tool_result`, `agent.error`, `agent.activity` (`payload: { phase: 'thinking' | 'writing' | 'tool', detail? }`: a sign of life at most once a second while the Pilot thinks, writes or runs a tool; not a transcript entry, never replayed),
`agent.sub_pilot_called` (`slot`, `attempt`, `subPilot`, `callId`), `agent.sub_pilot_returned` (`slot`, `attempt`, `subPilot`, `callId`, `isError`): the Pilot called one of its Sub-pilots and it returned (a call of one of the Engine's general agents is not reported; `agent.text`, `agent.tool_call` and `agent.tool_result` made inside any called agent carry `payload.agent: { name, callId }`),
`check.evaluated` (a required Sub-pilot is the Check `{ kind: 'sub_pilot_returned', unit }`, first in the Done Condition), `core.resolved` (`slot`, `resolution: { cause, decision: 'retry' | 'accept', reason, note?, failedChecks }`: the Core decided in the Commander's place; a `retry` is followed by `slot.started` without a `note`, an `accept` by `slot.done`, or, for the cause `handover_not_done`, by the Checks of the Done Condition first), `question.asked`, `question.answered`, `cost.updated` (`slot` may name a Side Slot), `side_slot.waiting` (`slot`: the Side Slot, `parent`: its Slot),
`side_slot.started` (`slot`, `parent`, `attempt`: the number of its run; its Pilot's `agent.*` events carry its name as `slot`), `side_slot.ended` (`slot`, `parent`, `attempt`,
`status: 'done' | 'failed' | 'interrupted'`, `note?`), `side_slots.left_out` (`slot`: a Slot done again while its Side Slots from an earlier time still ran),
`mission.reported` (`result: { report, pr, exitSlot }`: the Exit Condition held; the Mission stays Running until its Side Slots have ended), `mission.completed` (`report`,
`pr`, `exitSlot`, `slots`, `cost`), `mission.stopped` (`note?: 'interrupted'`), `mission.dismissed`.

## A Mission, end to end

```
UI                      server                    Runner / Core / Pilot
 │ POST /api/missions ──▶ validate, snapshot ───▶ Runner.run()
 │ ◀── 201 summary        emit mission.started
 │ GET /api/events?mission=id&after=seq
 │ ◀── slot.started, agent.*, check.evaluated ... (Core composes the prompt, Pilot works, Checks run)
 │ ◀── question.asked / mission.state waiting_for_owner      (Human Checkpoint)
 │ POST /answer ────────▶ respond to the Pilot ──▶ question.answered, mission.state running
 │ ◀── core.resolved (retry | accept)                         (the Core decides first, within its limit)
 │ ◀── mission.state needs_attention (cause, reason, failedChecks)
 │ POST /retry {note} ──▶ one more Attempt ─────▶ slot.started (attempt+1, note)
 │ ◀── mission.completed (report, pr, exitSlot)  or  mission.stopped
 │ DELETE /api/missions/:id ───────────────────▶ mission.dismissed
```
