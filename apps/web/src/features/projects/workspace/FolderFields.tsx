import { Controller } from 'react-hook-form';
import { Field } from '../../../components/field';
import { PathField } from '../../../components/path-field';
import type { WorkspaceFieldsProps } from './types';

/** Kind `folder`: one directory, git inside it ignored; one Mission at a time (SPEC FR-10). */
export function FolderFields({ form, paths, id }: WorkspaceFieldsProps) {
  const error = form.formState.errors.workspace?.path?.message;
  return (
    <Controller
      control={form.control}
      name="workspace.path"
      render={({ field }) => (
        <Field
          id={`${id}-folder`}
          label="Folder path"
          required
          hint="Absolute path of the directory Missions work in; a git repository inside it is ignored."
          error={error}
        >
          <PathField
            id={`${id}-folder`}
            ref={field.ref}
            value={field.value ?? ''}
            onChange={(value) => {
              field.onChange(value);
              if (value.trim() === '') paths.set('workspace', null);
            }}
            placeholder="/Users/me/notes"
            onStatus={(status) => paths.set('workspace', status)}
            aria-label="Folder path"
            aria-required
          />
        </Field>
      )}
    />
  );
}
