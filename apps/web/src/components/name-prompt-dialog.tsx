import { Button } from '@suptron/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';
import { Label } from '@suptron/ui/components/label';
import { useId, useState } from 'react';
import { NameField, nameError } from './name-field';

export interface NamePromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Returns an error message to show at the field, or null on success. */
  onSubmit(name: string): Promise<string | null>;
  onCancel(): void;
}

/** Asks for a basename (Duplicate, New Assembly); server-side refusals land at the field. */
export function NamePromptDialog({ open, onCancel, ...rest }: NamePromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        {/* Remounting on open resets the draft without an effect. */}
        {open && <NamePromptForm key={rest.initialValue ?? ''} onCancel={onCancel} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function NamePromptForm({
  title,
  description,
  initialValue = '',
  confirmLabel = 'Create',
  onSubmit,
  onCancel,
}: Omit<NamePromptDialogProps, 'open'>) {
  const [value, setValue] = useState(initialValue);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const invalid = nameError(value) !== null;
  const submit = async () => {
    if (invalid || busy) return;
    setBusy(true);
    const error = await onSubmit(value);
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Name</Label>
        <NameField
          id={id}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setServerError(null);
          }}
          error={serverError}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={invalid || busy}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
