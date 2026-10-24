import {
  DEFAULTS,
  summarizeCondition,
  type AssemblyFile,
  type Check,
  type SlotFile,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Checkbox } from '@suptron/ui/components/checkbox';
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
import { useState } from 'react';
import { CheckListEditor } from '../../../components/check-list-editor';
import { MarkdownField } from '../../../components/markdown-field';
import { ModelSelect } from '../../../components/model-select';
import { NameField, nameError } from '../../../components/name-field';
import type { InspectorTab } from '../editor-state';
import type { Command } from '../model/reducer';
import { earlierSlots, effectiveSlot, isLastSlot, type UnitIndex } from '../model/selectors';
import type { EditorIssues } from '../model/validate';
import { CoreDirectivesPanel } from './CoreDirectivesPanel';
import { OverrideField } from './OverrideField';

export interface InspectorProps {
  doc: AssemblyFile;
  units: UnitIndex;
  issues: EditorIssues;
  selected: string | 'core';
  tab: InspectorTab;
  onTab(tab: InspectorTab): void;
  dispatch(cmd: Command): void;
  onClose(): void;
}

/** The right-side inspector of the selected Slot (FR-31 to FR-35) or the Core Directives (FR-19). */
export function Inspector(props: InspectorProps) {
  const { doc, selected, dispatch, onClose } = props;
  const slot = selected === 'core' ? null : doc.slots.find((s) => s.name === selected);
  return (
    <aside
      className="border-border bg-background flex w-80 shrink-0 flex-col overflow-y-auto border-l"
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
  );
}

function SlotInspector({
  doc,
  units,
  issues,
  slot,
  tab,
  onTab,
  dispatch,
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
                    v === DEFAULTS.slot.memoryMode ? undefined : (v as SlotFile['memoryMode']),
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-instructions">Additional Instructions</Label>
            <p className="text-muted-foreground text-xs">Appended to the Unit's Instructions.</p>
            <MarkdownField
              id="slot-instructions"
              value={slot.instructions ?? ''}
              onChange={(e) =>
                patch({ instructions: e.target.value === '' ? undefined : e.target.value })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="context" className="flex flex-col gap-3 pt-2">
          {(['taskDocuments', 'knowledgeSources', 'checkout', 'gitConventions'] as const).map(
            (key) => {
              const labels = {
                taskDocuments: 'Task documents',
                knowledgeSources: 'Knowledge Sources',
                checkout: 'Checkout',
                gitConventions: 'Git conventions',
              };
              const value = slot.context?.[key] ?? DEFAULTS.slot.context[key];
              return (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  {labels[key]}
                  <Switch
                    checked={value}
                    aria-label={labels[key]}
                    onCheckedChange={(v) =>
                      patch({
                        context: cleanContext({
                          ...slot.context,
                          [key]: v === DEFAULTS.slot.context[key] ? undefined : v,
                        }),
                      })
                    }
                  />
                </label>
              );
            },
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Label>Slot Outputs of earlier Slots</Label>
            {earlier.length === 0 && (
              <p className="text-muted-foreground text-xs">No earlier Slots.</p>
            )}
            {earlier.map((e) => {
              const checked = slot.context?.slotOutputs?.includes(e.name) ?? false;
              return (
                <label key={e.name} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    aria-label={`Read the Slot Output of ${e.name}`}
                    onCheckedChange={(v) => {
                      const current = slot.context?.slotOutputs ?? [];
                      const next =
                        v === true ? [...current, e.name] : current.filter((n) => n !== e.name);
                      patch({
                        context: cleanContext({
                          ...slot.context,
                          slotOutputs: next.length > 0 ? next : undefined,
                        }),
                      });
                    }}
                  />
                  {e.name}
                </label>
              );
            })}
          </div>
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
                          : { target: v, limit: slot.loop?.limit ?? defaultLoopLimit },
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
                    <Label htmlFor="loop-limit">Iteration limit</Label>
                    <Input
                      id="loop-limit"
                      type="number"
                      min={1}
                      value={slot.loop.limit ?? defaultLoopLimit}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        dispatch({
                          type: 'setLoop',
                          name: slot.name,
                          loop: {
                            target: slot.loop!.target,
                            limit: Number.isFinite(n) && n > 0 ? n : defaultLoopLimit,
                          },
                        });
                      }}
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
            <Input
              id="attempt-limit"
              type="number"
              min={1}
              placeholder={String(effective.attemptLimit.inherited)}
              value={slot.attemptLimit ?? ''}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                patch({
                  attemptLimit:
                    e.target.value.trim() === '' || !Number.isFinite(n) || n < 1 ? undefined : n,
                });
              }}
            />
            <p className="text-muted-foreground text-xs">
              Default from the Core Directives: {effective.attemptLimit.inherited}.
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
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cleanContext(context: NonNullable<SlotFile['context']>): SlotFile['context'] {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? (out as SlotFile['context']) : undefined;
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
