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
GET    /api/projects/:project/checkouts                     { path, branch, isMainWorktree, busyMissionId }[] | 500 { reason: 'checkouts_unavailable', message }
GET    /api/projects/:project/assemblies/:assembly          { name, assembly: AssemblyFile | null, text?, etag, status: 'valid' | 'invalid' | 'unparseable', issues: { errors, warnings }, activeMissions }
PUT    /api/projects/:project/assemblies/:assembly          body AssemblyFile → { assembly, etag, warnings }   (400 when validateAssembly reports errors)
DELETE /api/projects/:project/assemblies/:assembly          204 | 409 active_missions
POST   /api/projects/:project/assemblies/:assembly/duplicate { newName } → 201 { assembly, etag }
```

`status: 'unparseable'` carries the raw `text` and the parse error in `issues.errors[0]`.

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
GET    /api/missions                  MissionSummary[]   (every Mission since start; Completed, Stopped and interrupted stay until Dismiss)
POST   /api/missions                  { project, assembly, task, workItemId?, checkoutPath, mayAskCommander?: Record<slot, boolean> } → 201 MissionSummary
                                      task: { kind: 'path', path } | { kind: 'text', text }; text is stored as missions/<id>/task.md and that folder becomes the Task location
                                      400 { issues: { field: 'taskPath' | 'taskText' | 'checkoutPath' | 'assembly' | 'workItemId', message }[] }
                                      409 { reason: 'checkout_busy', missionId }
GET    /api/missions/:id              MissionDetail | 404
POST   /api/missions/:id/stop         204
POST   /api/missions/:id/retry        { note? } → 204 | 409 { reason: 'not_needs_attention' }
POST   /api/missions/:id/answer       { questionId, answers: Record<question, string> } → 204 | 409 { reason: 'no_such_question' }
DELETE /api/missions/:id              204 | 404 | 409 { reason: 'not_finished' }
```

`MissionDetail`:

```ts
interface MissionDetail {
  summary: MissionSummary;          // id, projectName, assemblyName, taskPath, taskTitle, workItemId?, state, currentSlot, branch, checkoutPath, startedAt, cost (estimated), pr?, note?
  assembly: AssemblyFile;           // the document at start, for the clock
  slots: SlotRecord[];              // Assembly order, then 'core': { name, attempts, loops, lastOutput?, cost, checkResults }
  transcript: TranscriptSection[];  // one section per execution: { execution: { slot, attempt, loopIteration?, loopFrom? }, entries, dropped }
  transcriptLost: boolean;          // true for Missions recovered from the ledger after a restart
  pendingQuestion?: { id, slot, questions: Question[] };
  attention?: { cause, reason, slot, failedChecks };
  result?: { report, pr: PullRequestRef | null, exitSlot };
  seq: number;                      // the last event applied; pass it as ?after= to the event stream
}
```

Transcript entries are `text`, `tool_call` (with its `result` merged in), `check`, `question`, `answer`,
`note` (the Commander's Retry note, first entry of the Attempt that received it) and `error`. The current
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
its `seq`. Without `?mission=`, the stream carries every Mission's events except `agent.*` and
`check.evaluated`, including `mission.dismissed`.

Event types: `mission.started`, `mission.state` (`state`, and `cause`, `reason`, `slot`, `failedChecks`
for `needs_attention`; `slot` for `waiting_for_owner`), `slot.started` (`attempt`, `loopIteration?`,
`loopFrom?`, `note?`), `slot.done`, `agent.text`, `agent.tool_call`, `agent.tool_result`, `agent.error`,
`check.evaluated`, `question.asked`, `question.answered`, `cost.updated`, `mission.completed` (`report`,
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
 │ ◀── mission.state needs_attention (cause, reason, failedChecks)
 │ POST /retry {note} ──▶ one more Attempt ─────▶ slot.started (attempt+1, note)
 │ ◀── mission.completed (report, pr, exitSlot)  or  mission.stopped
 │ DELETE /api/missions/:id ───────────────────▶ mission.dismissed
```
