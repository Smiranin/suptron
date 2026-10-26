import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { Textarea } from '@suptron/ui/components/textarea';
import { GitBranch } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Controller } from 'react-hook-form';
import { useRemoteDefaults } from '../../../api/queries';
import { Field } from '../../../components/field';
import { PathField } from '../../../components/path-field';
import { TagInput } from '../../../components/tag-input';
import type { WorkspaceFieldsProps } from './types';

const PLACEHOLDER_LEGEND = (
  <>
    Placeholders: <code>{'{work_item_id}'}</code> (empty when none, with one adjacent separator
    removed), <code>{'{task_slug}'}</code>, <code>{'{task_title}'}</code>.
  </>
);

/**
 * Kind `repository`: the clone, its remote and protected branch (read from git when the path
 * resolves to a repository, SPEC FR-4), the host, the Git conventions and the CI wait.
 */
export function RepositoryFields({ form, paths, id }: WorkspaceFieldsProps) {
  const errors = form.formState.errors.workspace ?? {};
  const repositoryPath = form.watch('workspace.path') ?? '';
  const repositoryExists =
    paths.statuses.workspace?.checking === false && paths.statuses.workspace.exists;
  const defaults = useRemoteDefaults(repositoryPath, repositoryExists);
  const appliedFor = useRef<string | null>(null);

  const applyDefaults = () => {
    if (!defaults.data) return;
    if (defaults.data.remoteUrl)
      form.setValue('workspace.remote', defaults.data.remote, { shouldDirty: true });
    if (defaults.data.headBranch) {
      form.setValue('workspace.protectedBranch', defaults.data.headBranch, { shouldDirty: true });
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
          name="workspace.path"
          render={({ field }) => (
            <Field
              id={`${id}-repo`}
              label="Repository path"
              hint="Absolute path of the main clone; worktrees are discovered from it."
              error={errors.path?.message}
            >
              <PathField
                id={`${id}-repo`}
                value={field.value ?? ''}
                onChange={(value) => {
                  field.onChange(value);
                  if (value.trim() === '') paths.set('workspace', null);
                }}
                placeholder="/Users/me/code/my-app"
                onStatus={(status) => paths.set('workspace', status)}
                aria-label="Repository path"
              />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
            name="workspace.remote"
            render={({ field }) => (
              <Field id={`${id}-remote`} label="Remote" error={errors.remote?.message}>
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
            name="workspace.protectedBranch"
            render={({ field }) => (
              <Field
                id={`${id}-protected-branch`}
                label="Protected branch"
                hint="Pilots never commit to or push into it; it is also the base of Pull Requests."
                error={errors.protectedBranch?.message}
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
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
            name="workspace.host"
            render={({ field }) => (
              <Field
                id={`${id}-host`}
                label="Host"
                hint="Without a host the Pull Request and CI Checks are not available."
              >
                <Select value={field.value ?? 'github'} onValueChange={field.onChange}>
                  <SelectTrigger id={`${id}-host`} aria-label="Host" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">github</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="workspace.ciWaitTimeoutMinutes"
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
      <div className="flex flex-col gap-5">
        <Controller
          control={form.control}
          name="workspace.git.branchNameTemplate"
          render={({ field }) => (
            <Field
              id={`${id}-branch`}
              label="Branch name template"
              hint={PLACEHOLDER_LEGEND}
              error={errors.git?.branchNameTemplate?.message}
            >
              <Input
                id={`${id}-branch`}
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
          name="workspace.git.pullRequestTemplate"
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
            name="workspace.git.labels"
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
            name="workspace.git.reviewers"
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
      </div>
    </div>
  );
}
