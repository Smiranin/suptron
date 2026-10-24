import { summarizeCondition } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { Copy, MessageCircleQuestion, Plus, Trash2, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { InUseError, NameTakenError } from '../../api/client';
import { api, useHealth, useInvalidateConfig, useUnits } from '../../api/queries';
import type { UnitItem } from '../../api/types';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { NamePromptDialog } from '../../components/name-prompt-dialog';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { EmptyState, PageContainer, PageHeader, StatePanel } from '../../components/page';

type Pending = { kind: 'duplicate'; unit: UnitItem } | { kind: 'delete'; unit: UnitItem } | null;

/** The shared library of Units (editors SPEC FR-1, FR-7, FR-9). */
export function HangarPage() {
  const units = useUnits();
  const health = useHealth();
  const invalidate = useInvalidateConfig();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>(null);
  const [refusal, setRefusal] = useState<{
    unit: string;
    usedBy: { project: string; assembly: string }[];
  } | null>(null);

  if (units.isPending) return <PageContainer>Loading…</PageContainer>;
  if (units.isError) {
    return <StatePanel title="The Hangar could not be read" description={units.error.message} />;
  }

  const remove = async (unit: UnitItem) => {
    setPending(null);
    try {
      await api.deleteUnit(unit.name);
      await invalidate();
      toast.success(`Deleted ${unit.name}`);
    } catch (error) {
      if (error instanceof InUseError) setRefusal({ unit: unit.name, usedBy: error.usedBy });
      else toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const duplicate = async (unit: UnitItem, newName: string): Promise<string | null> => {
    try {
      await api.duplicateUnit(unit.name, newName);
      await invalidate();
      setPending(null);
      void navigate({ to: '/hangar/$name', params: { name: newName } });
      return null;
    } catch (error) {
      if (error instanceof NameTakenError) return 'That name is already taken';
      return error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Hangar"
        count={units.data.length}
        action={
          <Button asChild>
            <Link to="/hangar/new">
              <Plus aria-hidden="true" /> New Unit
            </Link>
          </Button>
        }
      />
      {units.data.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="The Hangar is empty"
          description="Units you create will wait here until an Assembly mounts them."
          action={
            <Button asChild>
              <Link to="/hangar/new">New Unit</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Units">
          {units.data.map((item) => (
            <li
              key={item.name}
              className="border-border bg-card flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3"
              data-testid="unit-row"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {item.unit ? (
                  <Link
                    to="/hangar/$name"
                    params={{ name: item.name }}
                    className="text-foreground font-mono text-sm font-bold no-underline hover:underline"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="font-mono text-sm font-bold">{item.name}</span>
                )}
                {item.unit ? (
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                    <span>{item.unit.model}</span>
                    <span>
                      {summarizeCondition(item.unit.doneCondition) || 'no Done Condition'}
                    </span>
                    {item.unit.mayAskCommander && (
                      <span
                        className="text-warning inline-flex items-center gap-1"
                        title="May ask the Commander"
                      >
                        <MessageCircleQuestion aria-hidden="true" className="size-3.5" /> may ask
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-destructive text-xs" role="alert">
                    {item.issues.map((i) => i.message).join('; ') || 'The file is invalid'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {item.unit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Duplicate ${item.name}`}
                      onClick={() => setPending({ kind: 'duplicate', unit: item })}
                    >
                      <Copy aria-hidden="true" /> Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setPending({ kind: 'delete', unit: item })}
                    >
                      <Trash2 aria-hidden="true" /> Delete
                    </Button>
                  </>
                ) : (
                  <OpenInEditorButton
                    path={health.data ? `${health.data.configHome}/hangar/${item.name}.md` : null}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <NamePromptDialog
        open={pending?.kind === 'duplicate'}
        title={`Duplicate ${pending?.unit.name ?? ''}`}
        description="The copy keeps every setting; only the name changes."
        initialValue={pending ? `${pending.unit.name}-copy` : ''}
        confirmLabel="Duplicate"
        onSubmit={(name) => (pending ? duplicate(pending.unit, name) : Promise.resolve(null))}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={`Delete ${pending?.unit.name ?? ''}?`}
        description="The Unit file is removed from the Hangar. Assemblies that use it would become invalid, so the deletion is refused while any does."
        confirmLabel="Delete"
        destructive
        onConfirm={() => pending && void remove(pending.unit)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={refusal !== null}
        title={`${refusal?.unit ?? ''} is in use`}
        description={
          <span data-testid="in-use-refusal">
            Deleting is refused while these Assemblies use it:{' '}
            {refusal?.usedBy.map((u) => `${u.project} / ${u.assembly}`).join(', ')}. Remove the
            Slots first.
          </span>
        }
        confirmLabel="OK"
        onConfirm={() => setRefusal(null)}
        onCancel={() => setRefusal(null)}
      />
    </PageContainer>
  );
}
