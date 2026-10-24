import { Button } from '@suptron/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@suptron/ui/components/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { Switch } from '@suptron/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@suptron/ui/components/tabs';
import { Textarea } from '@suptron/ui/components/textarea';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Rocket } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MissionTask } from '@suptron/runtime/browser';
import {
  CheckoutBusyError,
  MissionValidationError,
  missionsApi,
  type StartIssueField,
} from '../../../api/missions';
import { useAssembly, useCheckouts, useUnits } from '../../../api/queries';
import type { CheckoutItem } from '../../../api/types';
import { PathField, type PathStatus } from '../../../components/path-field';
import { useMissionSummary } from '../MissionsProvider';
import { missionTitle } from '../model/selectors';
import { effectiveMayAsk } from './effective-may-ask';
import { readPrefill, writePrefill } from './useStartMissionPrefill';

export interface StartMissionDialogProps {
  project: string;
  assembly: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function BusyLabel({ checkout }: { checkout: CheckoutItem }) {
  const busy = useMissionSummary(checkout.busyMissionId);
  return (
    <>
      {checkout.path}
      {checkout.branch ? ` (${checkout.branch})` : ' (detached)'}
      {checkout.busyMissionId && ` · busy: ${busy ? missionTitle(busy) : checkout.busyMissionId}`}
    </>
  );
}

function CheckoutSelect({
  checkouts,
  value,
  onChange,
  error,
}: {
  checkouts: CheckoutItem[];
  value: string;
  onChange(path: string): void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="start-checkout"
          aria-label="Checkout"
          aria-invalid={error ? true : undefined}
          className="w-full"
        >
          <SelectValue placeholder="Pick a Checkout" />
        </SelectTrigger>
        <SelectContent>
          {checkouts.map((c) => (
            <SelectItem key={c.path} value={c.path} disabled={c.busyMissionId !== null}>
              <BusyLabel checkout={c} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Starts a Mission in a few seconds: Checkout, Task location, Work Item ID, per-Slot toggles (FR-2 to FR-5). */
export function StartMissionDialog({
  project,
  assembly,
  open,
  onOpenChange,
}: StartMissionDialogProps) {
  const navigate = useNavigate();
  const checkouts = useCheckouts(project, open);
  const assemblyQuery = useAssembly(project, assembly, open);
  const units = useUnits();
  const defaults = useMemo(
    () =>
      assemblyQuery.data?.assembly
        ? effectiveMayAsk(
            assemblyQuery.data.assembly,
            units.data?.flatMap((u) => (u.unit ? [u.unit] : [])) ?? [],
          )
        : {},
    [assemblyQuery.data, units.data],
  );
  // The dialog is mounted per opening, so the prefill is read once here (FR-4).
  const [prefill] = useState(() => readPrefill(project));
  const [checkoutPath, setCheckoutPath] = useState('');
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [taskKind, setTaskKind] = useState<MissionTask['kind']>('path');
  const [taskPath, setTaskPath] = useState(prefill?.taskPath ?? '');
  const [taskText, setTaskText] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [taskStatus, setTaskStatus] = useState<PathStatus | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StartIssueField, string>>>({});
  const [starting, setStarting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // The prefilled Checkout is applied once the list is known, and only when it is not busy (FR-4).
  if (checkouts.data && !prefillApplied) {
    setPrefillApplied(true);
    const wanted = checkouts.data.find((c) => c.path === prefill?.checkoutPath);
    if (wanted && wanted.busyMissionId === null) setCheckoutPath(wanted.path);
  }
  const chosenCheckout = checkouts.data?.find((c) => c.path === checkoutPath);
  const toggles = useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides]);

  const taskPathMissing =
    taskPath.trim() === '' || (taskStatus !== null && !taskStatus.checking && !taskStatus.exists);
  const taskMissing = taskKind === 'path' ? taskPathMissing : taskText.trim() === '';
  const canStart =
    !starting && chosenCheckout?.busyMissionId === null && !taskMissing && !checkouts.isError;
  const task: MissionTask =
    taskKind === 'path'
      ? { kind: 'path', path: taskPath.trim() }
      : { kind: 'text', text: taskText };

  const start = async () => {
    setStarting(true);
    setErrors({});
    try {
      const summary = await missionsApi.start({
        project,
        assembly,
        task,
        ...(workItemId.trim() && { workItemId: workItemId.trim() }),
        checkoutPath,
        mayAskCommander: toggles,
      });
      // A text Task is one-off; the last Task path stays prefilled for the next opening (FR-4).
      writePrefill(project, {
        checkoutPath,
        taskPath: taskKind === 'path' ? taskPath.trim() : (prefill?.taskPath ?? ''),
      });
      onOpenChange(false);
      await navigate({ to: '/missions/$id', params: { id: summary.id } });
    } catch (error) {
      if (error instanceof MissionValidationError) {
        setErrors(Object.fromEntries(error.issues.map((i) => [i.field, i.message])));
      } else if (error instanceof CheckoutBusyError) {
        setErrors({ checkoutPath: 'This Checkout is busy with another Mission' });
        void checkouts.refetch();
      } else {
        setErrors({ assembly: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      setStarting(false);
    }
  };

  const slots = assemblyQuery.data?.assembly?.slots ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Start Mission</DialogTitle>
          <DialogDescription>
            {project} / {assembly}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canStart) void start();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-checkout">Checkout</Label>
            {checkouts.isError ? (
              <p className="text-destructive text-sm" role="alert">
                The Checkouts cannot be read: {checkouts.error.message}
              </p>
            ) : (
              <CheckoutSelect
                checkouts={checkouts.data ?? []}
                value={checkoutPath}
                onChange={setCheckoutPath}
                error={errors.checkoutPath}
              />
            )}
          </div>
          <Tabs value={taskKind} onValueChange={(v) => setTaskKind(v as MissionTask['kind'])}>
            <div className="flex items-center justify-between gap-3">
              <Label>Task</Label>
              <TabsList aria-label="How the Task is given">
                <TabsTrigger value="path">File or folder</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="path" className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor="start-task" className="sr-only">
                Task location
              </Label>
              <PathField
                id="start-task"
                value={taskPath}
                onChange={setTaskPath}
                placeholder="/absolute/path/to/task-folder-or-file"
                onStatus={setTaskStatus}
                aria-invalid={errors.taskPath ? true : undefined}
              />
              {errors.taskPath && (
                <p className="text-destructive text-xs" role="alert">
                  {errors.taskPath}
                </p>
              )}
            </TabsContent>
            <TabsContent value="text" className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor="start-task-text" className="sr-only">
                Task text
              </Label>
              <Textarea
                id="start-task-text"
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                rows={6}
                placeholder="What has to be done. The first line becomes the Task title."
                aria-invalid={errors.taskText ? true : undefined}
              />
              <p className="text-muted-foreground text-xs">
                Saved as task.md in the Mission folder. Links to documents elsewhere can go right
                into the text.
              </p>
              {errors.taskText && (
                <p className="text-destructive text-xs" role="alert">
                  {errors.taskText}
                </p>
              )}
            </TabsContent>
          </Tabs>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-work-item">Work Item ID (optional)</Label>
            <Input
              id="start-work-item"
              value={workItemId}
              onChange={(e) => setWorkItemId(e.target.value)}
              aria-invalid={errors.workItemId ? true : undefined}
            />
            {errors.workItemId && (
              <p className="text-destructive text-xs" role="alert">
                {errors.workItemId}
              </p>
            )}
          </div>
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="px-0">
                <ChevronDown
                  aria-hidden="true"
                  className={
                    advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
                Advanced: who may ask you
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul
                className="m-0 mt-2 flex list-none flex-col gap-2 p-0"
                data-testid="advanced-toggles"
              >
                {slots.map((slot) => {
                  const value = toggles[slot.name] ?? defaults[slot.name] ?? false;
                  const changed = value !== (defaults[slot.name] ?? false);
                  const id = `start-toggle-${slot.name}`;
                  return (
                    <li key={slot.name} className="flex items-center justify-between gap-3">
                      <Label htmlFor={id} className="flex items-center gap-2">
                        {slot.name}
                        {changed && (
                          <span className="text-warning text-xs" data-testid="toggle-changed">
                            changed
                          </span>
                        )}
                      </Label>
                      <Switch
                        id={id}
                        checked={value}
                        onCheckedChange={(checked) =>
                          setOverrides((t) => ({ ...t, [slot.name]: checked }))
                        }
                        aria-label={`${slot.name} may ask the Commander`}
                      />
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
          {errors.assembly && (
            <p className="text-destructive text-sm" role="alert">
              {errors.assembly}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canStart}>
              <Rocket aria-hidden="true" /> {starting ? 'Starting…' : 'Start'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
