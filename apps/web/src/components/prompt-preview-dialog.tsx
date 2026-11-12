import { Button } from '@suptron/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/queries';
import type { PromptPreviewRequest } from '../api/types';

const DESCRIPTIONS: Record<PromptPreviewRequest['role'], string> = {
  pilot:
    "What Suptron appends to Claude Code's own system prompt for this Slot's Pilot. The task " +
    'itself is written by the Core when the Slot runs, from the context the Slot is given.',
  core:
    "The Core's whole system prompt, then the instruction that heads each kind of call; the " +
    "call's input follows it as JSON.",
};

/** A button that shows an agent's full prompt, built by the server with the code a Mission uses. */
export function PromptPreviewButton({
  title,
  request,
}: {
  title: string;
  request: PromptPreviewRequest;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScrollText aria-hidden="true" /> View full prompt
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{DESCRIPTIONS[request.role]}</DialogDescription>
          </DialogHeader>
          {open && <PromptPreview request={request} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The prompt parts of an agent, fetched when shown. */
export function PromptPreview({ request }: { request: PromptPreviewRequest }) {
  const preview = useQuery({
    queryKey: ['prompt-preview', request],
    queryFn: () => api.previewPrompt(request),
  });
  if (preview.isPending) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (preview.isError)
    return (
      <p className="text-destructive text-sm" role="alert">
        The prompt could not be built: {preview.error.message}
      </p>
    );
  return (
    <div className="flex flex-col gap-4" data-testid="prompt-preview">
      <PromptBlock heading="System prompt" text={preview.data.system} />
      {Object.entries(preview.data.calls ?? {}).map(([call, text]) => (
        <PromptBlock key={call} heading={`Call: ${call}`} text={text} />
      ))}
    </div>
  );
}

/** Shown verbatim, as the agent reads it: Markdown rendering would hide the exact wording. */
function PromptBlock({ heading, text }: { heading: string; text: string }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <pre className="bg-muted m-0 rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
        {text.trim() === '' ? '(empty)' : text}
      </pre>
    </section>
  );
}
