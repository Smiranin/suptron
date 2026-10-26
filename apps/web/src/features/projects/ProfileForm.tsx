import { WORKSPACE_KINDS, type WorkspaceKind } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { Field } from '../../components/field';
import { NameField } from '../../components/name-field';
import type { PathStatus } from '../../components/path-field';
import { KnowledgeSourcesField } from './KnowledgeSourcesField';
import { emptyWorkspace, type ProfileFormHandle } from './profile-form-model';
import { FolderFields } from './workspace/FolderFields';
import { NoneFields } from './workspace/NoneFields';
import { RepositoryFields } from './workspace/RepositoryFields';
import type { WorkspaceFieldsProps } from './workspace/types';

export { emptyProfile, emptyWorkspace, useProfileForm } from './profile-form-model';
export type { ProfileFormHandle } from './profile-form-model';

/** Tracks the existence checks of the typed paths; a missing path blocks Save (SPEC FR-14, FR-15). */
export function usePathStatuses() {
  const [statuses, setStatuses] = useState<Record<string, PathStatus>>({});
  const set = (key: string, status: PathStatus | null) =>
    setStatuses((current) => {
      const next = { ...current };
      if (status) next[key] = status;
      else delete next[key];
      return next;
    });
  const missing = Object.entries(statuses)
    .filter(([, s]) => !s.checking && !s.exists)
    .map(([k]) => k);
  const checking = Object.values(statuses).some((s) => s.checking);
  return { statuses, set, missing, checking };
}

export interface ProfileFormProps {
  form: ProfileFormHandle;
  paths: ReturnType<typeof usePathStatuses>;
  nameError?: string | null;
  /** An existing Project: changing the kind asks first, because the old kind's fields are dropped (FR-3). */
  existing?: boolean;
}

/** The permitted switch on the kind: which section the form renders (SPEC NFR-1). */
function WorkspaceFields({ kind, ...props }: WorkspaceFieldsProps & { kind: WorkspaceKind }) {
  switch (kind) {
    case 'none':
      return <NoneFields />;
    case 'folder':
      return <FolderFields {...props} />;
    case 'repository':
      return <RepositoryFields {...props} />;
  }
}

/** The Project Profile form, kind first (editors SPEC FR-14 to FR-17; workspaces SPEC FR-3). */
export function ProfileForm({ form, paths, nameError, existing = false }: ProfileFormProps) {
  const id = useId();
  const kind = form.watch('workspace.kind');
  const workspacePath = form.watch('workspace.path');
  const [pendingKind, setPendingKind] = useState<WorkspaceKind | null>(null);

  const applyKind = (next: WorkspaceKind) => {
    paths.set('workspace', null);
    form.setValue('workspace', emptyWorkspace(next), { shouldDirty: true, shouldValidate: true });
  };
  const requestKind = (next: WorkspaceKind) => {
    if (next === kind) return;
    if (existing) setPendingKind(next);
    else applyKind(next);
  };
  const knowledgeBase = kind === 'none' ? undefined : workspacePath?.trim() || undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Field
              id={`${id}-name`}
              label="Name"
              hint="The Project folder name; renaming moves the folder."
            >
              <NameField
                id={`${id}-name`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={nameError}
              />
            </Field>
          )}
        />
        <Field
          id={`${id}-kind`}
          label="Project type"
          hint={WORKSPACE_KINDS.find((k) => k.kind === kind)?.description}
        >
          <Select value={kind} onValueChange={(v) => requestKind(v as WorkspaceKind)}>
            <SelectTrigger id={`${id}-kind`} aria-label="Project type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_KINDS.map((k) => (
                <SelectItem key={k.kind} value={k.kind}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <section aria-label="Workspace" data-testid="workspace-fields" data-kind={kind}>
        <WorkspaceFields kind={kind} form={form} paths={paths} id={id} />
      </section>
      <KnowledgeSourcesField form={form} paths={paths} base={knowledgeBase} id={id} />
      <Field id={`${id}-engine`} label="Engine">
        <Input
          id={`${id}-engine`}
          value="claude-code"
          readOnly
          aria-readonly
          className="w-48 font-mono text-sm"
        />
      </Field>
      <ConfirmDialog
        open={pendingKind !== null}
        title="Change the Project type?"
        description={`The fields of the ${WORKSPACE_KINDS.find((k) => k.kind === kind)?.label ?? kind} type are dropped. Assemblies that use what the new type cannot provide become invalid once you save.`}
        confirmLabel="Change type"
        onConfirm={() => {
          if (pendingKind) applyKind(pendingKind);
          setPendingKind(null);
        }}
        onCancel={() => setPendingKind(null)}
      />
    </div>
  );
}
