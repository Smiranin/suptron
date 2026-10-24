import { Button } from '@suptron/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@suptron/ui/components/tabs';
import { cn } from '@suptron/ui/lib/utils';
import { PanelRightClose, PanelRightOpen, Pin } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MissionPageAction, PanelTab, ReadyMissionState } from '../model/types';
import { AttentionTab } from './AttentionTab';
import { MissionLevelView } from './MissionLevelView';
import { QuestionTab } from './QuestionTab';
import { TranscriptView } from './TranscriptView';

const STORAGE_KEY = 'suptron.sidePanel';
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 420;

interface PanelPrefs {
  width: number;
  collapsed: boolean;
}

function readPrefs(): PanelPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
      return {
        width:
          typeof parsed.width === 'number'
            ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width))
            : DEFAULT_WIDTH,
        collapsed: parsed.collapsed === true,
      };
    }
  } catch {
    // storage unavailable: defaults
  }
  return { width: DEFAULT_WIDTH, collapsed: false };
}

function writePrefs(prefs: PanelPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // a convenience only
  }
}

export interface SidePanelProps {
  state: ReadyMissionState;
  dispatch: Dispatch<MissionPageAction>;
  onStop: () => void;
}

/** Right side, resizable, collapsible: one Slot's transcript or the Mission-level view, plus Question / Attention (FR-19). */
export function SidePanel({ state, dispatch, onStop }: SidePanelProps) {
  const [prefs, setPrefs] = useState<PanelPrefs>(readPrefs);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  useEffect(() => writePrefs(prefs), [prefs]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: prefs.width };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [prefs.width],
  );
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const width = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, current.startWidth - (event.clientX - current.startX)),
    );
    setPrefs((p) => ({ ...p, width }));
  }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const { panel, pendingQuestion, attention } = state;
  const mainLabel = panel.selection.kind === 'slot' ? panel.selection.name : 'Mission';
  const showQuestion = pendingQuestion !== undefined && state.summary.state === 'waiting_for_owner';
  const showAttention = attention !== undefined && state.summary.state === 'needs_attention';
  const tab: PanelTab =
    (panel.tab === 'question' && showQuestion) || (panel.tab === 'attention' && showAttention)
      ? panel.tab
      : 'main';
  const pinned =
    !panel.follow && state.summary.state !== 'completed' && state.summary.state !== 'stopped';

  if (prefs.collapsed) {
    return (
      <div className="flex flex-col" data-testid="side-panel" data-collapsed="true">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Open side panel"
          onClick={() => setPrefs((p) => ({ ...p, collapsed: false }))}
        >
          <PanelRightOpen aria-hidden="true" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 shrink-0" style={{ width: prefs.width }} data-testid="side-panel">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        className="hover:bg-primary/40 w-1.5 shrink-0 cursor-col-resize rounded-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        data-testid="panel-divider"
      />
      <div className="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border">
        <Tabs
          value={tab}
          onValueChange={(value) => dispatch({ type: 'setTab', tab: value as PanelTab })}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-border flex items-center gap-2 border-b px-2 py-1.5">
            <TabsList>
              <TabsTrigger value="main" data-testid="tab-main">
                {mainLabel}
              </TabsTrigger>
              {showQuestion && (
                <TabsTrigger value="question" data-testid="tab-question" className="text-warning">
                  Question
                </TabsTrigger>
              )}
              {showAttention && (
                <TabsTrigger
                  value="attention"
                  data-testid="tab-attention"
                  className="text-destructive"
                >
                  Attention
                </TabsTrigger>
              )}
            </TabsList>
            {pinned && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'backToCurrent' })}
                data-testid="back-to-current"
              >
                <Pin aria-hidden="true" /> Back to current
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto"
              aria-label="Collapse side panel"
              onClick={() => setPrefs((p) => ({ ...p, collapsed: true }))}
            >
              <PanelRightClose aria-hidden="true" />
            </Button>
          </div>
          <TabsContent
            value="main"
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-y-auto',
              tab !== 'main' && 'hidden',
            )}
          >
            {panel.selection.kind === 'slot' ? (
              <TranscriptView state={state} slot={panel.selection.name} dispatch={dispatch} />
            ) : (
              <MissionLevelView state={state} />
            )}
          </TabsContent>
          {showQuestion && (
            <TabsContent value="question" className="min-h-0 flex-1 overflow-y-auto">
              <QuestionTab state={state} />
            </TabsContent>
          )}
          {showAttention && (
            <TabsContent value="attention" className="min-h-0 flex-1 overflow-y-auto">
              <AttentionTab state={state} onStop={onStop} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
