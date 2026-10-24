import {
  profileFileSchema,
  type ProfileFile,
  type ProfileFileInput,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { Textarea } from '@suptron/ui/components/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { useRemoteDefaults } from '../../api/queries';
import { Field } from '../../components/field';
import { NameField } from '../../components/name-field';
import { PathField, type PathStatus } from '../../components/path-field';
import { TagInput } from '../../components/tag-input';

export type ProfileFormHandle = UseFormReturn<ProfileFileInput, unknown, ProfileFile>;

export function emptyProfile(): ProfileFile {
  return {
    name: '',
    repository: { path: '', remote: 'origin', protectedBranch: 'main' },
    knowledgeSources: [],
    git: {
      branchNameTemplate: 'feature/{work_item_id}-{task_slug}',
      pullRequestTemplate: '## {task_title}\n\n### Summary\n\n### Testing\n',
      labels: [],
      reviewers: [],
    },
    host: 'github',
    engine: 'claude-code',
    ciWaitTimeoutMinutes: 30,
  };
}

export function useProfileForm(defaultValues: ProfileFile): ProfileFormHandle {
  return useForm<ProfileFileInput, unknown, ProfileFile>({
    resolver: zodResolver(profileFileSchema),
    defaultValues,
    mode: 'onChange',
  });
}

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

const PLACEHOLDER_LEGEND = (
  <>
    Placeholders: <code>{'{work_item_id}'}</code> (empty when none, with one adjacent separator
    removed), <code>{'{task_slug}'}</code>, <code>{'{task_title}'}</code>.
  </>
);

export interface ProfileFormProps {
  form: ProfileFormHandle;
  paths: ReturnType<typeof usePathStatuses>;
  nameError?: string | null;
}

/** The Project Profile form (editors SPEC FR-14 to FR-17). */
export function ProfileForm({ form, paths, nameError }: ProfileFormProps) {
  const id = useId();
  const errors = form.formState.errors;
  const repositoryPath = form.watch('repository.path') ?? '';
  const knowledgeSources = form.watch('knowledgeSources') ?? [];
  const repositoryExists =
    paths.statuses.repository?.checking === false && paths.statuses.repository.exists;
  const defaults = useRemoteDefaults(repositoryPath, repositoryExists);
  const appliedFor = useRef<string | null>(null);

  const applyDefaults = () => {
    if (!defaults.data) return;
    if (defaults.data.remoteUrl)
      form.setValue('repository.remote', defaults.data.remote, { shouldDirty: true });
    if (defaults.data.headBranch) {
      form.setValue('repository.protectedBranch', defaults.data.headBranch, { shouldDirty: true });
    }
  };
  // Prefill once per repository path when git reports defaults; the fields stay editable.
  useEffect(() => {
    if (!defaults.data || appliedFor.current === repositoryPath) return;
    appliedFor.current = repositoryPath;
    applyDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.data, repositoryPath]);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
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
        <Controller
          control={form.control}
          name="repository.path"
          render={({ field }) => (
            <Field
              id={`${id}-repo`}
              label="Repository path"
              hint="Absolute path of the main clone; worktrees are discovered from it."
              error={errors.repository?.path?.message}
            >
              <PathField
                id={`${id}-repo`}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  if (value.trim() === '') paths.set('repository', null);
                }}
                placeholder="/Users/me/code/my-app"
                onStatus={(status) => paths.set('repository', status)}
                aria-label="Repository path"
              />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
            name="repository.remote"
            render={({ field }) => (
              <Field id={`${id}-remote`} label="Remote" error={errors.repository?.remote?.message}>
                <Input
                  id={`${id}-remote`}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="font-mono text-sm"
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="repository.protectedBranch"
            render={({ field }) => (
              <Field
                id={`${id}-protected-branch`}
                label="Protected branch"
                hint="Pilots never commit to or push into it; it is also the base of Pull Requests."
                error={errors.repository?.protectedBranch?.message}
              >
                <Input
                  id={`${id}-protected-branch`}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="font-mono text-sm"
                />
              </Field>
            )}
          />
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!defaults.data}
            onClick={applyDefaults}
          >
            <GitBranch aria-hidden="true" /> Read from git
          </Button>
          {defaults.isError && repositoryExists && (
            <p className="text-muted-foreground mt-1 text-xs">
              Not a git repository, or it has no remote named origin.
            </p>
          )}
        </div>
        <Controller
          control={form.control}
          name="knowledgeSources"
          render={({ field }) => {
            const list = field.value ?? [];
            const update = (next: string[]) => field.onChange(next);
            return (
              <Field
                id={`${id}-ks`}
                label="Knowledge Sources"
                hint="Files or folders relative to the repository that tell agents how the Project works."
              >
                <div className="flex flex-col gap-2" id={`${id}-ks`}>
                  {list.map((source, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1">
                        <PathField
                          value={source}
                          base={repositoryPath}
                          placeholder="docs/adr"
                          aria-label={`Knowledge Source ${index + 1}`}
                          onChange={(value) =>
                            update(list.map((s, i) => (i === index ? value : s)))
                          }
                          onStatus={(status) => paths.set(`knowledgeSource:${index}`, status)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove Knowledge Source ${index + 1}`}
                        onClick={() => {
                          paths.set(`knowledgeSource:${list.length - 1}`, null);
                          update(list.filter((_, i) => i !== index));
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => update([...list, ''])}
                    >
                      <Plus aria-hidden="true" /> Add Knowledge Source
                    </Button>
                  </div>
                </div>
              </Field>
            );
          }}
        />
        {knowledgeSources.some((s) => s.trim() === '') && (
          <p className="text-destructive text-xs" role="alert">
            Every Knowledge Source needs a path.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-5">
        <Controller
          control={form.control}
          name="git.branchNameTemplate"
          render={({ field }) => (
            <Field
              id={`${id}-branch`}
              label="Branch name template"
              hint={PLACEHOLDER_LEGEND}
              error={errors.git?.branchNameTemplate?.message}
            >
              <Input
                id={`${id}-branch`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="font-mono text-sm"
              />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="git.pullRequestTemplate"
          render={({ field }) => (
            <Field
              id={`${id}-pr`}
              label="Pull Request description template"
              hint={PLACEHOLDER_LEGEND}
            >
              <Textarea
                id={`${id}-pr`}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                rows={6}
                className="font-mono text-sm"
              />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
            name="git.labels"
            render={({ field }) => (
              <Field id={`${id}-labels`} label="Labels" hint="Enter or comma adds one.">
                <TagInput
                  id={`${id}-labels`}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  aria-label="Labels"
                  placeholder="feature"
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="git.reviewers"
            render={({ field }) => (
              <Field id={`${id}-reviewers`} label="Reviewers" hint="GitHub logins.">
                <TagInput
                  id={`${id}-reviewers`}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  aria-label="Reviewers"
                  placeholder="octocat"
                />
              </Field>
            )}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field id={`${id}-host`} label="Host">
            <Input
              id={`${id}-host`}
              value="github"
              readOnly
              aria-readonly
              className="font-mono text-sm"
            />
          </Field>
          <Field id={`${id}-engine`} label="Engine">
            <Input
              id={`${id}-engine`}
              value="claude-code"
              readOnly
              aria-readonly
              className="font-mono text-sm"
            />
          </Field>
          <Controller
            control={form.control}
            name="ciWaitTimeoutMinutes"
            render={({ field }) => (
              <Field
                id={`${id}-ci`}
                label="CI wait (minutes)"
                error={errors.ciWaitTimeoutMinutes?.message}
              >
                <Input
                  id={`${id}-ci`}
                  type="number"
                  min={1}
                  value={field.value ?? ''}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value === '' ? undefined : Number(event.target.value),
                    )
                  }
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />
        </div>
      </div>
    </div>
  );
}
