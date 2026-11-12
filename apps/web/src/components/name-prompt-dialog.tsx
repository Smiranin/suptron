import { slugify } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';
import { useId, useState } from 'react';
import { TitleIdFields, titleIdProblems, type TitleId } from './title-id-fields';

export interface NamePromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** The title the field starts with; the ID is derived from it. */
  initialTitle?: string;
  /** IDs already used next to the new item, checked while typing. */
  takenNames?: readonly string[];
  confirmLabel?: string;
  /** Returns an error message to show at the ID, or null on success. */
  onSubmit(value: TitleId): Promise<string | null>;
  onCancel(): void;
}

/** Asks for the Title and derived ID of a new item (Duplicate, New Assembly); server refusals land at the ID. */
export function NamePromptDialog({ open, onCancel, ...rest }: NamePromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        {/* Remounting on open resets the draft without an effect. */}
        {open && <NamePromptForm key={rest.initialTitle ?? ''} onCancel={onCancel} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function NamePromptForm({
  title,
  description,
  initialTitle = '',
  takenNames = [],
  confirmLabel = 'Create',
  onSubmit,
  onCancel,
}: Omit<NamePromptDialogProps, 'open'>) {
  const [value, setValue] = useState<TitleId>({
    title: initialTitle,
    name: slugify(initialTitle),
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const problems = titleIdProblems(value, { taken: takenNames });
  const submit = async () => {
    setSubmitted(true);
    if (problems.title || problems.id || busy) return;
    setBusy(true);
    const error = await onSubmit({ title: value.title.trim(), name: value.name });
    setBusy(false);
    setServerError(error);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <TitleIdFields
        id={id}
        value={value}
        onChange={(next) => {
          setValue(next);
          setServerError(null);
        }}
        taken={takenNames}
        titleError={submitted ? problems.title : null}
        idError={serverError}
        autoFocus
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
