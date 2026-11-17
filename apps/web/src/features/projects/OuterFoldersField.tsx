import { Button } from '@suptron/ui/components/button';
import { Label } from '@suptron/ui/components/label';
import { Plus, Trash2 } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { PathField } from '../../components/path-field';
import type { usePathStatuses } from './ProfileForm';
import type { ProfileFormHandle } from './profile-form-model';

export interface OuterFoldersFieldProps {
  form: ProfileFormHandle;
  paths: ReturnType<typeof usePathStatuses>;
  id: string;
}

/** Absolute folders outside the Workspace that every Pilot of the Project may write to. */
export function OuterFoldersField({ form, paths, id }: OuterFoldersFieldProps) {
  const errors = form.formState.errors.outerFolders;
  return (
    <Controller
      control={form.control}
      name="outerFolders"
      render={({ field }) => {
        const list = field.value ?? [];
        const update = (next: string[]) => field.onChange(next);
        return (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-outer`}>Outer Folders</Label>
            <p className="text-muted-foreground text-xs">
              Folders outside the Workspace where every Pilot of this Project may write, as absolute
              paths. A folder reaches the Pilots' context only when it is also a Knowledge Source.
            </p>
            <div className="flex flex-col gap-2" id={`${id}-outer`}>
              {list.map((folder, index) => {
                const n = index + 1;
                const error = Array.isArray(errors) ? errors[index]?.message : undefined;
                return (
                  <div key={index} className="flex flex-col gap-1" data-testid="outer-folder-row">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <PathField
                          value={folder}
                          placeholder="/Users/me/Docs/project-notes"
                          aria-label={`Outer Folder ${n}`}
                          aria-invalid={error ? true : undefined}
                          onChange={(value) =>
                            update(list.map((f, i) => (i === index ? value : f)))
                          }
                          onStatus={(status) => paths.set(`outerFolder:${index}`, status)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove Outer Folder ${n}`}
                        onClick={() => {
                          // Statuses are keyed by index; the last key is the one that disappears.
                          paths.set(`outerFolder:${list.length - 1}`, null);
                          update(list.filter((_, i) => i !== index));
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    {error && (
                      <p className="text-destructive text-xs" role="alert">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => update([...list, ''])}
                >
                  <Plus aria-hidden="true" /> Add Outer Folder
                </Button>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
