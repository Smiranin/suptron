import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { Textarea } from '@suptron/ui/components/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { PathField } from '../../components/path-field';
import type { usePathStatuses } from './ProfileForm';
import type { ProfileFormHandle, ProfileFormValues } from './profile-form-model';

type Row = ProfileFormValues['knowledgeSources'][number];
type RowKind = 'path' | 'text';

function rowKind(row: Row): RowKind {
  return 'text' in row && row.text !== undefined ? 'text' : 'path';
}

/** An empty title is dropped from the row rather than kept as an empty string. */
function withTitle(row: Row, title: string): Row {
  const { title: _ignored, ...rest } = row;
  void _ignored;
  return title === '' ? rest : { ...rest, title };
}

/** A row of the other kind keeps its title only; the schema is strict about foreign keys. */
function switchRow(row: Row, kind: RowKind): Row {
  const title = row.title !== undefined && row.title !== '' ? { title: row.title } : {};
  return kind === 'text' ? { text: '', ...title } : { path: '', ...title };
}

export interface KnowledgeSourcesFieldProps {
  form: ProfileFormHandle;
  paths: ReturnType<typeof usePathStatuses>;
  /** The Workspace root relative paths resolve against; undefined for kind `none`. */
  base: string | undefined;
  id: string;
}

/** Path-or-text rows (SPEC FR-2): a path is checked for existence, a text goes to Slots verbatim. */
export function KnowledgeSourcesField({ form, paths, base, id }: KnowledgeSourcesFieldProps) {
  const errors = form.formState.errors.knowledgeSources;
  return (
    <Controller
      control={form.control}
      name="knowledgeSources"
      render={({ field }) => {
        const list = field.value ?? [];
        const update = (next: Row[]) => field.onChange(next);
        const setRow = (index: number, row: Row) =>
          update(list.map((r, i) => (i === index ? row : r)));
        return (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-ks`}>Knowledge Sources</Label>
            <p className="text-muted-foreground text-xs">
              Documents or folders that tell agents how the Project works, or a text given to them
              as is.{' '}
              {base === undefined
                ? 'Without a folder a path must be absolute.'
                : 'A relative path resolves inside the Workspace.'}
            </p>
            <div className="flex flex-col gap-2" id={`${id}-ks`}>
              {list.map((row, index) => {
                const kind = rowKind(row);
                const n = index + 1;
                const rowErrors = Array.isArray(errors) ? errors[index] : undefined;
                const pathError = rowErrors?.path?.message ?? rowErrors?.text?.message;
                return (
                  <div
                    key={index}
                    className="border-border flex flex-col gap-2 rounded-lg border p-3"
                    data-testid="knowledge-source-row"
                  >
                    <div className="flex items-center gap-2">
                      <Select
                        value={kind}
                        onValueChange={(v) => {
                          if (v === 'path') paths.set(`knowledgeSource:${index}`, null);
                          setRow(index, switchRow(row, v as RowKind));
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Knowledge Source ${n} type`}
                          className="w-28 shrink-0"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="path">Path</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={row.title ?? ''}
                        onChange={(e) => setRow(index, withTitle(row, e.target.value))}
                        placeholder="Title (optional)"
                        aria-label={`Knowledge Source ${n} title`}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove Knowledge Source ${n}`}
                        onClick={() => {
                          // Statuses are keyed by index; the last key is the one that disappears.
                          paths.set(`knowledgeSource:${list.length - 1}`, null);
                          update(list.filter((_, i) => i !== index));
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    {kind === 'path' ? (
                      <PathField
                        value={row.path ?? ''}
                        {...(base !== undefined && { base })}
                        placeholder={
                          base === undefined ? '/Users/me/Docs/conventions.md' : 'docs/adr'
                        }
                        aria-label={`Knowledge Source ${n}`}
                        onChange={(value) => setRow(index, { ...row, path: value })}
                        onStatus={(status) => paths.set(`knowledgeSource:${index}`, status)}
                      />
                    ) : (
                      <Textarea
                        value={row.text ?? ''}
                        onChange={(e) => setRow(index, { ...row, text: e.target.value })}
                        rows={4}
                        placeholder="Conventions the agents follow, given to them verbatim."
                        aria-label={`Knowledge Source ${n}`}
                      />
                    )}
                    {pathError && (
                      <p className="text-destructive text-xs" role="alert">
                        {pathError}
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
                  onClick={() => update([...list, { path: '' }])}
                >
                  <Plus aria-hidden="true" /> Add Knowledge Source
                </Button>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
