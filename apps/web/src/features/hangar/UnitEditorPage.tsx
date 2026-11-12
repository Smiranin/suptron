import type { UnitFile } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NameTakenError, NotFoundError } from '../../api/client';
import { api, useHealth, useInvalidateConfig, useUnit, useUnits } from '../../api/queries';
import { ActiveMissionsNote } from '../../components/active-missions-note';
import { ConflictDialog } from '../../components/conflict-dialog';
import { DiscardGuard } from '../../components/discard-guard';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { PageContainer, PageHeader, StatePanel } from '../../components/page';
import { SaveBar } from '../../components/save-bar';
import { titleIdProblems } from '../../components/title-id-fields';
import { useSaveFlow } from '../../components/use-save-flow';
import { useSaveShortcut } from '../../lib/keyboard';
import { UnitForm, emptyUnit, unitForForm, useUnitForm } from './UnitForm';

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
      initial={loaded.data?.unit ? unitForForm(loaded.data.unit) : emptyUnit()}
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
  const units = useUnits();
  const takenNames = useMemo(() => units.data?.map((u) => u.name) ?? [], [units.data]);
  const form = useUnitForm(initial);
  const [etag, setEtag] = useState<string | null>(initialEtag);
  // Kept with the ID it was reported for, so a new title clears it without an effect.
  const [nameError, setNameError] = useState<{ name: string; message: string } | null>(null);
  // A new Unit moves to its own URL once saved; an existing one keeps its ID.
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

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
        form.reset(unitForForm(result.data));
        void invalidate();
        toast.success(`Saved ${result.data.title ?? result.data.name}`);
        if (result.data.name !== name) setRedirectTo(result.data.name);
      },
      [form, invalidate, name],
    ),
    onReload: useCallback(
      (current) => {
        setEtag(current.etag);
        form.reset(unitForForm(current.data));
      },
      [form],
    ),
    onError: useCallback(
      (error: Error) => {
        if (error instanceof NameTakenError)
          setNameError({ name: form.getValues('name'), message: 'That ID is already taken' });
        else toast.error(error.message);
      },
      [form],
    ),
  });

  const { isDirty } = form.formState;
  const watchedName = form.watch('name');
  // Navigate to the new name only once the form is clean, so the discard guard stays quiet.
  useEffect(() => {
    if (redirectTo === null || isDirty) return;
    void navigate({ to: '/hangar/$name', params: { name: redirectTo }, replace: true });
  }, [redirectTo, isDirty, navigate]);
  // Save stays enabled on invalid fields: pressing it reveals and focuses them.
  const canSave = isDirty && !flow.saving;
  const disabledReason = !isDirty ? 'No changes to save' : undefined;
  const save = useCallback(() => {
    void form.handleSubmit((doc) => {
      const { id } = titleIdProblems(
        { title: doc.title ?? '', name: doc.name },
        { taken: takenNames, frozen: name !== null },
      );
      if (!id) return flow.save(doc);
    })();
  }, [form, flow, takenNames, name]);
  useSaveShortcut(save, canSave);

  return (
    <PageContainer>
      <PageHeader
        title={name === null ? 'New Unit' : (initial.title ?? name)}
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
              path={health.data && name ? `${health.data.configHome}/hangar/${name}.md` : null}
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
          existing={name !== null}
          takenNames={takenNames}
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
