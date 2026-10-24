import type { UnitFile } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { InUseError, NameTakenError, NotFoundError } from '../../api/client';
import { api, useHealth, useInvalidateConfig, useUnit } from '../../api/queries';
import { ActiveMissionsNote } from '../../components/active-missions-note';
import { ConflictDialog } from '../../components/conflict-dialog';
import { DiscardGuard } from '../../components/discard-guard';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { PageContainer, PageHeader, StatePanel } from '../../components/page';
import { SaveBar } from '../../components/save-bar';
import { useSaveFlow } from '../../components/use-save-flow';
import { useSaveShortcut } from '../../lib/keyboard';
import { UnitForm, emptyUnit, useUnitForm } from './UnitForm';

/** Loads a Unit (or starts a new one) and wires the shared editing behaviour (SPEC FR-2 to FR-5, FR-8). */
export function UnitEditorPage({ name }: { name: string | null }) {
  const isNew = name === null;
  const loaded = useUnit(name ?? '', !isNew);
  if (!isNew && loaded.isPending) return <PageContainer>Loading…</PageContainer>;
  if (!isNew && loaded.isError) {
    return (
      <StatePanel
        label={loaded.error instanceof NotFoundError ? '404' : 'Error'}
        title={
          loaded.error instanceof NotFoundError ? 'No such Unit' : 'The Unit could not be read'
        }
        description={loaded.error.message}
        action={
          <Button asChild>
            <Link to="/hangar">Back to the Hangar</Link>
          </Button>
        }
      />
    );
  }
  if (!isNew && !loaded.data?.unit) {
    return (
      <StatePanel
        title={`${name} is not a valid Unit file`}
        description={loaded.data?.issues.map((i) => i.message).join('; ')}
        action={<InvalidFileActions name={name!} />}
      />
    );
  }
  return (
    <UnitEditor
      key={name ?? 'new'}
      name={name}
      initial={loaded.data?.unit ?? emptyUnit()}
      etag={loaded.data?.etag ?? null}
      activeMissions={loaded.data?.usage.activeMissions ?? 0}
    />
  );
}

function InvalidFileActions({ name }: { name: string }) {
  const health = useHealth();
  return (
    <>
      <OpenInEditorButton
        path={health.data ? `${health.data.configHome}/hangar/${name}.md` : null}
      />
      <Button asChild variant="outline">
        <Link to="/hangar">Back to the Hangar</Link>
      </Button>
    </>
  );
}

function UnitEditor({
  name,
  initial,
  etag: initialEtag,
  activeMissions,
}: {
  name: string | null;
  initial: UnitFile;
  etag: string | null;
  activeMissions: number;
}) {
  const navigate = useNavigate();
  const health = useHealth();
  const invalidate = useInvalidateConfig();
  const form = useUnitForm(initial);
  const [etag, setEtag] = useState<string | null>(initialEtag);
  // Kept with the name it was reported for, so editing the name clears it without an effect.
  const [nameError, setNameError] = useState<{ name: string; message: string } | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const fileName = name ?? form.watch('name');

  const flow = useSaveFlow<UnitFile>({
    etag,
    save: useCallback(
      async (doc, mode) => {
        const result = await api.putUnit(name ?? doc.name, doc, mode);
        return { data: result.unit, etag: result.etag };
      },
      [name],
    ),
    onSaved: useCallback(
      (result) => {
        setEtag(result.etag);
        setNameError(null);
        form.reset(result.data);
        void invalidate();
        toast.success(`Saved ${result.data.name}`);
        if (result.data.name !== name) setRedirectTo(result.data.name);
      },
      [form, invalidate, name],
    ),
    onReload: useCallback(
      (current) => {
        setEtag(current.etag);
        form.reset(current.data);
      },
      [form],
    ),
    onError: useCallback(
      (error: Error) => {
        if (error instanceof NameTakenError)
          setNameError({ name: form.getValues('name'), message: 'That name is already taken' });
        else if (error instanceof InUseError) {
          setNameError({
            name: form.getValues('name'),
            message: `Renaming is refused: used by ${error.usedBy.map((u) => `${u.project} / ${u.assembly}`).join(', ')}`,
          });
        } else toast.error(error.message);
      },
      [form],
    ),
  });

  const { isDirty, isValid } = form.formState;
  const watchedName = form.watch('name');
  // Navigate to the new name only once the form is clean, so the discard guard stays quiet.
  useEffect(() => {
    if (redirectTo === null || isDirty) return;
    void navigate({ to: '/hangar/$name', params: { name: redirectTo }, replace: true });
  }, [redirectTo, isDirty, navigate]);
  const canSave = isDirty && isValid && !flow.saving;
  const disabledReason = !isDirty
    ? 'No changes to save'
    : !isValid
      ? 'Fix the highlighted fields first'
      : undefined;
  const save = useCallback(() => {
    void form.handleSubmit((doc) => flow.save(doc))();
  }, [form, flow]);
  useSaveShortcut(save, canSave);

  return (
    <PageContainer>
      <PageHeader
        title={name ?? 'New Unit'}
        action={
          <SaveBar
            dirty={isDirty}
            canSave={canSave}
            saving={flow.saving}
            disabledReason={disabledReason}
            onSave={save}
          >
            <Button asChild variant="ghost">
              <Link to="/hangar" aria-label="Back to the Hangar">
                <ArrowLeft aria-hidden="true" /> Hangar
              </Link>
            </Button>
            <OpenInEditorButton
              path={health.data && name ? `${health.data.configHome}/hangar/${fileName}.md` : null}
              disabled={!name}
            />
          </SaveBar>
        }
      />
      <ActiveMissionsNote count={activeMissions} subject="Unit" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="mt-4"
      >
        <UnitForm
          form={form}
          nameError={nameError && nameError.name === watchedName ? nameError.message : null}
        />
      </form>
      <DiscardGuard when={isDirty} />
      <ConflictDialog
        open={flow.conflict}
        onReload={flow.reload}
        onOverwrite={() => void flow.overwrite()}
        onCancel={flow.cancelConflict}
      />
    </PageContainer>
  );
}
