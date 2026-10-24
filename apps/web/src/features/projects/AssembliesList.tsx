import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { InUseError, NameTakenError } from '../../api/client';
import { api, useHealth, useInvalidateConfig } from '../../api/queries';
import type { AssemblyItem } from '../../api/types';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { NamePromptDialog } from '../../components/name-prompt-dialog';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { StatusBadge, type StatusTone } from '../../components/status-badge';

const STATUS_TONE: Record<AssemblyItem['status'], StatusTone> = {
  valid: 'success',
  invalid: 'destructive',
  unparseable: 'destructive',
};
const STATUS_LABEL: Record<AssemblyItem['status'], string> = {
  valid: 'Valid',
  invalid: 'Invalid',
  unparseable: 'Unparseable',
};

export function AssemblyStatusBadge({ status }: { status: AssemblyItem['status'] }) {
  return (
    <StatusBadge tone={STATUS_TONE[status]} appearance="pill">
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}

type Pending =
  | { kind: 'new' }
  | { kind: 'duplicate'; assembly: AssemblyItem }
  | { kind: 'delete'; assembly: AssemblyItem }
  | null;

/** The Assemblies of one Project with New, Duplicate, Delete and Open in editor (SPEC FR-7, FR-9). */
export function AssembliesList({
  project,
  assemblies,
}: {
  project: string;
  assemblies: AssemblyItem[];
}) {
  const navigate = useNavigate();
  const health = useHealth();
  const invalidate = useInvalidateConfig();
  const [pending, setPending] = useState<Pending>(null);
  const [refusal, setRefusal] = useState<{ assembly: string; count: number } | null>(null);
  const names = assemblies.map((a) => a.name);

  const remove = async (assembly: AssemblyItem) => {
    setPending(null);
    try {
      await api.deleteAssembly(project, assembly.name);
      await invalidate();
      toast.success(`Deleted ${assembly.name}`);
    } catch (error) {
      if (error instanceof InUseError) setRefusal({ assembly: assembly.name, count: error.count });
      else toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const duplicate = async (assembly: AssemblyItem, newName: string): Promise<string | null> => {
    try {
      await api.duplicateAssembly(project, assembly.name, newName);
      await invalidate();
      setPending(null);
      void navigate({
        to: '/projects/$project/assemblies/$assembly',
        params: { project, assembly: newName },
      });
      return null;
    } catch (error) {
      if (error instanceof NameTakenError) return 'That name is already taken';
      return error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="assemblies-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="assemblies-heading" className="m-0 text-xl font-bold tracking-tight">
          Assemblies
        </h2>
        <Button type="button" variant="outline" onClick={() => setPending({ kind: 'new' })}>
          <Plus aria-hidden="true" /> New Assembly
        </Button>
      </div>
      {assemblies.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Assemblies yet. A new Assembly opens as an empty clock.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Assemblies">
          {assemblies.map((assembly) => (
            <li
              key={assembly.name}
              className="border-border bg-card flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3"
              data-testid="assembly-row"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-3">
                  <Link
                    to="/projects/$project/assemblies/$assembly"
                    params={{ project, assembly: assembly.name }}
                    className="text-foreground font-mono text-sm font-bold no-underline hover:underline"
                  >
                    {assembly.name}
                  </Link>
                  <AssemblyStatusBadge status={assembly.status} />
                  {assembly.activeMissions > 0 && (
                    <span className="text-warning text-xs font-medium">
                      {assembly.activeMissions} active{' '}
                      {assembly.activeMissions === 1 ? 'Mission' : 'Missions'}
                    </span>
                  )}
                </div>
                {assembly.status !== 'valid' && assembly.issues.errors[0] && (
                  <p className="text-destructive text-xs">{assembly.issues.errors[0].message}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <OpenInEditorButton
                  path={
                    health.data
                      ? `${health.data.configHome}/projects/${project}/assemblies/${assembly.name}.yaml`
                      : null
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Duplicate ${assembly.name}`}
                  disabled={assembly.status === 'unparseable'}
                  onClick={() => setPending({ kind: 'duplicate', assembly })}
                >
                  <Copy aria-hidden="true" /> Duplicate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${assembly.name}`}
                  onClick={() => setPending({ kind: 'delete', assembly })}
                >
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <NamePromptDialog
        open={pending?.kind === 'new'}
        title="New Assembly"
        description="The Assembly opens as an empty clock; it is written when you save it."
        onSubmit={async (name) => {
          if (names.includes(name)) return 'That name is already taken';
          setPending(null);
          void navigate({
            to: '/projects/$project/assemblies/$assembly',
            params: { project, assembly: name },
          });
          return null;
        }}
        onCancel={() => setPending(null)}
      />
      <NamePromptDialog
        open={pending?.kind === 'duplicate'}
        title={`Duplicate ${pending?.kind === 'duplicate' ? pending.assembly.name : ''}`}
        initialValue={pending?.kind === 'duplicate' ? `${pending.assembly.name}-copy` : ''}
        confirmLabel="Duplicate"
        onSubmit={(name) =>
          pending?.kind === 'duplicate' ? duplicate(pending.assembly, name) : Promise.resolve(null)
        }
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={`Delete ${pending?.kind === 'delete' ? pending.assembly.name : ''}?`}
        description="The Assembly file is removed. Active Missions keep their snapshot, but the deletion is refused while any runs."
        confirmLabel="Delete"
        destructive
        onConfirm={() => pending?.kind === 'delete' && void remove(pending.assembly)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={refusal !== null}
        title={`${refusal?.assembly ?? ''} has active Missions`}
        description={
          <span data-testid="active-missions-refusal">
            Deleting is refused while {refusal?.count} active{' '}
            {refusal?.count === 1 ? 'Mission uses' : 'Missions use'} it. Wait for them to finish or
            stop them.
          </span>
        }
        confirmLabel="OK"
        onConfirm={() => setRefusal(null)}
        onCancel={() => setRefusal(null)}
      />
    </section>
  );
}
