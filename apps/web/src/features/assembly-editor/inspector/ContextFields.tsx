import {
  CONTEXT_SOURCE_REQUIREMENTS,
  DEFAULTS,
  missingCapabilities,
  type Capability,
  type SlotContextFile,
} from '@suptron/runtime/browser';
import { Checkbox } from '@suptron/ui/components/checkbox';
import { Label } from '@suptron/ui/components/label';
import { Switch } from '@suptron/ui/components/switch';

const CONTEXT_SWITCHES = ['taskDocuments', 'knowledgeSources', 'gitConventions'] as const;
const CONTEXT_LABELS: Record<(typeof CONTEXT_SWITCHES)[number], string> = {
  taskDocuments: 'Task documents',
  knowledgeSources: 'Knowledge Sources',
  gitConventions: 'Git conventions',
};

/** A context without its unset keys; undefined when nothing is left, so the file states none. */
export function cleanContext(context: SlotContextFile): SlotContextFile | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? (out as SlotContextFile) : undefined;
}

/**
 * The context sources of a Slot or a Side Slot: a switch per source the Workspace can feed, and
 * the Slot Outputs it may read. `label` tells apart the fields of several holders on one panel.
 */
export function ContextFields({
  context,
  onChange,
  capabilities,
  readable,
  readableLabel,
  label = '',
}: {
  context: SlotContextFile | undefined;
  onChange(context: SlotContextFile | undefined): void;
  capabilities: ReadonlySet<Capability> | null;
  readable: readonly string[];
  readableLabel: string;
  label?: string;
}) {
  // A source the Workspace cannot feed is not offered (SPEC FR-7); a file that still names it is invalid.
  const switches = CONTEXT_SWITCHES.filter(
    (key) =>
      capabilities === null ||
      missingCapabilities(CONTEXT_SOURCE_REQUIREMENTS[key], capabilities).length === 0,
  );
  const suffix = label === '' ? '' : ` (${label})`;
  return (
    <>
      {switches.map((key) => {
        const value = context?.[key] ?? DEFAULTS.slot.context[key];
        return (
          <label key={key} className="flex items-center justify-between gap-2 text-sm">
            {CONTEXT_LABELS[key]}
            <Switch
              checked={value}
              aria-label={`${CONTEXT_LABELS[key]}${suffix}`}
              onCheckedChange={(v) =>
                onChange(
                  cleanContext({
                    ...context,
                    [key]: v === DEFAULTS.slot.context[key] ? undefined : v,
                  }),
                )
              }
            />
          </label>
        );
      })}
      <div className="flex flex-col gap-2 pt-2">
        <Label>{readableLabel}</Label>
        {readable.length === 0 && (
          <p className="text-muted-foreground text-xs">No earlier Slots.</p>
        )}
        {readable.map((name) => {
          const checked = context?.slotOutputs?.includes(name) ?? false;
          return (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checked}
                aria-label={`Read the Slot Output of ${name}${suffix}`}
                onCheckedChange={(v) => {
                  const current = context?.slotOutputs ?? [];
                  const next = v === true ? [...current, name] : current.filter((n) => n !== name);
                  onChange(
                    cleanContext({ ...context, slotOutputs: next.length > 0 ? next : undefined }),
                  );
                }}
              />
              {name}
            </label>
          );
        })}
      </div>
    </>
  );
}
