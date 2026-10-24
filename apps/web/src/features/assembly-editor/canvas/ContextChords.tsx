import type { AssemblyFile } from '@suptron/runtime/browser';
import { contextChords, type ClockLayout } from '../model/layout';

/** Dashed chords from each earlier Slot whose output the selected Slot reads (FR-25). */
export function ContextChords({
  layout,
  doc,
  selected,
}: {
  layout: ClockLayout;
  doc: AssemblyFile;
  selected: string | null;
}) {
  if (!selected) return null;
  return (
    <g data-testid="context-chords">
      {contextChords(layout, doc, selected).map((chord) => (
        <path
          key={`${chord.from}-${chord.to}`}
          d={chord.path}
          data-testid="context-chord"
          data-from={chord.from}
          data-to={chord.to}
          className="fill-none stroke-primary"
          strokeWidth={2}
          strokeDasharray="6 5"
          markerEnd="url(#clock-arrow)"
        />
      ))}
    </g>
  );
}
