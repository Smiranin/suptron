import type { ProjectPaths } from '@suptron/runtime/browser';
import { useId } from 'react';
import { Field } from '../../components/field';
import { PathField } from '../../components/path-field';

/** The machine-bound paths of one imported Profile, each editable; only values change, never how many there are. */
export function ProjectPathsFields({
  paths,
  onChange,
}: {
  paths: ProjectPaths;
  onChange: (paths: ProjectPaths) => void;
}) {
  const id = useId();
  const { workspace } = paths;
  return (
    <fieldset className="border-border flex flex-col gap-3 rounded-lg border px-4 py-3">
      <legend className="px-1 text-sm font-bold">Paths on this machine</legend>
      {workspace !== null && (
        <Field id={`${id}-workspace`} label="Workspace path">
          <PathField
            id={`${id}-workspace`}
            value={workspace}
            onChange={(value) => onChange({ ...paths, workspace: value })}
            aria-label="Workspace path"
          />
        </Field>
      )}
      {paths.outerFolders.map((folder, i) => (
        <Field key={`outer-${i}`} id={`${id}-outer-${i}`} label={`Outer Folder ${i + 1}`}>
          <PathField
            id={`${id}-outer-${i}`}
            value={folder}
            onChange={(value) =>
              onChange({
                ...paths,
                outerFolders: paths.outerFolders.map((f, j) => (j === i ? value : f)),
              })
            }
            aria-label={`Outer Folder ${i + 1}`}
          />
        </Field>
      ))}
      {paths.knowledgeSources.map((source) => (
        <Field
          key={`source-${source.index}`}
          id={`${id}-source-${source.index}`}
          label={`Knowledge Source ${source.index + 1}`}
        >
          <PathField
            id={`${id}-source-${source.index}`}
            value={source.path}
            onChange={(value) =>
              onChange({
                ...paths,
                knowledgeSources: paths.knowledgeSources.map((s) =>
                  s.index === source.index ? { ...s, path: value } : s,
                ),
              })
            }
            aria-label={`Knowledge Source ${source.index + 1}`}
          />
        </Field>
      ))}
    </fieldset>
  );
}
