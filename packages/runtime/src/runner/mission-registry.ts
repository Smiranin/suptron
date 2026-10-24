import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig as defaultLoadConfig, type LoadedConfig } from '../config/load.js';
import type { AssemblyFile } from '../config/schemas.js';
import { buildSnapshot, type MissionSnapshot } from '../config/snapshot.js';
import { EngineCoreAgent } from '../core-agent/index.js';
import {
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
import { renderGitConventions, slugify } from '../templates/index.js';
import { Ledger, type LedgerEntry } from './ledger.js';
import { MissionStateError, Runner } from './runner.js';
import {
  listTaskDocuments,
  removeMissionFolder,
  storeTaskText,
  textTaskDocument,
  titleFromTaskPath,
  titleFromTaskText,
} from './task.js';

export interface StartMissionInput {
  project: string;
  assembly: string;
  task: MissionTask;
  workItemId?: string;
  checkoutPath: string;
  mayAskCommander?: Record<string, boolean>;
}

export type StartIssueField = 'taskPath' | 'taskText' | 'checkoutPath' | 'assembly' | 'workItemId';

export class MissionStartError extends Error {
  constructor(readonly issues: { field: StartIssueField; message: string }[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'MissionStartError';
  }
}

export class CheckoutBusyError extends Error {
  constructor(readonly missionId: string) {
    super(`The Checkout is busy with Mission ${missionId}`);
    this.name = 'CheckoutBusyError';
  }
}

/** What the registry knows about one Mission, for `GET /api/missions/:id`. */
export interface MissionRecord {
  summary: MissionSummary;
  assembly: AssemblyFile;
  snapshot: MissionSnapshot | null;
  slots: SlotRecord[];
  transcriptLost: boolean;
  pendingQuestion?: PendingQuestion;
  attention?: MissionAttention;
  result?: MissionResult;
  seq: number;
}

interface Entry {
  runner: Runner | null;
  recovered: LedgerEntry | null;
  assembly: AssemblyFile;
  snapshot: MissionSnapshot | null;
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
  now?: () => Date;
  newId?: () => string;
}

export interface CheckoutStatus extends Checkout {
  busyMissionId: string | null;
}

const WORK_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Every Mission known since start: starts, controls, Checkout busy-ness, the ledger. */
export class MissionRegistry {
  readonly events = new TypedEmitter<MissionEvent>();
  private readonly entries = new Map<string, Entry>();
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
        transcriptLost: false,
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
      seq: entry.seq,
    };
  }

  private summaryOf(id: string): MissionSummary | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return structuredClone(entry.runner ? entry.runner.summary : entry.recovered!.summary);
  }

  /** The id of the active Mission using this Checkout, if any. */
  isCheckoutBusy(checkoutPath: string): string | null {
    for (const [id, entry] of this.entries) {
      const summary = entry.runner?.summary;
      if (summary && isActiveState(summary.state) && samePath(summary.checkoutPath, checkoutPath)) {
        return id;
      }
    }
    return null;
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

  async listCheckouts(project: string): Promise<CheckoutStatus[]> {
    const config = await this.loadConfig(this.deps.home);
    const profile = config.projects.find((p) => p.name === project)?.profile;
    if (!profile) throw new MissionStateError('not_found', `Unknown Project ${project}`);
    const checkouts = await this.deps.git.listCheckouts(profile.repository.path);
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
    let checkout: Checkout | undefined;
    if (project?.profile) {
      try {
        const checkouts = await this.deps.git.listCheckouts(project.profile.repository.path);
        const wanted = await realpathOr(input.checkoutPath);
        checkout = checkouts.find((c) => samePath(c.path, wanted));
        if (!checkout) {
          issues.push({
            field: 'checkoutPath',
            message: `Not a Checkout of ${project.profile.repository.path}: ${input.checkoutPath}`,
          });
        }
      } catch (error) {
        issues.push({
          field: 'checkoutPath',
          message: `Cannot read the Checkouts: ${String(error)}`,
        });
      }
    }
    if (issues.length > 0) throw new MissionStartError(issues);

    const checkoutPath = checkout!.path;
    const busy = this.isCheckoutBusy(checkoutPath);
    if (busy) throw new CheckoutBusyError(busy);

    const profile = project!.profile!;
    const document = assembly!.assembly!;
    const units = config.units.flatMap((u) => (u.unit ? [u.unit] : []));
    const snapshot = buildSnapshot(profile, document, units, input.mayAskCommander ?? {});
    const workItemId = input.workItemId?.trim() || undefined;
    const id = (this.deps.newId ?? randomUUID)();
    const task = input.task;
    const taskPath =
      task.kind === 'path'
        ? resolve(task.path)
        : await storeTaskText(this.deps.home, id, task.text);
    const taskTitle =
      task.kind === 'path' ? titleFromTaskPath(taskPath, taskIsFile) : titleFromTaskText(task.text);
    const taskDocuments =
      task.kind === 'path'
        ? await listTaskDocuments(taskPath, taskIsFile)
        : [textTaskDocument(taskPath)];
    const gitConventions = renderGitConventions(profile, {
      ...(workItemId !== undefined && { workItemId }),
      taskTitle,
      taskSlug: slugify(taskTitle) || 'task',
    });
    const entry: Entry = { runner: null, recovered: null, assembly: document, snapshot, seq: 0 };
    this.entries.set(id, entry);
    const emit = (event: MissionEventInput) => this.emit(id, event);
    const core = new EngineCoreAgent(this.deps.engine, {
      model: snapshot.assembly.core.model,
      instructions: snapshot.assembly.core.instructions,
      cwd: taskIsFile ? resolve(taskPath, '..') : taskPath,
      guard: {
        protectedBranch: profile.repository.protectedBranch,
        checkoutPath,
        taskPath,
        configHome: this.deps.home,
      },
      onCost: (cost) => entry.runner?.addCoreCost(cost),
    });
    const runner = new Runner(
      snapshot,
      {
        id,
        projectName: profile.name,
        assemblyName: document.name,
        taskPath,
        taskTitle,
        taskDocuments,
        ...(workItemId !== undefined && { workItemId }),
        checkoutPath,
        configHome: this.deps.home,
        gitConventions,
        startedAt: (this.deps.now ?? (() => new Date()))().toISOString(),
        branch: checkout!.branch,
      },
      {
        engine: this.deps.engine,
        host: this.deps.host,
        git: this.deps.git,
        core,
        emit,
        ...(this.deps.ciPollIntervalMs !== undefined && {
          ciPollIntervalMs: this.deps.ciPollIntervalMs,
        }),
        ...(this.deps.ciNoneGraceMs !== undefined && { ciNoneGraceMs: this.deps.ciNoneGraceMs }),
        ...(this.deps.ciWaitTimeoutMs !== undefined && {
          ciWaitTimeoutMs: this.deps.ciWaitTimeoutMs,
        }),
      },
    );
    entry.runner = runner;
    await this.writeLedger();
    emit({ type: 'mission.started', missionId: id, mission: structuredClone(runner.summary) });
    void runner.run();
    return structuredClone(runner.summary);
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
    if (isActiveState(summary.state)) {
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

  /** Turns leftover ledger entries into Stopped Missions with the `interrupted` note. */
  async recoverInterrupted(): Promise<MissionSummary[]> {
    const content = await this.ledger.read();
    const recovered: MissionSummary[] = [];
    for (const [id, raw] of Object.entries(content)) {
      if (this.entries.has(id) || !raw?.summary) continue;
      const summary: MissionSummary = {
        ...raw.summary,
        state: 'stopped',
        note: 'interrupted',
        currentSlot: null,
      };
      this.entries.set(id, {
        runner: null,
        recovered: { summary, assembly: raw.assembly, slots: raw.slots ?? [] },
        assembly: raw.assembly,
        snapshot: null,
        seq: 0,
      });
      recovered.push(structuredClone(summary));
    }
    // Recovered Missions live in memory until Dismiss or the next restart.
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
    if (
      stamped.type === 'slot.started' ||
      stamped.type === 'slot.done' ||
      stamped.type === 'mission.completed' ||
      stamped.type === 'mission.stopped'
    ) {
      void this.writeLedger().catch((error) =>
        console.error('[suptron] ledger write failed', error),
      );
    }
  }

  private writeLedger(): Promise<void> {
    const content: Record<string, LedgerEntry> = {};
    for (const [id, entry] of this.entries) {
      const runner = entry.runner;
      if (!runner || !isActiveState(runner.state)) continue;
      content[id] = {
        summary: structuredClone(runner.summary),
        assembly: entry.assembly,
        slots: structuredClone(runner.slotRecords()),
      };
    }
    return this.ledger.write(content);
  }
}

async function realpathOr(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}
