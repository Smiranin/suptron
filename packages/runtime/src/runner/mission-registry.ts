import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig as defaultLoadConfig, type LoadedConfig } from '../config/load.js';
import type { AssemblyFile } from '../config/schemas.js';
import { buildSnapshot, type MissionSnapshot } from '../config/snapshot.js';
import { EngineCoreAgent } from '../core-agent/index.js';
import {
  MISSION_TITLE_MAX_LENGTH,
  defaultMissionTitle,
  isActiveState,
  type MissionAttention,
  type MissionResult,
  type MissionSummary,
  type MissionTask,
  type PendingQuestion,
  type SlotRecord,
} from '../domain/mission.js';
import type { Answers } from '../domain/transcript.js';
import type { Engine } from '../engine/index.js';
import type { MissionEvent, MissionEventInput } from '../events/mission-event.js';
import { TypedEmitter } from '../events/typed-emitter.js';
import type { Checkout, GitClient } from '../git/types.js';
import type { RepoHost } from '../host/index.js';
import { slugify } from '../templates/index.js';
import { capabilitiesOf } from '../workspace/kinds.js';
import { busyKeyOf, openWorkspace } from '../workspace/open.js';
import {
  WorkspaceOpenError,
  buildGuard,
  type Workspace,
  type WorkspaceIssueField,
} from '../workspace/workspace.js';
import { resolveKnowledgeSources } from './context.js';
import { Ledger, type LedgerEntry, type MissionOrigin, type ResumeState } from './ledger.js';
import { MissionStateError, Runner, type RunnerRestore } from './runner.js';
import {
  createMissionFolder,
  listTaskDocuments,
  missionFolder,
  removeMissionFolder,
  storeTaskText,
  textTaskDocument,
} from './task.js';

export interface StartMissionInput {
  project: string;
  assembly: string;
  task: MissionTask;
  /** Names the Mission and what it produces; empty or absent means the Project name and the date. */
  title?: string;
  workItemId?: string;
  /** Required for a `repository` Project, refused for the other kinds (SPEC FR-9). */
  checkoutPath?: string;
  mayAskCommander?: Record<string, boolean>;
}

export type StartIssueField =
  'taskPath' | 'taskText' | 'title' | 'assembly' | 'workItemId' | WorkspaceIssueField;

export class MissionStartError extends Error {
  constructor(readonly issues: { field: StartIssueField; message: string }[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'MissionStartError';
  }
}

/** The Workspace (a Checkout or a folder) is in use by an active Mission (SPEC FR-10). */
export class WorkspaceBusyError extends Error {
  constructor(readonly missionId: string) {
    super(`The Workspace is busy with Mission ${missionId}`);
    this.name = 'WorkspaceBusyError';
  }
}

/** What the registry knows about one Mission, for `GET /api/missions/:id`. */
export interface MissionRecord {
  summary: MissionSummary;
  assembly: AssemblyFile;
  snapshot: MissionSnapshot | null;
  slots: SlotRecord[];
  transcriptLost: boolean;
  resumable: boolean;
  pendingQuestion?: PendingQuestion;
  attention?: MissionAttention;
  result?: MissionResult;
  seq: number;
}

interface Entry {
  runner: Runner | null;
  /** The Core of `runner`; its session goes to the ledger. */
  core: EngineCoreAgent | null;
  recovered: LedgerEntry | null;
  assembly: AssemblyFile;
  snapshot: MissionSnapshot | null;
  /** The open Workspace of a running Mission; null for a recovered one until it is resumed. */
  workspace: Workspace | null;
  /** Null for a Mission recovered from a ledger that held nothing to resume from. */
  origin: MissionOrigin | null;
  /** True for a Mission recovered from the ledger: what was said before the restart is gone. */
  transcriptLost: boolean;
  seq: number;
}

export interface MissionRegistryDeps {
  home: string;
  engine: Engine;
  host: RepoHost;
  git: GitClient;
  loadConfig?: (home: string) => Promise<LoadedConfig>;
  ciPollIntervalMs?: number;
  ciNoneGraceMs?: number;
  ciWaitTimeoutMs?: number;
  usageResetMarginMs?: number;
  now?: () => Date;
  newId?: () => string;
}

export interface CheckoutStatus extends Checkout {
  busyMissionId: string | null;
}

const WORK_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Every Mission known since start: starts, controls, Workspace busy-ness, the ledger. */
export class MissionRegistry {
  readonly events = new TypedEmitter<MissionEvent>();
  private readonly entries = new Map<string, Entry>();
  /** Missions with a Resume under way: a second one is refused. */
  private readonly resuming = new Set<string>();
  private readonly ledger: Ledger;
  private readonly loadConfig: (home: string) => Promise<LoadedConfig>;

  constructor(private readonly deps: MissionRegistryDeps) {
    this.ledger = new Ledger(deps.home);
    this.loadConfig = deps.loadConfig ?? defaultLoadConfig;
  }

  get home(): string {
    return this.deps.home;
  }

  list(): MissionSummary[] {
    return [...this.entries.entries()].map(([id]) => this.summaryOf(id)!);
  }

  get(id: string): MissionRecord | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.runner) {
      const runner = entry.runner;
      return {
        summary: structuredClone(runner.summary),
        assembly: entry.assembly,
        snapshot: entry.snapshot,
        slots: structuredClone(runner.slotRecords()),
        transcriptLost: entry.transcriptLost,
        resumable: runner.state === 'stopped' && entry.origin !== null,
        ...(runner.pendingQuestion && { pendingQuestion: structuredClone(runner.pendingQuestion) }),
        ...(runner.attention && { attention: structuredClone(runner.attention) }),
        ...(runner.result && { result: structuredClone(runner.result) }),
        seq: entry.seq,
      };
    }
    const recovered = entry.recovered!;
    return {
      summary: structuredClone(recovered.summary),
      assembly: entry.assembly,
      snapshot: null,
      slots: structuredClone(recovered.slots),
      transcriptLost: true,
      resumable: recovered.resume !== undefined,
      seq: entry.seq,
    };
  }

  private summaryOf(id: string): MissionSummary | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return structuredClone(entry.runner ? entry.runner.summary : entry.recovered!.summary);
  }

  /** The id of the active Mission whose Workspace has this busy key, if any. */
  isWorkspaceBusy(busyKey: string | null): string | null {
    if (busyKey === null) return null;
    for (const [id, entry] of this.entries) {
      const summary = entry.runner?.summary;
      if (summary && isActiveState(summary.state) && entry.workspace?.busyKey === busyKey) {
        return id;
      }
    }
    return null;
  }

  /** The id of the active Mission using this Checkout or folder, if any. */
  isCheckoutBusy(path: string): string | null {
    return this.isWorkspaceBusy(busyKeyOf(path));
  }

  /** Active Missions whose snapshot matches: a Unit in a Slot, an Assembly of a Project, or a Project. */
  countActiveMissions(filter: { unit?: string; project?: string; assembly?: string }): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      const summary = entry.runner?.summary;
      if (!summary || !isActiveState(summary.state) || !entry.snapshot) continue;
      if (filter.project !== undefined && summary.projectName !== filter.project) continue;
      if (filter.assembly !== undefined && summary.assemblyName !== filter.assembly) continue;
      if (
        filter.unit !== undefined &&
        !entry.snapshot.assembly.slots.some((s) => s.unit === filter.unit)
      )
        continue;
      count += 1;
    }
    return count;
  }

  /** The Checkouts of a repository Project, or null when its Workspace has no git. */
  async listCheckouts(project: string): Promise<CheckoutStatus[] | null> {
    const config = await this.loadConfig(this.deps.home);
    const profile = config.projects.find((p) => p.name === project)?.profile;
    if (!profile) throw new MissionStateError('not_found', `Unknown Project ${project}`);
    if (profile.workspace.kind !== 'repository' || !capabilitiesOf(profile.workspace).has('git')) {
      return null;
    }
    const checkouts = await this.deps.git.listCheckouts(profile.workspace.path);
    return checkouts.map((c) => ({ ...c, busyMissionId: this.isCheckoutBusy(c.path) }));
  }

  async start(input: StartMissionInput): Promise<MissionSummary> {
    const issues: { field: StartIssueField; message: string }[] = [];
    const config = await this.loadConfig(this.deps.home);
    const project = config.projects.find((p) => p.name === input.project);
    if (!project) issues.push({ field: 'assembly', message: `Unknown Project "${input.project}"` });
    else if (!project.profile) {
      issues.push({
        field: 'assembly',
        message: `The Profile of "${input.project}" is invalid: ${project.issues[0]?.message ?? ''}`,
      });
    }
    const assembly = project?.assemblies.find((a) => a.name === input.assembly);
    if (project && !assembly)
      issues.push({ field: 'assembly', message: `Unknown Assembly "${input.assembly}"` });
    else if (assembly && (assembly.status !== 'valid' || !assembly.assembly)) {
      issues.push({
        field: 'assembly',
        message: `The Assembly is ${assembly.status}: ${assembly.issues.errors[0]?.message ?? ''}`,
      });
    }
    if (
      input.workItemId !== undefined &&
      input.workItemId.trim() !== '' &&
      !WORK_ITEM_ID.test(input.workItemId.trim())
    ) {
      issues.push({ field: 'workItemId', message: 'Use letters, digits, ".", "_" and "-" only' });
    }
    const title = input.title?.trim() ?? '';
    if (title.length > MISSION_TITLE_MAX_LENGTH) {
      issues.push({
        field: 'title',
        message: `Use at most ${MISSION_TITLE_MAX_LENGTH} characters`,
      });
    }
    let taskIsFile = false;
    if (input.task.kind === 'path') {
      try {
        taskIsFile = (await stat(resolve(input.task.path))).isFile();
      } catch {
        issues.push({
          field: 'taskPath',
          message: `The Task location does not exist: ${input.task.path}`,
        });
      }
    } else if (input.task.text.trim() === '') {
      issues.push({ field: 'taskText', message: 'The Task text is empty' });
    }
    if (issues.length > 0) throw new MissionStartError(issues);

    const profile = project!.profile!;
    const document = assembly!.assembly!;
    const units = config.units.flatMap((u) => (u.unit ? [u.unit] : []));
    const snapshot = buildSnapshot(profile, document, units, input.mayAskCommander ?? {});
    const workItemId = input.workItemId?.trim() || undefined;
    const id = (this.deps.newId ?? randomUUID)();
    const task = input.task;

    // Every Mission has its folder before the Workspace opens: kind `none` works in it (FR-11).
    const missionDir = await createMissionFolder(this.deps.home, id);
    let workspace: Workspace;
    try {
      const taskPath =
        task.kind === 'path'
          ? resolve(task.path)
          : await storeTaskText(this.deps.home, id, task.text);
      workspace = await openWorkspace(
        profile,
        {
          missionDir,
          ...(input.checkoutPath !== undefined && { checkoutPath: input.checkoutPath }),
        },
        { git: this.deps.git, host: this.deps.host },
      );
      const busy = this.isWorkspaceBusy(workspace.busyKey);
      if (busy) throw new WorkspaceBusyError(busy);
      return await this.launch({
        id,
        profile,
        document,
        snapshot,
        task,
        title,
        taskPath,
        taskIsFile,
        workItemId,
        workspace,
        ...(input.checkoutPath !== undefined && { checkoutPath: input.checkoutPath }),
      });
    } catch (error) {
      await removeMissionFolder(this.deps.home, id);
      if (error instanceof WorkspaceOpenError) throw new MissionStartError(error.issues);
      throw error;
    }
  }

  private async launch(args: {
    id: string;
    profile: NonNullable<LoadedConfig['projects'][number]['profile']>;
    document: AssemblyFile;
    snapshot: MissionSnapshot;
    task: MissionTask;
    /** Trimmed; empty when the Commander gave none. */
    title: string;
    taskPath: string;
    taskIsFile: boolean;
    workItemId: string | undefined;
    workspace: Workspace;
    checkoutPath?: string;
  }): Promise<MissionSummary> {
    const { id, profile, document, snapshot, task, taskPath, taskIsFile, workItemId, workspace } =
      args;
    const startedAt = (this.deps.now ?? (() => new Date()))();
    const taskTitle = args.title || defaultMissionTitle(profile.name, startedAt);
    const taskDocuments =
      task.kind === 'path'
        ? await listTaskDocuments(taskPath, taskIsFile)
        : [textTaskDocument(taskPath)];
    const gitConventions = workspace.gitConventions({
      ...(workItemId !== undefined && { workItemId }),
      taskTitle,
      taskSlug: slugify(taskTitle) || 'task',
    });
    const origin: MissionOrigin = {
      snapshot,
      meta: {
        id,
        projectName: profile.name,
        assemblyName: document.name,
        taskPath,
        taskTitle,
        taskDocuments,
        ...(workItemId !== undefined && { workItemId }),
        configHome: this.deps.home,
        gitConventions,
        knowledgeSources: resolveKnowledgeSources(profile.knowledgeSources, workspace.cwd),
        startedAt: startedAt.toISOString(),
      },
      coreCwd: taskIsFile ? resolve(taskPath, '..') : taskPath,
      ...(args.checkoutPath !== undefined && { checkoutPath: args.checkoutPath }),
    };
    const entry: Entry = {
      runner: null,
      core: null,
      recovered: null,
      assembly: document,
      snapshot,
      workspace,
      origin,
      transcriptLost: false,
      seq: 0,
    };
    this.entries.set(id, entry);
    const runner = this.engage(entry, origin, workspace);
    await this.writeLedger();
    this.emit(id, {
      type: 'mission.started',
      missionId: id,
      mission: structuredClone(runner.summary),
    });
    void runner.run();
    return structuredClone(runner.summary);
  }

  /** Gives the entry its Core and its Runner on an open Workspace; a Resume passes where to go on. */
  private engage(
    entry: Entry,
    origin: MissionOrigin,
    workspace: Workspace,
    resume?: RunnerRestore & { coreSessionId?: string },
  ): Runner {
    const { snapshot, meta } = origin;
    const core = new EngineCoreAgent(this.deps.engine, {
      model: snapshot.assembly.core.model,
      instructions: snapshot.assembly.core.instructions,
      cwd: origin.coreCwd,
      readDirectories: [workspace.cwd],
      guard: buildGuard(workspace, {
        cwd: origin.coreCwd,
        taskPath: meta.taskPath,
        taskDocuments: meta.taskDocuments,
        configHome: this.deps.home,
      }),
      ...(resume?.coreSessionId !== undefined && { resumeSessionId: resume.coreSessionId }),
      onCost: (cost) => runner.addCoreCost(cost),
      onUsageLimit: (resetsAt) => runner.waitForUsage(resetsAt),
    });
    const runner: Runner = new Runner(
      snapshot,
      meta,
      {
        engine: this.deps.engine,
        workspace,
        core,
        emit: (event) => this.emit(meta.id, event),
        // The session of an Attempt is known before any event that rewrites the ledger.
        onProgress: () => this.saveLedger(),
        ...(this.deps.ciPollIntervalMs !== undefined && {
          ciPollIntervalMs: this.deps.ciPollIntervalMs,
        }),
        ...(this.deps.ciNoneGraceMs !== undefined && { ciNoneGraceMs: this.deps.ciNoneGraceMs }),
        ...(this.deps.ciWaitTimeoutMs !== undefined && {
          ciWaitTimeoutMs: this.deps.ciWaitTimeoutMs,
        }),
        ...(this.deps.usageResetMarginMs !== undefined && {
          usageResetMarginMs: this.deps.usageResetMarginMs,
        }),
      },
      resume && { progress: resume.progress, records: resume.records },
    );
    entry.runner = runner;
    entry.core = core;
    entry.recovered = null;
    entry.workspace = workspace;
    entry.snapshot = snapshot;
    return runner;
  }

  /**
   * Resumes a Stopped Mission, stopped by hand or interrupted by a restart: the Workspace is
   * reopened and the Slot the Mission stood at runs again, on the configuration it started with.
   */
  async resume(id: string): Promise<MissionSummary> {
    const entry = this.requireEntry(id);
    if (this.summaryOf(id)!.state !== 'stopped' || this.resuming.has(id)) {
      throw new MissionStateError('not_stopped', 'Only a Stopped Mission can be resumed');
    }
    const state = this.resumeStateOf(entry);
    if (!state) {
      throw new MissionStateError(
        'cannot_resume',
        'This Mission holds nothing to resume from: it was stopped by an earlier version of Suptron',
      );
    }
    const slots = entry.runner ? entry.runner.slotRecords() : entry.recovered!.slots;
    this.resuming.add(id);
    try {
      const missionDir = missionFolder(this.deps.home, id);
      await requirePath('The Mission folder', missionDir);
      await requirePath('The Task location', state.meta.taskPath);
      let workspace: Workspace;
      try {
        workspace = await openWorkspace(
          state.snapshot.profile,
          {
            missionDir,
            ...(state.checkoutPath !== undefined && { checkoutPath: state.checkoutPath }),
          },
          { git: this.deps.git, host: this.deps.host },
        );
      } catch (error) {
        if (!(error instanceof WorkspaceOpenError)) throw error;
        throw new MissionStateError(
          'cannot_resume',
          error.issues.map((issue) => issue.message).join('; '),
        );
      }
      const busy = this.isWorkspaceBusy(workspace.busyKey);
      if (busy) throw new WorkspaceBusyError(busy);
      const { progress, coreSessionId, ...origin } = state;
      entry.origin = origin;
      const runner = this.engage(entry, origin, workspace, {
        progress,
        records: structuredClone(slots),
        ...(coreSessionId !== undefined && { coreSessionId }),
      });
      await this.writeLedger();
      this.emit(id, {
        type: 'mission.resumed',
        missionId: id,
        mission: structuredClone(runner.summary),
      });
      void runner.run();
      return structuredClone(runner.summary);
    } finally {
      this.resuming.delete(id);
    }
  }

  /** What a Resume of this entry starts from; undefined when the entry holds none. */
  private resumeStateOf(entry: Entry): ResumeState | undefined {
    if (!entry.runner) return entry.recovered?.resume;
    if (!entry.origin) return undefined;
    const coreSessionId = entry.core?.session;
    return {
      ...entry.origin,
      progress: entry.runner.progress(),
      ...(coreSessionId !== undefined && { coreSessionId }),
    };
  }

  async stop(id: string): Promise<void> {
    const entry = this.requireEntry(id);
    if (!entry.runner) return;
    await entry.runner.stop();
  }

  retry(id: string, note?: string): void {
    const entry = this.requireEntry(id);
    if (!entry.runner)
      throw new MissionStateError('not_needs_attention', 'The Mission is not active');
    entry.runner.retry(note);
  }

  answer(id: string, questionId: string, answers: Answers): void {
    const entry = this.requireEntry(id);
    if (!entry.runner) throw new MissionStateError('no_such_question', 'The Mission is not active');
    entry.runner.answer(questionId, answers);
  }

  /** Removes a Completed, Stopped or interrupted Mission; refuses any other state. */
  async dismiss(id: string): Promise<void> {
    const entry = this.requireEntry(id);
    const summary = this.summaryOf(id)!;
    if (isActiveState(summary.state) || this.resuming.has(id)) {
      throw new MissionStateError(
        'not_finished',
        'Only Completed and Stopped Missions can be dismissed',
      );
    }
    this.entries.delete(id);
    await Promise.all([this.writeLedger(), removeMissionFolder(this.deps.home, id)]);
    const seq = entry.seq + 1;
    this.events.emit({ type: 'mission.dismissed', missionId: id, seq });
  }

  /**
   * Takes over the ledger of the previous run: a Mission that was active becomes Stopped with the
   * `interrupted` note, a Stopped one stays as it was. Both wait for a Resume or a Dismiss.
   */
  async recoverInterrupted(): Promise<MissionSummary[]> {
    const content = await this.ledger.read();
    const recovered: MissionSummary[] = [];
    for (const [id, raw] of Object.entries(content)) {
      if (this.entries.has(id) || !raw?.summary) continue;
      const { usageResetsAt: _dropped, ...kept } = raw.summary;
      void _dropped;
      const summary: MissionSummary = {
        ...kept,
        state: 'stopped',
        ...(isActiveState(raw.summary.state) && { note: 'interrupted' as const }),
        currentSlot: null,
      };
      this.entries.set(id, {
        runner: null,
        core: null,
        recovered: {
          summary,
          assembly: raw.assembly,
          slots: raw.slots ?? [],
          ...(raw.resume && { resume: raw.resume }),
        },
        assembly: raw.assembly,
        snapshot: raw.resume?.snapshot ?? null,
        workspace: null,
        origin: null,
        transcriptLost: true,
        seq: 0,
      });
      recovered.push(structuredClone(summary));
    }
    await this.writeLedger();
    return recovered;
  }

  /** Waits for pending ledger writes (tests and shutdown). */
  flush(): Promise<void> {
    return this.ledger.flush();
  }

  private requireEntry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new MissionStateError('not_found', `Unknown Mission ${id}`);
    return entry;
  }

  private emit(id: string, event: MissionEventInput): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.seq += 1;
    const stamped = { ...event, seq: entry.seq } as MissionEvent;
    this.events.emit(stamped);
    if (LEDGER_EVENT_TYPES.has(stamped.type)) this.saveLedger();
  }

  /** Rewrites the ledger without making the caller wait; a failed write is logged. */
  private saveLedger(): void {
    void this.writeLedger().catch((error) => console.error('[suptron] ledger write failed', error));
  }

  /** Every Mission that is not over: active and Stopped ones, with what a Resume needs. */
  private writeLedger(): Promise<void> {
    const content: Record<string, LedgerEntry> = {};
    for (const [id, entry] of this.entries) {
      const runner = entry.runner;
      if (!runner) {
        content[id] = entry.recovered!;
        continue;
      }
      if (runner.state === 'completed') continue;
      const resume = this.resumeStateOf(entry);
      content[id] = {
        summary: structuredClone(runner.summary),
        assembly: entry.assembly,
        slots: structuredClone(runner.slotRecords()),
        ...(resume && { resume }),
      };
    }
    return this.ledger.write(content);
  }
}

/** The events after which the ledger is rewritten: each changes what a Resume would start from. */
const LEDGER_EVENT_TYPES: ReadonlySet<MissionEvent['type']> = new Set<MissionEvent['type']>([
  'slot.started',
  'slot.done',
  'slot.skipped',
  'core.resolved',
  'cost.updated',
  'mission.state',
  'mission.resumed',
  'mission.completed',
  'mission.stopped',
]);

async function requirePath(what: string, path: string): Promise<void> {
  try {
    await stat(path);
  } catch {
    throw new MissionStateError('cannot_resume', `${what} does not exist any more: ${path}`);
  }
}
