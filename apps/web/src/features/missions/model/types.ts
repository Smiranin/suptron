import type {
  ActivityPhase,
  AssemblyFile,
  ExecutionKey,
  MissionDetail,
  MissionSummary,
  SlotRecord,
  TranscriptSection,
} from '@suptron/runtime/browser';
import type { LiveStatus } from '../live/LiveEvents';

export interface MissionsListState {
  missions: Record<string, MissionSummary>;
  connection: LiveStatus;
  /** False until the first `GET /api/missions` landed. */
  loaded: boolean;
}

export type PanelSelection = { kind: 'slot'; name: string } | { kind: 'mission' };
export type PanelTab = 'main' | 'question' | 'attention';

export interface PanelState {
  selection: PanelSelection;
  /** True: the selection tracks the current Slot. */
  follow: boolean;
  tab: PanelTab;
  /** Execution ids the Commander opened; the current execution is always open. */
  expanded: ReadonlySet<string>;
}

export type SlotVisualState = 'pending' | 'running' | 'done' | 'failed';

export interface LiveActivity {
  slot: string;
  phase: ActivityPhase;
  detail?: string;
  /** Date.now() when this phase began; repeated frames of the same phase keep it. */
  since: number;
}

export interface ReadyMissionState {
  status: 'ready';
  summary: MissionSummary;
  assembly: AssemblyFile;
  slots: Record<string, SlotRecord>;
  /** Assembly order, then `core`. */
  slotOrder: string[];
  sections: TranscriptSection[];
  current: ExecutionKey | null;
  /** What each Slot's last execution came to, from the events seen so far. */
  slotStatus: Record<string, SlotVisualState>;
  transcriptLost: boolean;
  pendingQuestion?: MissionDetail['pendingQuestion'];
  attention?: MissionDetail['attention'];
  result?: MissionDetail['result'];
  /** Looping Slot → Date.now() of the last firing, for the chord animation. */
  loopFiredAt: Record<string, number>;
  /** The last sign of life of the current Slot; dropped by the next transcript entry. */
  activity?: LiveActivity;
  /** Date.now() of the last event of any kind (init counts), for the "no activity" warning. */
  lastEventAt: number;
  seq: number;
  connection: LiveStatus;
  panel: PanelState;
}

export type MissionPageState =
  | { status: 'loading'; connection: LiveStatus }
  | { status: 'absent'; connection: LiveStatus }
  | ReadyMissionState;

export type MissionPageAction =
  | { type: 'init'; detail: MissionDetail; now?: number }
  | { type: 'event'; event: import('@suptron/runtime/browser').MissionEvent; now?: number }
  | { type: 'absent' }
  | { type: 'connection'; status: LiveStatus }
  | { type: 'selectSlot'; name: string }
  | { type: 'selectMission' }
  | { type: 'backToCurrent' }
  | { type: 'setTab'; tab: PanelTab }
  | { type: 'toggleSection'; executionId: string };
