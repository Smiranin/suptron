import type { ProfileFile } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';
import { toast } from '@suptron/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { NameTakenError, ValidationError } from '../../api/client';
import { api, useInvalidateConfig, useProjects } from '../../api/queries';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { titleIdProblems } from '../../components/title-id-fields';
import { ProfileForm, emptyProfile, useProfileForm, usePathStatuses } from './ProfileForm';

/**
 * "New Project": the whole Profile at once, then straight to the Project page.
 *
 * A long form is easy to lose by accident, so a click outside the dialog does nothing, and Escape,
 * the close cross and Cancel ask for confirmation once something has been typed.
 */
export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  // A ref, not state: the form reports dirtiness on every keystroke and the dialog must not re-render for it.
  const dirtyRef = useRef(false);
  const requestClose = () => {
    if (dirtyRef.current) setConfirming(true);
    else onClose();
  };
  const discard = () => {
    setConfirming(false);
    dirtyRef.current = false;
    onClose();
  };
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {open && (
            <NewProjectForm
              onClose={onClose}
              onCancel={requestClose}
              onDirtyChange={(dirty) => {
                dirtyRef.current = dirty;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title="Discard the new Project?"
        description="The form has unsaved changes. Closing it will discard them."
        confirmLabel="Discard"
        destructive
        onConfirm={discard}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function NewProjectForm({
  onClose,
  onCancel,
  onDirtyChange,
}: {
  /** Called after a successful create. */
  onClose: () => void;
  /** Called from the Cancel button; the dialog decides whether to ask first. */
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const form = useProfileForm(emptyProfile());
  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);
  const paths = usePathStatuses();
  const navigate = useNavigate();
  const invalidate = useInvalidateConfig();
  const projects = useProjects();
  const takenNames = projects.data?.map((p) => p.name) ?? [];
  // Kept with the ID it was reported for, so a new title clears it without an effect.
  const [nameError, setNameError] = useState<{ name: string; message: string } | null>(null);
  const watchedName = form.watch('name');
  const [busy, setBusy] = useState(false);

  // Create stays enabled: pressing it reveals every error at once instead of leaving the
  // Commander to guess why a disabled button does nothing.
  const submit = form.handleSubmit(async (profile: ProfileFile) => {
    const { id } = titleIdProblems(
      { title: profile.title ?? '', name: profile.name },
      { taken: takenNames },
    );
    if (id || paths.missing.length > 0 || paths.checking) return;
    setBusy(true);
    try {
      await api.createProject(profile);
      await invalidate();
      toast.success(`Created ${profile.title ?? profile.name}`);
      onClose();
      void navigate({ to: '/projects/$project', params: { project: profile.name } });
    } catch (error) {
      if (error instanceof NameTakenError)
        setNameError({ name: profile.name, message: 'That ID is already taken' });
      else if (error instanceof ValidationError) toast.error(error.message);
      else toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
    >
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
        <DialogDescription>
          The type of place the Project works in, its fields and its Knowledge Sources.
        </DialogDescription>
      </DialogHeader>
      <ProfileForm
        form={form}
        paths={paths}
        nameError={nameError && nameError.name === watchedName ? nameError.message : null}
        takenNames={takenNames}
      />
      {paths.missing.length > 0 && (
        <p className="text-destructive text-sm" role="alert">
          Some paths do not exist; fix them before creating the Project.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Create Project
        </Button>
      </DialogFooter>
    </form>
  );
}
