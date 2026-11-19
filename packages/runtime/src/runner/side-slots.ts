import type { MissionSnapshot, ResolvedSideSlot } from '../config/snapshot.js';
import { addCost, ZERO_COST, type Cost } from '../domain/cost.js';
import { readHandoverStatus, withHandover } from '../domain/handover.js';
import type { SideSlotRecord, SideSlotStatus } from '../domain/mission.js';
import type { AgentHandle, Engine } from '../engine/index.js';
import type { MissionEventInput } from '../events/mission-event.js';
import { buildGuard, type Workspace } from '../workspace/workspace.js';
import { buildContextBundle } from './context.js';
import { SubPilotLog, reportedEvent, subAgentSpecs } from './pilot-events.js';
import { MissionStateError, type MissionMeta } from './runner.js';
import { composeSideSlotPrompt } from './side-slot-prompt.js';
import { missionFolder } from './task.js';

export interface SideSlotsDeps {
  engine: Engine;
  workspace: Workspace;
  meta: MissionMeta;
  /** The Runner's Slot Outputs, read when a Side Slot starts. */
  slotOutputs: ReadonlyMap<string, string>;
  emit: (event: MissionEventInput) => void;
  /** Adds a Side Slot's cost to the Mission's and returns the Mission's new total. */
  addMissionCost: (cost: Cost) => Cost;
}

/** The note of a Side Slot the Commander stopped. */
export const STOPPED_BY_COMMANDER = 'Stopped by the Commander';
/** The note of a Side Slot a Stop of the Mission interrupted. */
export const STOPPED_WITH_MISSION = 'The Mission was stopped';

type Ending = { status: Extract<SideSlotStatus, 'done' | 'failed' | 'interrupted'>; note: string };

/**
 * The Side Slots of one Mission. Each time a Slot is done its Side Slots run one after another
 * in a chain of their own, beside the ordered list: one Attempt each, no Check, no Core. A Side
 * Slot is done when its Pilot hands over `done` and every required Sub-pilot returned; anything
 * else is failed, and the next one starts all the same. Nothing here touches the Mission's course.
 */
export class SideSlots {
  private readonly sides = new Map<string, { side: ResolvedSideSlot; parent: string }>();
  private readonly parents = new Map<string, ResolvedSideSlot[]>();
  private readonly records = new Map<string, SideSlotRecord>();
  /** The chain of each parent Slot that has one running. */
  private readonly chains = new Map<string, Promise<void>>();
  private readonly handles = new Map<string, AgentHandle>();
  private readonly stoppedByCommander = new Set<string>();
  /** Set by a Stop of the Mission: nothing starts any more. */
  private closed = false;

  constructor(
    snapshot: MissionSnapshot,
    private readonly deps: SideSlotsDeps,
  ) {
    for (const slot of snapshot.assembly.slots) {
      this.parents.set(slot.name, slot.sideSlots);
      for (const side of slot.sideSlots) this.sides.set(side.name, { side, parent: slot.name });
    }
  }

  /**
   * Starts the Side Slots of a Slot that is done, in the order listed. When the chain of an
   * earlier time still runs, this start is left out and said so.
   */
  start(parent: string): void {
    const list = this.parents.get(parent) ?? [];
    if (list.length === 0 || this.closed) return;
    if (this.chains.has(parent)) {
      this.deps.emit({ type: 'side_slots.left_out', missionId: this.deps.meta.id, slot: parent });
      return;
    }
    for (const side of list) this.enqueue(side, parent);
    this.chain(parent, list);
  }

  /** Stops one running Side Slot; it counts as failed and the next in its chain starts. */
  async stopOne(name: string): Promise<void> {
    this.require(name);
    const handle = this.handles.get(name);
    if (!handle) {
      throw new MissionStateError(
        'side_slot_not_running',
        `The Side Slot "${name}" is not running`,
      );
    }
    this.stoppedByCommander.add(name);
    await handle.interrupt();
  }

  /** True when the Side Slot has ended failed or interrupted and the Mission is not stopped. */
  canRunAgain(name: string): boolean {
    const status = this.records.get(name)?.status;
    return !this.closed && (status === 'failed' || status === 'interrupted');
  }

  /** Runs a failed or interrupted Side Slot once more, at the end of its parent's chain. */
  runAgain(name: string): void {
    const entry = this.require(name);
    if (!this.canRunAgain(name)) {
      throw new MissionStateError(
        'side_slot_not_runnable',
        `The Side Slot "${name}" can be run again only when it failed or was interrupted`,
      );
    }
    this.enqueue(entry.side, entry.parent);
    this.chain(entry.parent, [entry.side]);
  }

  /** Interrupts every running Side Slot and every waiting one; nothing starts afterwards. */
  async stopAll(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.handles.values()].map((handle) => handle.interrupt()));
    await this.idle();
  }

  /** Resolves when no chain runs. */
  async idle(): Promise<void> {
    while (this.chains.size > 0) await Promise.all(this.chains.values());
  }

  /** True while a chain runs. */
  busy(): boolean {
    return this.chains.size > 0;
  }

  /** The Side Slots started so far, in Assembly order. */
  list(): SideSlotRecord[] {
    return [...this.sides.keys()].flatMap((name) => {
      const record = this.records.get(name);
      return record ? [structuredClone(record)] : [];
    });
  }

  /** Takes over the records of a Runner of this Mission that was stopped or interrupted. */
  restore(records: readonly SideSlotRecord[]): void {
    for (const record of records) {
      if (this.sides.has(record.name)) this.records.set(record.name, structuredClone(record));
    }
  }

  /** The Side Slot of this name with its parent; `not_found` when the Mission has none. */
  private require(name: string): { side: ResolvedSideSlot; parent: string } {
    const entry = this.sides.get(name);
    if (!entry) throw new MissionStateError('not_found', `Unknown Side Slot ${name}`);
    return entry;
  }

  /** Puts a Side Slot in its chain as waiting. */
  private enqueue(side: ResolvedSideSlot, parent: string): void {
    const previous = this.records.get(side.name);
    const { note: _dropped, ...kept } = previous ?? {
      name: side.name,
      parent,
      unit: side.unit,
      starts: 0,
      cost: ZERO_COST,
    };
    void _dropped;
    this.records.set(side.name, { ...kept, status: 'waiting' });
    this.deps.emit({
      type: 'side_slot.waiting',
      missionId: this.deps.meta.id,
      slot: side.name,
      parent,
    });
  }

  /** Runs `list` after whatever the parent's chain still has to run. */
  private chain(parent: string, list: readonly ResolvedSideSlot[]): void {
    const before = this.chains.get(parent) ?? Promise.resolve();
    const chain = before.then(async () => {
      for (const side of list) await this.runOne(side, parent);
    });
    this.chains.set(parent, chain);
    void chain.then(() => {
      if (this.chains.get(parent) === chain) this.chains.delete(parent);
    });
  }

  /** One run of a Side Slot, from its start to its end; never rejects. */
  private async runOne(side: ResolvedSideSlot, parent: string): Promise<void> {
    const record = this.records.get(side.name)!;
    if (this.closed) {
      this.end(record, { status: 'interrupted', note: STOPPED_WITH_MISSION });
      return;
    }
    record.status = 'running';
    record.starts += 1;
    delete record.note;
    this.deps.emit({
      type: 'side_slot.started',
      missionId: this.deps.meta.id,
      slot: side.name,
      parent,
      attempt: record.starts,
    });
    let ending: Ending;
    try {
      ending = await this.drive(side, parent, record);
    } catch (error) {
      ending = { status: 'failed', note: `The Side Slot could not run: ${errorMessage(error)}` };
    }
    if (this.stoppedByCommander.delete(side.name)) {
      ending = { status: 'failed', note: STOPPED_BY_COMMANDER };
    } else if (this.closed && ending.status !== 'done') {
      ending = { status: 'interrupted', note: STOPPED_WITH_MISSION };
    }
    this.end(record, ending);
  }

  /** Drives the Side Slot's Pilot through its one turn and reads how it ended. */
  private async drive(
    side: ResolvedSideSlot,
    parent: string,
    record: SideSlotRecord,
  ): Promise<Ending> {
    const { meta, workspace } = this.deps;
    const missionDir = missionFolder(meta.configHome, meta.id);
    const bundle = buildContextBundle(
      side,
      { ...meta, workspace: workspace.fragment, missionFolder: missionDir },
      this.deps.slotOutputs,
    );
    const handle = this.deps.engine.createAgent({
      role: 'pilot',
      label: side.name,
      model: side.model,
      systemPrompt: { rules: side.rules, instructions: withHandover(side.instructions) },
      cwd: workspace.cwd,
      additionalDirectories: [meta.taskPath, missionDir],
      allowQuestions: false,
      ...(side.subPilots.length > 0 && { subAgents: subAgentSpecs(side.subPilots) }),
      guard: buildGuard(workspace, {
        taskPath: meta.taskPath,
        taskDocuments: meta.taskDocuments,
        configHome: meta.configHome,
        missionFolder: missionDir,
        outerFolders: meta.outerFolders ?? [],
      }),
    });
    this.handles.set(side.name, handle);
    const log = new SubPilotLog(side.subPilots);
    const target = { missionId: meta.id, slot: side.name, attempt: record.starts };
    let output: string | null = null;
    let failure: string | null = null;
    try {
      handle.send(composeSideSlotPrompt(bundle, parent));
      for await (const event of handle.events()) {
        const reported = reportedEvent(event, target, log);
        if (reported) {
          this.deps.emit(reported);
          continue;
        }
        if (event.type === 'error') {
          failure = event.message;
          this.deps.emit({
            type: 'agent.error',
            missionId: meta.id,
            slot: side.name,
            payload: { type: 'error', message: event.message },
          });
        } else if (event.type === 'question') {
          event.dismiss();
        } else if (event.type === 'usage_limit') {
          failure = `The usage limit refused the Side Slot until ${event.resetsAt}; run it again after that`;
          break;
        } else if (event.type === 'result') {
          output = event.output;
          this.addCost(record, event.cost);
        }
      }
    } finally {
      this.handles.delete(side.name);
      await handle.close().catch(() => undefined);
    }
    if (failure !== null) return { status: 'failed', note: failure };
    if (output === null || output.trim() === '') {
      return { status: 'failed', note: 'The Pilot ended without any output' };
    }
    const missing = log.missingRequired();
    if (missing.length > 0) {
      const names = missing.map((unit) => `"${unit}"`).join(', ');
      return {
        status: 'failed',
        note: `The required Sub-pilot ${names} did not return.\n\n${output.trim()}`,
      };
    }
    return {
      status: readHandoverStatus(output) === 'done' ? 'done' : 'failed',
      note: output.trim(),
    };
  }

  private end(record: SideSlotRecord, { status, note }: Ending): void {
    record.status = status;
    record.note = note;
    this.deps.emit({
      type: 'side_slot.ended',
      missionId: this.deps.meta.id,
      slot: record.name,
      parent: record.parent,
      attempt: record.starts,
      status,
      note,
    });
  }

  private addCost(record: SideSlotRecord, cost: Cost): void {
    record.cost = addCost(record.cost, cost);
    const missionTotal = this.deps.addMissionCost(cost);
    this.deps.emit({
      type: 'cost.updated',
      missionId: this.deps.meta.id,
      slot: record.name,
      cost: record.cost,
      missionTotal,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
