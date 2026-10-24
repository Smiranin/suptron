import { executionId, sectionTitle, type TranscriptSection } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { cn } from '@suptron/ui/lib/utils';
import { ArrowDownToLine, ChevronRight } from 'lucide-react';
import type { Dispatch } from 'react';
import { isCurrentSection, sectionsOf } from '../model/selectors';
import type { MissionPageAction, ReadyMissionState } from '../model/types';
import { Entry } from './entries';
import { useAutoScroll } from './useAutoScroll';

function ExecutionSection({
  section,
  open,
  current,
  onToggle,
}: {
  section: TranscriptSection;
  open: boolean;
  current: boolean;
  onToggle: () => void;
}) {
  const title = sectionTitle(section.execution);
  return (
    <section
      className="border-border border-b last:border-b-0"
      data-testid="execution-section"
      data-open={open ? 'true' : 'false'}
      data-current={current ? 'true' : undefined}
    >
      <button
        type="button"
        className={cn(
          'bg-muted/60 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold tracking-wider uppercase',
          current && 'text-primary',
        )}
        onClick={onToggle}
        aria-expanded={open}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        {title}
        {current && (
          <span className="text-muted-foreground ml-auto font-normal normal-case">current</span>
        )}
      </button>
      {open && (
        <div className="flex flex-col">
          {section.dropped > 0 && (
            <p
              className="text-muted-foreground m-0 px-3 py-2 text-xs italic"
              data-testid="dropped-note"
            >
              {section.dropped} earlier entries were dropped
            </p>
          )}
          {section.entries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
          {section.entries.length === 0 && section.dropped === 0 && (
            <p className="text-muted-foreground m-0 px-3 py-2 text-xs italic">Nothing yet.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** One Slot's transcript: sections per execution, the current one open, earlier ones collapsed (FR-20 to FR-23). */
export function TranscriptView({
  state,
  slot,
  dispatch,
}: {
  state: ReadyMissionState;
  slot: string;
  dispatch: Dispatch<MissionPageAction>;
}) {
  const sections = sectionsOf(state, slot);
  const lastEntryId = sections.at(-1)?.entries.at(-1)?.id ?? null;
  const { ref, following, follow } = useAutoScroll(`${sections.length}:${lastEntryId}`);
  if (state.transcriptLost) {
    return (
      <p className="text-muted-foreground p-4 text-sm" data-testid="transcript-lost">
        The transcript was lost when the application restarted. The header and the Slots show what
        is still known.
      </p>
    );
  }
  if (sections.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">This Slot has not run yet.</p>;
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto" data-testid="transcript-scroll">
        {sections.map((section) => {
          const id = executionId(section.execution);
          const current = isCurrentSection(state, section);
          return (
            <ExecutionSection
              key={id}
              section={section}
              current={current}
              open={current || state.panel.expanded.has(id)}
              onToggle={() => dispatch({ type: 'toggleSection', executionId: id })}
            />
          );
        })}
      </div>
      {!following && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3 shadow"
          onClick={follow}
        >
          <ArrowDownToLine aria-hidden="true" /> Follow
        </Button>
      )}
    </div>
  );
}
