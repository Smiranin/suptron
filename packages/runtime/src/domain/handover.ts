/**
 * How a Pilot hands its work over: `done` (nothing open), `open` (a result with open points) or
 * `failed` (no result). Plain code reads it; the Core is asked only when it is not `done`.
 */
export type HandoverStatus = 'done' | 'open' | 'failed';

/**
 * Appended to the Instructions of every Pilot, so no Unit has to say anything about the Handover
 * and the prompt preview shows it.
 */
export const HANDOVER_PROMPT = `## Handover

End your final message with this block, after everything else your Instructions ask for:

### Handover
Produced: the files and other results you made or changed, with their paths.
Done: what is finished and how you checked it.
Open: what is not finished, not checked or in doubt; "nothing" when there is none.
Status: done

The Status line is the last line and holds one word. \`done\`: nothing is open. \`open\`: you
hand over a result, and Open lists what is missing. \`failed\`: you could not produce the result,
and Open says why. The Status is about your own job in this Slot, not about the work of another
Slot: a review that is complete is \`done\` whatever it found. Be honest: an \`open\` gets the
points looked at, a \`done\` over open points passes a gap on to the next Slot.`;

/** The Instructions a Pilot receives: the Slot's own, then how to hand over. */
export function withHandover(instructions: string): string {
  return [instructions.trim(), HANDOVER_PROMPT].filter((part) => part !== '').join('\n\n');
}

/** Markdown a Pilot may wrap the Status line in: list markers, emphasis, code, a heading. */
const STATUS_LINE_DECORATION = /[*_`#>]|^\s*-\s+/g;
const STATUS_LINE = /^\s*status\s*:\s*(.*?)[\s.]*$/i;
const STATUSES: readonly string[] = ['done', 'open', 'failed'] satisfies HandoverStatus[];

/**
 * The Status of the last Status line of a Slot Output; null when there is none or it names no
 * single Status (then the Core decides, as it does for `open` and `failed`).
 */
export function readHandoverStatus(output: string): HandoverStatus | null {
  let status: HandoverStatus | null = null;
  let found = false;
  for (const raw of output.split('\n')) {
    const match = STATUS_LINE.exec(raw.replace(STATUS_LINE_DECORATION, ''));
    if (!match) continue;
    found = true;
    const value = match[1]!.toLowerCase();
    status = STATUSES.includes(value) ? (value as HandoverStatus) : null;
  }
  return found ? status : null;
}
