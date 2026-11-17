import {
  sideSlotName,
  slotAndSideSlotNames,
  type AssemblyFile,
  type Capability,
  type SideSlotFile,
  type SlotFile,
  type SubPilotFile,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { Switch } from '@suptron/ui/components/switch';
import { cn } from '@suptron/ui/lib/utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ModelSelect } from '../../../components/model-select';
import { NameField, nameError } from '../../../components/name-field';
import { UnitPicker } from '../palette/UnitPicker';
import type { AttachedList, Command } from '../model/reducer';
import { earlierSlots, type UnitIndex } from '../model/selectors';
import { ContextFields } from './ContextFields';
import { OverrideField } from './OverrideField';
import { UnitTextAddition } from './UnitTextAddition';

/** A row of the panel to bring into view, as a click on a plate of the clock asks. */
export interface AttachedFocus {
  list: AttachedList;
  index: number;
}

export interface AttachedPanelProps {
  doc: AssemblyFile;
  slot: SlotFile;
  units: UnitIndex;
  capabilities: ReadonlySet<Capability> | null;
  dispatch(cmd: Command): void;
  focus?: AttachedFocus | undefined;
}

/** What a list of Sub-pilots can be told to do; a Slot dispatches commands, a Side Slot patches itself. */
interface SubPilotActions {
  add(unit: string): void;
  patch(index: number, patch: Partial<Omit<SubPilotFile, 'unit'>>): void;
  move(index: number, toIndex: number): void;
  remove(index: number): void;
}

/**
 * The work a Slot carries besides its Pilot: the Sub-pilots its Pilot may call and the Side Slots
 * that start each time it is done.
 */
export function AttachedPanel({
  doc,
  slot,
  units,
  capabilities,
  dispatch,
  focus,
}: AttachedPanelProps) {
  const [picking, setPicking] = useState<AttachedList | null>(null);
  const sideSlots = slot.sideSlots ?? [];
  const slotActions: SubPilotActions = {
    add: (unit) => dispatch({ type: 'addAttached', slot: slot.name, list: 'subPilots', unit }),
    patch: (index, patch) =>
      dispatch({ type: 'patchAttached', slot: slot.name, list: 'subPilots', index, patch }),
    move: (index, toIndex) =>
      dispatch({ type: 'moveAttached', slot: slot.name, list: 'subPilots', index, toIndex }),
    remove: (index) =>
      dispatch({ type: 'removeAttached', slot: slot.name, list: 'subPilots', index }),
  };
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-label="Sub-pilots">
        <Label>Sub-pilots</Label>
        <p className="text-muted-foreground text-xs">
          Units the Pilot may call during an Attempt, several at once if it chooses. The Pilot
          answers for their work; a required one must be called and return in every Attempt.
        </p>
        <SubPilotList
          owner={slot.name}
          items={slot.subPilots ?? []}
          units={units}
          actions={slotActions}
          focusIndex={focus?.list === 'subPilots' ? focus.index : undefined}
        />
      </section>
      <section className="flex flex-col gap-2" aria-label="Side Slots">
        <Label>Side Slots</Label>
        <p className="text-muted-foreground text-xs">
          Units that start one after another each time this Slot is done, beside the Mission, which
          does not wait for them and whose course they never change.
        </p>
        {sideSlots.map((side, index) => (
          <SideSlotRow
            key={index}
            doc={doc}
            slot={slot}
            side={side}
            index={index}
            count={sideSlots.length}
            units={units}
            capabilities={capabilities}
            dispatch={dispatch}
            focused={focus?.list === 'sideSlots' && focus.index === index}
          />
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking('sideSlots')}>
            <Plus aria-hidden="true" /> Add Side Slot
          </Button>
        </div>
      </section>
      <UnitPicker
        open={picking !== null}
        units={[...units.values()]}
        title="Add a Side Slot"
        description="Pick the Unit that starts after this Slot is done."
        onPick={(unit) => {
          dispatch({ type: 'addAttached', slot: slot.name, list: 'sideSlots', unit });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </div>
  );
}

/** Rows of Sub-pilots with an Add button; `owner` names the Slot or Side Slot in the labels. */
function SubPilotList({
  owner,
  items,
  units,
  actions,
  focusIndex,
}: {
  owner: string;
  items: readonly SubPilotFile[];
  units: UnitIndex;
  actions: SubPilotActions;
  focusIndex?: number | undefined;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {items.map((sub, index) => (
        <AttachedRow
          key={index}
          testId="sub-pilot-row"
          label={`Sub-pilot ${sub.unit} of ${owner}`}
          index={index}
          count={items.length}
          onMove={(to) => actions.move(index, to)}
          onRemove={() => actions.remove(index)}
          focused={focusIndex === index}
          title={sub.unit}
        >
          {!units.has(sub.unit) && (
            <p className="text-destructive text-xs">This Unit does not exist in the Hangar.</p>
          )}
          <ModelOverride
            id={`${owner}-sub-${index}-model`}
            value={sub.model}
            inherited={units.get(sub.unit)?.model}
            onChange={(model) => actions.patch(index, { model })}
          />
          <UnitTextAddition
            id={`${owner}-sub-${index}-instructions`}
            kind="Instructions"
            hint="Appended to the Unit's Instructions for this Sub-pilot."
            unitText={units.get(sub.unit)?.instructions}
            value={sub.instructions}
            onChange={(instructions) => actions.patch(index, { instructions })}
          />
          <label className="flex items-center justify-between gap-2 text-sm">
            Required in every Attempt
            <Switch
              checked={sub.required === true}
              aria-label={`Required: ${sub.unit} of ${owner}`}
              onCheckedChange={(v) => actions.patch(index, { required: v ? true : undefined })}
            />
          </label>
        </AttachedRow>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
          <Plus aria-hidden="true" /> Add Sub-pilot
        </Button>
      </div>
      <UnitPicker
        open={picking}
        units={[...units.values()].filter((u) => !items.some((sub) => sub.unit === u.name))}
        title="Add a Sub-pilot"
        description={`Pick the Unit the Pilot of ${owner} may call.`}
        onPick={(unit) => {
          actions.add(unit);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}

/** One Side Slot: its name, model, additions, context and its own Sub-pilots. */
function SideSlotRow({
  doc,
  slot,
  side,
  index,
  count,
  units,
  capabilities,
  dispatch,
  focused,
}: {
  doc: AssemblyFile;
  slot: SlotFile;
  side: SideSlotFile;
  index: number;
  count: number;
  units: UnitIndex;
  capabilities: ReadonlySet<Capability> | null;
  dispatch(cmd: Command): void;
  focused: boolean;
}) {
  const name = sideSlotName(side);
  const unit = units.get(side.unit);
  const patch = (p: Partial<Omit<SideSlotFile, 'unit'>>) =>
    dispatch({ type: 'patchAttached', slot: slot.name, list: 'sideSlots', index, patch: p });
  const subPilots = side.subPilots ?? [];
  const setSubPilots = (next: SubPilotFile[]) =>
    patch({ subPilots: next.length > 0 ? next : undefined });
  const sideActions: SubPilotActions = {
    add: (unitName) => setSubPilots([...subPilots, { unit: unitName }]),
    patch: (i, p) =>
      setSubPilots(subPilots.map((sub, j) => (j === i ? withoutUnset({ ...sub, ...p }) : sub))),
    move: (i, to) => {
      const next = [...subPilots];
      const [item] = next.splice(i, 1);
      next.splice(Math.min(Math.max(0, to), next.length), 0, item!);
      setSubPilots(next);
    },
    remove: (i) => setSubPilots(subPilots.filter((_, j) => j !== i)),
  };
  const readable = [...earlierSlots(doc, slot.name).map((s) => s.name), slot.name];
  return (
    <AttachedRow
      testId="side-slot-row"
      label={`Side Slot ${name}`}
      index={index}
      count={count}
      onMove={(to) =>
        dispatch({ type: 'moveAttached', slot: slot.name, list: 'sideSlots', index, toIndex: to })
      }
      onRemove={() =>
        dispatch({ type: 'removeAttached', slot: slot.name, list: 'sideSlots', index })
      }
      focused={focused}
      title={name}
    >
      <SideSlotNameField key={name} doc={doc} side={side} onCommit={(n) => patch({ name: n })} />
      <div className="flex flex-col gap-1">
        <Label>Unit</Label>
        <Input
          value={side.unit}
          readOnly
          aria-label={`Unit of ${name}`}
          className="font-mono text-sm"
        />
        {!unit && (
          <p className="text-destructive text-xs">This Unit does not exist in the Hangar.</p>
        )}
      </div>
      <ModelOverride
        id={`side-${index}-model`}
        value={side.model}
        inherited={unit?.model}
        onChange={(model) => patch({ model })}
      />
      <UnitTextAddition
        id={`side-${index}-rules`}
        kind="Rules"
        hint="Appended to the Unit's Rules for this Side Slot."
        unitText={unit?.rules}
        value={side.rules}
        onChange={(rules) => patch({ rules })}
      />
      <UnitTextAddition
        id={`side-${index}-instructions`}
        kind="Instructions"
        hint="Appended to the Unit's Instructions for this Side Slot."
        unitText={unit?.instructions}
        value={side.instructions}
        onChange={(instructions) => patch({ instructions })}
      />
      <div className="flex flex-col gap-2">
        <Label>Context</Label>
        <ContextFields
          context={side.context}
          onChange={(context) => patch({ context })}
          capabilities={capabilities}
          readable={readable}
          readableLabel="Slot Outputs of this and earlier Slots"
          label={name}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Sub-pilots of {name}</Label>
        <SubPilotList owner={name} items={subPilots} units={units} actions={sideActions} />
      </div>
    </AttachedRow>
  );
}

/** A Sub-pilot without the keys a patch left undefined, so the file states only what is set. */
function withoutUnset(sub: SubPilotFile): SubPilotFile {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sub)) if (value !== undefined) out[key] = value;
  return out as SubPilotFile;
}

/** The frame of one row: its title, move up and down, remove, and its fields. */
function AttachedRow({
  testId,
  label,
  title,
  index,
  count,
  onMove,
  onRemove,
  focused,
  children,
}: {
  testId: string;
  label: string;
  title: string;
  index: number;
  count: number;
  onMove(toIndex: number): void;
  onRemove(): void;
  focused: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focused]);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-testid={testId}
      data-focused={focused || undefined}
      className={cn(
        'border-border flex flex-col gap-3 rounded-lg border p-3',
        focused && 'ring-primary ring-2',
      )}
    >
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${label} up`}
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move ${label} down`}
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      {children}
    </div>
  );
}

/** The model of a Sub-pilot or a Side Slot: the Unit's, or an override. */
function ModelOverride({
  id,
  value,
  inherited,
  onChange,
}: {
  id: string;
  value: string | undefined;
  inherited: string | undefined;
  onChange(model: string | undefined): void;
}) {
  return (
    <OverrideField
      label="Model"
      source={value !== undefined ? 'slot' : 'unit'}
      inherited={inherited || '(none)'}
      onToggle={(on) => onChange(on ? inherited || undefined : undefined)}
    >
      <ModelSelect id={id} value={value ?? ''} onChange={(model) => onChange(model)} />
    </OverrideField>
  );
}

/**
 * The name of a Side Slot, edited locally and set on blur or Enter. Empty means the Unit's name;
 * a name of another Slot or Side Slot, or `core`, is refused.
 */
function SideSlotNameField({
  doc,
  side,
  onCommit,
}: {
  doc: AssemblyFile;
  side: SideSlotFile;
  onCommit(name: string | undefined): void;
}) {
  const current = sideSlotName(side);
  const [draft, setDraft] = useState(current);
  const effective = draft.trim() === '' ? side.unit : draft.trim();
  const taken =
    effective !== current &&
    (effective === 'core' || slotAndSideSlotNames(doc).includes(effective));
  const error = taken ? 'Another Slot or Side Slot has this name' : nameError(effective);
  const commit = () => {
    if (error || effective === current) return;
    onCommit(effective === side.unit ? undefined : effective);
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`side-name-${current}`}>Name</Label>
      <NameField
        id={`side-name-${current}`}
        value={draft}
        // An empty draft is allowed (the Unit's name); NameField would call it missing.
        error={error ?? ''}
        placeholder={side.unit}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}
