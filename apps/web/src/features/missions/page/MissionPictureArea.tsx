import type { AssemblyFile } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import { MonitorOff } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { UniverseFailure } from '../../universe';
import type { PanelSelection } from '../model/types';
import type { MissionPicture } from '../picture';
import { MissionClock } from './MissionClock';
import { setPictureChoice, usePictureChoice, type PictureChoice } from './picture-choice';
import {
  UniverseBoundary,
  UniverseModuleLoadError,
  type UniverseBoundaryFailure,
} from './UniverseBoundary';

/** Every reason the Universe can fail for, from inside the module or from the page. */
type PictureFailure = UniverseFailure | UniverseBoundaryFailure;

/** One short reason per failure, for the line over the clock. */
const FAILURE_REASONS: Record<PictureFailure, string> = {
  'no-webgl2': 'this browser has no WebGL 2',
  'model-load': 'a model of the picture did not load',
  'context-lost': 'the browser took its drawing context away',
  'module-load': 'its code did not download',
  crashed: 'it stopped with an error',
};

const CHOICES: { choice: PictureChoice; label: string }[] = [
  { choice: 'universe', label: 'Universe' },
  { choice: 'clock', label: 'Clock' },
];

/**
 * A fresh lazily loaded Universe. React keeps the failed download of a lazy component for good,
 * so trying again after such a failure takes a new one.
 */
function lazyUniverse() {
  return lazy(() =>
    import('../../universe').catch((error: unknown) => {
      throw new UniverseModuleLoadError(error);
    }),
  );
}

export interface MissionPictureAreaProps {
  /** For the clock's geometry only. */
  assembly: AssemblyFile;
  picture: MissionPicture;
  selection: PanelSelection;
  onSelect(selection: PanelSelection): void;
}

/**
 * The area of the Mission page that shows the Mission: the Universe or the clock, as the Commander
 * chose with the switch. The Universe loads only when shown; any failure of it ends at the clock
 * with one line saying why, until the Commander uses the switch again.
 */
export function MissionPictureArea({
  assembly,
  picture,
  selection,
  onSelect,
}: MissionPictureAreaProps) {
  const choice = usePictureChoice();
  const [failure, setFailure] = useState<PictureFailure | null>(null);
  const [LazyUniverse, setLazyUniverse] = useState(lazyUniverse);
  const [attempt, setAttempt] = useState(0);
  const showUniverse = choice === 'universe' && failure === null;

  /** Shows `next` and remembers it; after a failure, the Universe is tried again from scratch. */
  const choose = (next: PictureChoice) => {
    if (failure !== null) {
      setFailure(null);
      setLazyUniverse(() => lazyUniverse());
      setAttempt((n) => n + 1);
    }
    setPictureChoice(next);
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2" data-testid="mission-picture">
      {failure !== null && (
        <div
          role="status"
          data-banner="universe-failure"
          className="border-border bg-muted text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        >
          <MonitorOff aria-hidden="true" className="size-4 shrink-0" />
          The Universe cannot be drawn: {FAILURE_REASONS[failure]}. Showing the clock.
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {showUniverse ? (
          <div className="border-border h-full min-h-[420px] overflow-hidden rounded-xl border">
            <UniverseBoundary key={attempt} onFailure={setFailure}>
              <Suspense fallback={<UniverseLoading />}>
                <LazyUniverse
                  picture={picture}
                  selection={selection}
                  onSelect={onSelect}
                  onFailure={setFailure}
                />
              </Suspense>
            </UniverseBoundary>
          </div>
        ) : (
          <MissionClock
            assembly={assembly}
            picture={picture}
            selection={selection}
            onSelect={onSelect}
          />
        )}
        <div
          role="group"
          aria-label="Picture"
          className="border-border bg-background/80 absolute top-3 left-3 flex rounded-md border p-0.5 text-xs shadow-xs backdrop-blur-sm"
        >
          {CHOICES.map(({ choice: option, label }) => (
            <button
              key={option}
              type="button"
              aria-pressed={choice === option}
              onClick={() => choose(option)}
              className={cn(
                'rounded px-2.5 py-1 font-medium',
                choice === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The dark area with a note while the Universe's code downloads; not the clock, so nothing jumps. */
function UniverseLoading() {
  return (
    <div
      className="flex size-full items-center justify-center bg-neutral-950 text-sm text-neutral-400"
      data-testid="universe-loading"
    >
      Loading the Universe…
    </div>
  );
}
