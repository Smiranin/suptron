import { summarizeCheck, type TranscriptEntry } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  MessageCircleQuestion,
  StickyNote,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '../../../../components/markdown';

const ROW = 'px-3 py-2 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_48px]';

function summarizeInput(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const key = ['command', 'file_path', 'path', 'pattern', 'query', 'url'].find(
      (k) => typeof record[k] === 'string',
    );
    if (key) return String(record[key]);
    return Object.entries(record)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ');
  }
  return String(input);
}

function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TextEntry({ entry }: { entry: Extract<TranscriptEntry, { kind: 'text' }> }) {
  return (
    <div className={ROW} data-entry="text">
      <Markdown text={entry.text} />
    </div>
  );
}

export function ToolCallEntry({
  entry,
}: {
  entry: Extract<TranscriptEntry, { kind: 'tool_call' }>;
}) {
  const [open, setOpen] = useState(false);
  const isError = entry.result?.isError === true;
  const summary = summarizeInput(entry.input);
  return (
    <div
      className={cn(ROW, 'py-1')}
      data-entry="tool_call"
      data-error={isError ? 'true' : undefined}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 text-left',
          isError ? 'text-destructive' : 'text-muted-foreground',
        )}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span className="font-mono text-xs font-semibold">{entry.name}</span>
        <span className="truncate font-mono text-xs">{summary}</span>
        {entry.result === undefined && <span className="text-xs italic">running…</span>}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-2 pl-5">
          <pre
            className="bg-muted overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap"
            data-testid="tool-input"
          >
            {pretty(entry.input)}
          </pre>
          {entry.result && (
            <pre
              className={cn(
                'overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap',
                isError ? 'bg-destructive/10 text-destructive' : 'bg-muted',
              )}
              data-testid="tool-result"
            >
              {entry.result.output || '(no output)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function CheckEntry({ entry }: { entry: Extract<TranscriptEntry, { kind: 'check' }> }) {
  return (
    <div
      className={cn(ROW, 'flex flex-col gap-1')}
      data-entry="check"
      data-holds={entry.holds ? 'true' : 'false'}
    >
      <div
        className={cn(
          'flex items-center gap-2 font-medium',
          entry.holds ? 'text-success' : 'text-destructive',
        )}
      >
        {entry.holds ? (
          <CheckCircle2 aria-label="Passed" className="size-4" />
        ) : (
          <XCircle aria-label="Failed" className="size-4" />
        )}
        <span>Check: {summarizeCheck(entry.check)}</span>
      </div>
      {!entry.holds && entry.detail && (
        <pre className="bg-muted overflow-x-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export function QuestionEntry({
  entry,
}: {
  entry: Extract<TranscriptEntry, { kind: 'question' }>;
}) {
  return (
    <div className={cn(ROW, 'flex flex-col gap-2')} data-entry="question">
      {entry.questions.map((q) => (
        <div key={q.question} className="flex flex-col gap-1">
          <div className="text-warning flex items-center gap-2 font-medium">
            <MessageCircleQuestion aria-hidden="true" className="size-4" />
            {q.header}
          </div>
          <p className="m-0">{q.question}</p>
          {q.options.length > 0 && (
            <ul className="text-muted-foreground m-0 list-disc pl-5 text-xs">
              {q.options.map((o) => (
                <li key={o.label}>
                  {o.label}
                  {o.description ? ` — ${o.description}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function AnswerEntry({ entry }: { entry: Extract<TranscriptEntry, { kind: 'answer' }> }) {
  return (
    <div className={cn(ROW, 'flex flex-col gap-1')} data-entry="answer">
      <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Your answer
      </div>
      {Object.entries(entry.answers).map(([question, answer]) => (
        <p key={question} className="m-0">
          <span className="text-muted-foreground">{question}</span> {answer}
        </p>
      ))}
    </div>
  );
}

export function NoteEntry({ entry }: { entry: Extract<TranscriptEntry, { kind: 'note' }> }) {
  return (
    <div className={cn(ROW, 'bg-warning/10 flex items-start gap-2')} data-entry="note">
      <StickyNote aria-hidden="true" className="text-warning mt-0.5 size-4 shrink-0" />
      <div>
        <div className="text-warning text-xs font-semibold tracking-wider uppercase">Your note</div>
        <p className="m-0 whitespace-pre-wrap">{entry.text}</p>
      </div>
    </div>
  );
}

export function ErrorEntry({ entry }: { entry: Extract<TranscriptEntry, { kind: 'error' }> }) {
  return (
    <div className={cn(ROW, 'text-destructive flex items-start gap-2')} data-entry="error">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <pre className="m-0 font-mono text-xs whitespace-pre-wrap">{entry.message}</pre>
    </div>
  );
}

export function Entry({ entry }: { entry: TranscriptEntry }) {
  switch (entry.kind) {
    case 'text':
      return <TextEntry entry={entry} />;
    case 'tool_call':
      return <ToolCallEntry entry={entry} />;
    case 'check':
      return <CheckEntry entry={entry} />;
    case 'question':
      return <QuestionEntry entry={entry} />;
    case 'answer':
      return <AnswerEntry entry={entry} />;
    case 'note':
      return <NoteEntry entry={entry} />;
    case 'error':
      return <ErrorEntry entry={entry} />;
  }
}
