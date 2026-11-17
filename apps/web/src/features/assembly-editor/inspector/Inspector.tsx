import {
  DEFAULTS,
  defaultMemoryMode,
  resolveCore,
  resolveSlot,
  summarizeCondition,
  type AssemblyFile,
  type Capability,
  type Check,
  type SlotFile,
  type UnitFile,
} from '@suptron/runtime/browser';
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
import { Switch } from '@suptron/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@suptron/ui/components/tabs';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CheckListEditor } from '../../../components/check-list-editor';
import { LimitField } from '../../../components/limit-field';
import { PromptPreviewButton } from '../../../components/prompt-preview-dialog';
import { ModelSelect } from '../../../components/model-select';
import { NameField, nameError } from '../../../components/name-field';
import { clampWidth, useWidthDrag } from '../../../lib/use-width-drag';
import type { InspectorTab } from '../editor-state';
import type { Command } from '../model/reducer';
import { earlierSlots, effectiveSlot, isLastSlot, type UnitIndex } from '../model/selectors';
import type { EditorIssues } from '../model/validate';
import { AttachedPanel, type AttachedFocus } from './AttachedPanel';
import { ContextFields } from './ContextFields';
import { CoreDirectivesPanel } from './CoreDirectivesPanel';
import { OverrideField } from './OverrideField';
import { UnitTextAddition } from './UnitTextAddition';

export interface InspectorProps {
  doc: AssemblyFile;
  units: UnitIndex;
  /** What the Project's Workspace provides; null while its Profile is invalid (everything is offered). */
  capabilities: ReadonlySet<Capability> | null;
  issues: EditorIssues;
  selected: string | 'core';
  tab: InspectorTab;
  onTab(tab: InspectorTab): void;
  dispatch(cmd: Command): void;
  onClose(): void;
  attachedFocus?: AttachedFocus | undefined;
}

const WIDTH_STORAGE_KEY = 'suptron.inspectorWidth';
const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
/** Wide enough for Rules, Instructions and Checks to read as text, not as a column of words. */
const DEFAULT_WIDTH = 480;

function readWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    if (stored > 0) return clampWidth(stored, MIN_WIDTH, MAX_WIDTH);
  } catch {
    // storage unavailable: the default width
  }
  return DEFAULT_WIDTH;
}

function writeWidth(width: number): void {
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // a convenience only
  }
}

/** The right-side inspector of the selected Slot (FR-31 to FR-35) or the Core Directives (FR-19). */
export function Inspector(props: InspectorProps) {
  const { doc, selected, dispatch, onClose } = props;
  const slot = selected === 'core' ? null : doc.slots.find((s) => s.name === selected);
  const [width, setWidth] = useState(readWidth);
  useEffect(() => writeWidth(width), [width]);
  const drag = useWidthDrag(width, setWidth, {
    min: MIN_WIDTH,
    max: MAX_WIDTH,
  });
  return (
    <div className="flex shrink-0" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the Inspector"
        className="hover:bg-primary/40 w-1.5 shrink-0 cursor-col-resize"
        data-testid="inspector-divider"
        {...drag}
      />
      <aside
        className="border-border bg-background flex min-w-0 flex-1 flex-col overflow-y-auto border-l"
        aria-label="Inspector"
        data-testid="inspector"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {selected === 'core' ? 'Core' : 'Slot'}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="px-4 pb-6">
          {selected === 'core' ? (
            <CoreDirectivesPanel doc={doc} dispatch={dispatch} />
          ) : slot ? (
            <SlotInspector {...props} slot={slot} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function SlotInspector({
  doc,
  units,
  capabilities,
  issues,
  slot,
  tab,
  onTab,
  dispatch,
  attachedFocus,
}: InspectorProps & { slot: SlotFile }) {
  const effective = effectiveSlot(doc, slot, units);
  const unit = units.get(slot.unit);
  const earlier = earlierSlots(doc, slot.name);
  const last = isLastSlot(doc, slot.name);
  const slotIssues = issues.bySlot.get(slot.name) ?? [];
  const patch = (p: Partial<Omit<SlotFile, 'name' | 'unit'>>) =>
    dispatch({ type: 'patchSlot', name: slot.name, patch: p });
  const defaultLoopLimit = doc.core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="truncate text-lg font-bold">{slot.name}</h2>
      {slotIssues.length > 0 && (
        <ul className="text-destructive flex flex-col gap-1 text-xs" data-testid="inspector-issues">
          {slotIssues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
      <Tabs value={tab} onValueChange={(v) => onTab(v as InspectorTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="loop">Loop</TabsTrigger>
          <TabsTrigger value="exit">Exit</TabsTrigger>
          <TabsTrigger value="attached">Attached</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="flex flex-col gap-4 pt-2">
          <SlotNameField key={slot.name} doc={doc} slot={slot} dispatch={dispatch} />
          <div className="flex flex-col gap-1">
            <Label>Unit</Label>
            <Input value={slot.unit} readOnly aria-label="Unit" className="font-mono text-sm" />
            {!unit && (
              <p className="text-destructive text-xs">This Unit does not exist in the Hangar.</p>
            )}
          </div>
          <OverrideField
            label="Model"
            source={effective.model.source}
            inherited={effective.model.inherited || '(none)'}
            onToggle={(on) =>
              patch({ model: on ? effective.model.inherited || undefined : undefined })
            }
          >
            <ModelSelect
              id="slot-model"
              value={slot.model ?? ''}
              onChange={(model) => patch({ model })}
            />
          </OverrideField>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-memory">Memory Mode</Label>
            <Select
              value={effective.memoryMode.value}
              onValueChange={(v) =>
                patch({
                  memoryMode:
                    v === defaultMemoryMode(effective.mayAskCommander.value)
                      ? undefined
                      : (v as SlotFile['memoryMode']),
                })
              }
            >
              <SelectTrigger id="slot-memory" aria-label="Memory Mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fresh">fresh (new agent on every execution)</SelectItem>
                <SelectItem value="persistent">persistent (keeps its session)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Default: {defaultMemoryMode(effective.mayAskCommander.value)}
              {effective.mayAskCommander.value
                ? ' (a Slot that may ask the Commander keeps its session)'
                : ''}
            </p>
          </div>
          <OverrideField
            label="May ask the Commander"
            source={effective.mayAskCommander.source}
            inherited={effective.mayAskCommander.inherited ? 'yes' : 'no'}
            onToggle={(on) =>
              patch({ mayAskCommander: on ? effective.mayAskCommander.inherited : undefined })
            }
          >
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={slot.mayAskCommander ?? false}
                onCheckedChange={(v) => patch({ mayAskCommander: v })}
                aria-label="May ask the Commander"
              />
              {slot.mayAskCommander ? 'may ask' : 'never asks'}
            </label>
          </OverrideField>
          <UnitTextAddition
            id="slot-rules"
            kind="Rules"
            hint="Appended to the Unit's Rules: tighten them, never loosen them."
            unitText={unit?.rules}
            value={slot.rules}
            onChange={(rules) => patch({ rules })}
          />
          <UnitTextAddition
            id="slot-instructions"
            kind="Instructions"
            hint="Appended to the Unit's Instructions."
            unitText={unit?.instructions}
            value={slot.instructions}
            onChange={(instructions) => patch({ instructions })}
          />
          {unit && <SlotPromptButton doc={doc} slot={slot} unit={unit} units={units} last={last} />}
        </TabsContent>

        <TabsContent value="context" className="flex flex-col gap-3 pt-2">
          <ContextFields
            context={slot.context}
            onChange={(context) => patch({ context })}
            capabilities={capabilities}
            readable={earlier.map((e) => e.name)}
            readableLabel="Slot Outputs of earlier Slots"
          />
        </TabsContent>

        <TabsContent value="done" className="pt-2">
          <OverrideField
            label="Done Condition"
            source={effective.doneCondition.source}
            inherited={summarizeCondition(effective.doneCondition.inherited) || 'always done'}
            onToggle={(on) =>
              patch({ doneCondition: on ? [...effective.doneCondition.inherited] : undefined })
            }
          >
            <CheckListEditor
              value={slot.doneCondition ?? []}
              onChange={(doneCondition: Check[]) => patch({ doneCondition })}
              label="Done Condition"
              capabilities={capabilities}
            />
          </OverrideField>
        </TabsContent>

        <TabsContent value="loop" className="flex flex-col gap-3 pt-2">
          {earlier.length === 0 && !slot.loop ? (
            <p className="text-muted-foreground text-sm">
              The first Slot has nowhere to loop back to.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="loop-target">On failure, go back to</Label>
                <Select
                  value={slot.loop?.target ?? '__none__'}
                  onValueChange={(v) =>
                    dispatch({
                      type: 'setLoop',
                      name: slot.name,
                      loop:
                        v === '__none__'
                          ? null
                          : {
                              target: v,
                              limit: slot.loop?.limit,
                              acceptCondition: slot.loop?.acceptCondition ?? [],
                            },
                    })
                  }
                >
                  <SelectTrigger id="loop-target" aria-label="Loop target" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No Loop (retry this Slot)</SelectItem>
                    {/* An invalid forward target stays listed so the select shows what the file says. */}
                    {slot.loop && !earlier.some((e) => e.name === slot.loop!.target) && (
                      <SelectItem value={slot.loop.target}>
                        {slot.loop.target} (not earlier)
                      </SelectItem>
                    )}
                    {earlier.map((e) => (
                      <SelectItem key={e.name} value={e.name}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {slot.loop && (
                <>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="loop-limit">Loop limit</Label>
                    <p className="text-muted-foreground text-xs">
                      How many times the work may go back to the target. At the limit the Core
                      decides: one more round with its note, or Needs Attention.
                    </p>
                    <LimitField
                      id="loop-limit"
                      min={1}
                      value={slot.loop.limit}
                      defaultValue={defaultLoopLimit}
                      onChange={(limit) =>
                        dispatch({
                          type: 'setLoop',
                          name: slot.name,
                          loop: {
                            target: slot.loop!.target,
                            limit,
                            acceptCondition: slot.loop!.acceptCondition ?? [],
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>At the limit, accept when</Label>
                    <p className="text-muted-foreground text-xs">
                      Judged only when the limit is exhausted and the Done Condition still fails.
                      When it holds the Slot counts as done; empty means Needs Attention.
                    </p>
                    <CheckListEditor
                      value={slot.loop.acceptCondition ?? []}
                      onChange={(acceptCondition: Check[]) =>
                        dispatch({
                          type: 'setLoop',
                          name: slot.name,
                          loop: {
                            target: slot.loop!.target,
                            limit: slot.loop!.limit,
                            acceptCondition,
                          },
                        })
                      }
                      label="Accept Condition"
                      capabilities={capabilities}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => dispatch({ type: 'setLoop', name: slot.name, loop: null })}
                  >
                    Remove Loop
                  </Button>
                </>
              )}
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="attempt-limit">Attempt limit</Label>
            <LimitField
              id="attempt-limit"
              min={1}
              value={slot.attemptLimit}
              defaultValue={effective.attemptLimit.inherited}
              onChange={(attemptLimit) => patch({ attemptLimit })}
            />
            <p className="text-muted-foreground text-xs">
              Default from the Core Directives: {effective.attemptLimit.inherited}.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex items-center justify-between gap-2 text-sm">
              Do not run again
              <Switch
                checked={slot.skipWhenDone === true}
                aria-label="Do not run again"
                onCheckedChange={(v) => patch({ skipWhenDone: v ? true : undefined })}
              />
            </label>
            <p className="text-muted-foreground text-xs">
              Once this Slot is done, the Loop of a later Slot passes it by: it keeps its last Slot
              Output. Its own Loop works as before.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="exit" className="flex flex-col gap-3 pt-2">
          <label className="flex items-center justify-between gap-2 text-sm">
            Exit Point
            <Switch
              checked={last || slot.exitPoint === true}
              disabled={last}
              aria-label="Exit Point"
              onCheckedChange={(v) => patch({ exitPoint: v ? true : undefined })}
            />
          </label>
          {last && (
            <p className="text-muted-foreground text-xs">The last Slot is always an Exit Point.</p>
          )}
          <div className="flex flex-col gap-1">
            <Label>Exit Condition</Label>
            <p className="text-muted-foreground text-xs">
              {last
                ? 'Optional on the last Slot: empty means "exit as soon as the Slot is done".'
                : 'Required on an Exit Point before the last Slot.'}
            </p>
            <CheckListEditor
              value={slot.exitCondition ?? []}
              onChange={(exitCondition: Check[]) =>
                patch({ exitCondition: exitCondition.length > 0 ? exitCondition : undefined })
              }
              disabled={!last && slot.exitPoint !== true}
              label="Exit Condition"
              capabilities={capabilities}
            />
          </div>
        </TabsContent>

        <TabsContent value="attached" className="pt-2">
          <AttachedPanel
            doc={doc}
            slot={slot}
            units={units}
            capabilities={capabilities}
            dispatch={dispatch}
            focus={attachedFocus}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Edits the Slot name locally and renames on blur or Enter, so references are rewritten once (keyed by the Slot name). */
function SlotNameField({
  doc,
  slot,
  dispatch,
}: {
  doc: AssemblyFile;
  slot: SlotFile;
  dispatch: (cmd: Command) => void;
}) {
  const [draft, setDraft] = useState(slot.name);
  const taken = draft !== slot.name && doc.slots.some((s) => s.name === draft);
  const error = taken ? 'Another Slot has this name' : nameError(draft);
  const commit = () => {
    if (!error && draft !== slot.name)
      dispatch({ type: 'renameSlot', name: slot.name, newName: draft });
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="slot-name">Name</Label>
      <NameField
        id="slot-name"
        value={draft}
        error={error}
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

/** The Pilot's system text as a Mission would build it, unsaved edits included. */
function SlotPromptButton({
  doc,
  slot,
  unit,
  units,
  last,
}: {
  doc: AssemblyFile;
  slot: SlotFile;
  unit: UnitFile;
  units: UnitIndex;
  last: boolean;
}) {
  const resolved = resolveSlot(slot, unit, resolveCore(doc.core), last, [...units.values()]);
  return (
    <div>
      <PromptPreviewButton
        title={`Prompt of ${slot.name}`}
        request={{
          role: 'pilot',
          rules: resolved.rules,
          instructions: resolved.instructions,
          allowQuestions: resolved.mayAskCommander,
        }}
      />
    </div>
  );
}
