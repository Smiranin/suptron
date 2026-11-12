import type { ProfileFile } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Separator } from '@suptron/ui/components/separator';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { InUseError, NotFoundError } from '../../api/client';
import { api, useHealth, useInvalidateConfig, useProject } from '../../api/queries';
import type { ProjectItem } from '../../api/types';
import { ActiveMissionsNote } from '../../components/active-missions-note';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { ConflictDialog } from '../../components/conflict-dialog';
import { DiscardGuard } from '../../components/discard-guard';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { PageContainer, PageHeader, StatePanel } from '../../components/page';
import { SaveBar } from '../../components/save-bar';
import { useSaveFlow } from '../../components/use-save-flow';
import { useSaveShortcut } from '../../lib/keyboard';
import { AssembliesList } from './AssembliesList';
import {
  ProfileForm,
  emptyProfile,
  profileForForm,
  useProfileForm,
  usePathStatuses,
} from './ProfileForm';

/** One Project: its Profile inline and its Assemblies (editors SPEC FR-1, FR-14 to FR-17). */
export function ProjectPage({ project }: { project: string }) {
  const loaded = useProject(project);
  if (loaded.isPending) return <PageContainer>Loading…</PageContainer>;
  if (loaded.isError) {
    return (
      <StatePanel
        label={loaded.error instanceof NotFoundError ? '404' : 'Error'}
        title={
          loaded.error instanceof NotFoundError
            ? 'No such Project'
            : 'The Project could not be read'
        }
        description={loaded.error.message}
        action={
          <Button asChild>
            <Link to="/projects">Back to Projects</Link>
          </Button>
        }
      />
    );
  }
  return <ProjectEditor key={`${project}:${loaded.data.etag}`} item={loaded.data} />;
}

function ProjectEditor({ item }: { item: ProjectItem }) {
  const navigate = useNavigate();
  const health = useHealth();
  const invalidate = useInvalidateConfig();
  const name = item.name;
  const [etag, setEtag] = useState<string | null>(item.profile ? item.etag : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const paths = usePathStatuses();
  // The ID is frozen once the Project exists, so a save never renames its folder.
  const form = useProfileForm(
    item.profile ? profileForForm(item.profile) : emptyProfile('repository', name),
  );

  const flow = useSaveFlow<ProfileFile>({
    etag,
    save: useCallback(
      async (doc, mode) => {
        const result = await api.putProfile(name, doc, mode);
        return { data: result.profile, etag: result.etag };
      },
      [name],
    ),
    onSaved: useCallback(
      (result) => {
        setEtag(result.etag);
        form.reset(profileForForm(result.data));
        toast.success(`Saved ${result.data.title ?? result.data.name}`);
        // A changed Workspace re-validates the Assemblies; say so when some became invalid (FR-3).
        const before = new Map(item.assemblies.map((a) => [a.name, a.status]));
        void invalidate().then(async () => {
          try {
            const after = await api.project(result.data.name);
            const broken = after.assemblies.filter(
              (a) => a.status === 'invalid' && before.get(a.name) === 'valid',
            ).length;
            if (broken > 0) {
              toast.warning(
                `${broken} ${broken === 1 ? 'Assembly is' : 'Assemblies are'} now invalid`,
              );
            }
          } catch {
            // The list below refetches on its own; the warning is a courtesy.
          }
        });
      },
      [form, invalidate, item.assemblies],
    ),
    onReload: useCallback(
      (current) => {
        setEtag(current.etag);
        form.reset(profileForForm(current.data));
      },
      [form],
    ),
    onError: useCallback((error: Error) => toast.error(error.message), []),
  });

  const { isDirty } = form.formState;
  const pathsBlock = paths.missing.length > 0;
  // Save stays enabled on invalid fields: pressing it reveals and focuses them.
  const canSave = isDirty && !paths.checking && !flow.saving;
  const disabledReason = !isDirty
    ? 'No changes to save'
    : paths.checking
      ? 'Checking paths…'
      : undefined;
  const save = useCallback(() => {
    void form.handleSubmit((doc) => {
      if (pathsBlock) toast.error('A path does not exist; fix it before saving');
      else return flow.save(doc);
    })();
  }, [form, flow, pathsBlock]);
  useSaveShortcut(save, canSave);

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api.deleteProject(name);
      await invalidate();
      toast.success(`Deleted ${name}`);
      void navigate({ to: '/projects' });
    } catch (error) {
      if (error instanceof InUseError)
        toast.error(`Deleting is refused while ${error.count} active Missions use the Project`);
      else toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={item.profile?.title ?? name}
        action={
          <SaveBar
            dirty={isDirty}
            canSave={canSave}
            saving={flow.saving}
            disabledReason={disabledReason}
            onSave={save}
          >
            <Button asChild variant="ghost">
              <Link to="/projects" aria-label="Back to Projects">
                <ArrowLeft aria-hidden="true" /> Projects
              </Link>
            </Button>
            <OpenInEditorButton
              path={health.data ? `${health.data.configHome}/projects/${name}/profile.yaml` : null}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete Project"
            >
              <Trash2 aria-hidden="true" /> Delete
            </Button>
          </SaveBar>
        }
      />
      <ActiveMissionsNote count={item.activeMissions} subject="Project Profile" />
      {item.issues.length > 0 && (
        <p className="text-destructive mb-4 text-sm" role="alert">
          The Profile file has problems: {item.issues.map((i) => i.message).join('; ')}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="mt-4"
        aria-label="Project Profile"
      >
        <ProfileForm form={form} paths={paths} existing />
      </form>
      <Separator className="my-8" />
      <AssembliesList project={name} assemblies={item.assemblies} />
      <DiscardGuard when={isDirty} />
      <ConflictDialog
        open={flow.conflict}
        onReload={flow.reload}
        onOverwrite={() => void flow.overwrite()}
        onCancel={flow.cancelConflict}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${name}?`}
        description="The Project folder with its Profile and Assemblies is removed. Refused while any of its Assemblies has active Missions."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </PageContainer>
  );
}
