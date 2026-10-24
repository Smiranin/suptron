import { summarizeCheck } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Label } from '@suptron/ui/components/label';
import { toast } from '@suptron/ui/components/sonner';
import { Textarea } from '@suptron/ui/components/textarea';
import { CircleStop, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { missionsApi } from '../../../api/missions';
import { Markdown } from '../../../components/markdown';
import { CAUSE_LABELS } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';

/** Cause, explanation, failed Checks, a note, Retry and Stop (FR-28, FR-29). */
export function AttentionTab({ state, onStop }: { state: ReadyMissionState; onStop: () => void }) {
  const attention = state.attention;
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  if (!attention) return null;
  const retry = async () => {
    setSending(true);
    try {
      await missionsApi.retry(state.summary.id, note.trim());
    } catch (error) {
      toast.error(`Could not retry: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="flex flex-col gap-4 p-4 text-sm" data-testid="attention-tab">
      <div>
        <div className="text-destructive text-xs font-bold tracking-wider uppercase">
          {CAUSE_LABELS[attention.cause]}
        </div>
        <div className="text-muted-foreground">on {attention.slot}</div>
      </div>
      <section>
        <h3 className="m-0 mb-1 text-xs font-bold tracking-wider uppercase">What the Core says</h3>
        <Markdown text={attention.reason} />
      </section>
      {attention.failedChecks.length > 0 && (
        <section>
          <h3 className="m-0 mb-1 text-xs font-bold tracking-wider uppercase">Failed Checks</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {attention.failedChecks.map((result, index) => (
              <li key={index} className="flex flex-col gap-1" data-testid="failed-check">
                <div className="text-destructive flex items-center gap-2 font-medium">
                  <XCircle aria-hidden="true" className="size-4" /> {summarizeCheck(result.check)}
                </div>
                {result.detail && (
                  <pre className="bg-muted m-0 overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
                    {result.detail}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor="retry-note">Note to the agent (optional)</Label>
        <Textarea
          id="retry-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What should the next Attempt do differently?"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void retry()} disabled={sending}>
          <RotateCcw aria-hidden="true" /> {sending ? 'Retrying…' : 'Retry'}
        </Button>
        <Button type="button" variant="destructive" onClick={onStop}>
          <CircleStop aria-hidden="true" /> Stop
        </Button>
      </div>
    </div>
  );
}
