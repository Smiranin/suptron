import { checkDescriptor } from '../checks/catalogue.js';
import {
  CONTEXT_SOURCE_REQUIREMENTS,
  describeCapability,
  missingCapabilities,
  type Capability,
  type ContextSource,
} from '../workspace/kinds.js';
import type { AssemblyFile, Check, Issue, UnitFile } from './schemas.js';

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

/** What the validator needs of a Unit: its name and the Done Condition a Slot inherits (FR-8). */
export type ValidationUnit = Pick<UnitFile, 'name' | 'doneCondition'>;

const CONTEXT_SOURCE_LABELS: Record<ContextSource, string> = {
  taskDocuments: 'the Task documents',
  knowledgeSources: 'the Knowledge Sources',
  gitConventions: 'the Git conventions',
  slotOutputs: 'the Slot Outputs',
};

/**
 * The one validation function of an Assembly, shared by the loader, the server and the editors.
 * Hard errors mirror the editors SPEC FR-37; warnings never block a Save.
 *
 * `capabilities` is what the Project's Workspace provides; `null` means the Profile is invalid
 * and the capability rules are skipped (the Profile problem is reported on the Project).
 */
export function validateAssembly(
  assembly: AssemblyFile,
  units: readonly ValidationUnit[],
  capabilities: ReadonlySet<Capability> | null,
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const unitsByName = new Map(units.map((u) => [u.name, u]));
  const slots = assembly.slots;
  const indexOf = new Map<string, number>();
  slots.forEach((slot, index) => {
    if (indexOf.has(slot.name)) {
      errors.push({
        code: 'duplicate_slot_name',
        message: `Slot name "${slot.name}" is used more than once`,
        slotName: slot.name,
      });
    } else {
      indexOf.set(slot.name, index);
    }
  });

  if (slots.length === 0) {
    errors.push({ code: 'no_slots', message: 'The Assembly has no Slots' });
  }

  slots.forEach((slot, index) => {
    const isLast = index === slots.length - 1;
    const unit = unitsByName.get(slot.unit);
    if (!unit) {
      errors.push({
        code: 'unknown_unit',
        message: `Slot "${slot.name}" uses an unknown Unit "${slot.unit}"`,
        slotName: slot.name,
      });
    }
    if (slot.loop) {
      const target = indexOf.get(slot.loop.target);
      if (target === undefined) {
        errors.push({
          code: 'loop_target_missing',
          message: `Slot "${slot.name}" loops to a missing Slot "${slot.loop.target}"`,
          slotName: slot.name,
        });
      } else if (target >= index) {
        errors.push({
          code: 'loop_target_not_earlier',
          message:
            target === index
              ? `Slot "${slot.name}" loops to itself`
              : `Slot "${slot.name}" loops to a later Slot "${slot.loop.target}"`,
          slotName: slot.name,
        });
      }
    }
    for (const ref of slot.context?.slotOutputs ?? []) {
      const target = indexOf.get(ref);
      if (target === undefined) {
        errors.push({
          code: 'context_reference_missing',
          message: `Slot "${slot.name}" reads the Slot Output of a missing Slot "${ref}"`,
          slotName: slot.name,
        });
      } else if (target >= index) {
        errors.push({
          code: 'context_reference_not_earlier',
          message: `Slot "${slot.name}" reads the Slot Output of "${ref}", which is not an earlier Slot`,
          slotName: slot.name,
        });
      }
    }
    if (slot.exitPoint && !isLast && (slot.exitCondition ?? []).length === 0) {
      errors.push({
        code: 'exit_condition_required',
        message: `Slot "${slot.name}" is an Exit Point before the last Slot and needs a non-empty Exit Condition`,
        slotName: slot.name,
      });
    }
    if (isLast && slot.exitPoint === false) {
      errors.push({
        code: 'last_slot_not_exit_point',
        message: `The last Slot "${slot.name}" must be an Exit Point`,
        slotName: slot.name,
      });
    }
    if (capabilities) {
      // The placed Slot's resolved Done Condition is judged, never the Unit on its own (FR-8).
      const doneCondition = slot.doneCondition ?? unit?.doneCondition ?? [];
      errors.push(
        ...unavailableChecks(slot.name, doneCondition, 'doneCondition', capabilities),
        ...unavailableChecks(slot.name, slot.exitCondition ?? [], 'exitCondition', capabilities),
        ...unavailableContextSources(slot.name, slot.context ?? {}, capabilities),
      );
    }
  });

  // A Slot Output nobody reads, neither by name nor through the Slot's own Loop feedback.
  slots.forEach((slot, index) => {
    const isLast = index === slots.length - 1;
    if (isLast || slot.loop) return;
    const read = slots
      .slice(index + 1)
      .some((later) => (later.context?.slotOutputs ?? []).includes(slot.name));
    if (!read) {
      warnings.push({
        code: 'unread_slot_output',
        message: `No later Slot reads the Slot Output of "${slot.name}"`,
        slotName: slot.name,
      });
    }
  });

  return { errors, warnings };
}

function unavailableChecks(
  slotName: string,
  condition: readonly Check[],
  field: 'doneCondition' | 'exitCondition',
  capabilities: ReadonlySet<Capability>,
): Issue[] {
  return condition.flatMap((check, index) => {
    const descriptor = checkDescriptor(check.kind);
    const missing = missingCapabilities(descriptor.requires, capabilities);
    if (missing.length === 0) return [];
    return [
      {
        code: 'check_unavailable',
        message: `Slot "${slotName}" uses the Check "${descriptor.label}", which needs ${missing
          .map(describeCapability)
          .join(' and ')} this Project's Workspace does not provide`,
        slotName,
        path: `${field}[${index}]`,
      },
    ];
  });
}

function unavailableContextSources(
  slotName: string,
  context: NonNullable<AssemblyFile['slots'][number]['context']>,
  capabilities: ReadonlySet<Capability>,
): Issue[] {
  const issues: Issue[] = [];
  for (const source of Object.keys(CONTEXT_SOURCE_REQUIREMENTS) as ContextSource[]) {
    if (context[source] !== true) continue;
    const missing = missingCapabilities(CONTEXT_SOURCE_REQUIREMENTS[source], capabilities);
    if (missing.length === 0) continue;
    issues.push({
      code: 'context_source_unavailable',
      message: `Slot "${slotName}" reads ${CONTEXT_SOURCE_LABELS[source]}, which need ${missing
        .map(describeCapability)
        .join(' and ')} this Project's Workspace does not provide`,
      slotName,
      path: `context.${source}`,
    });
  }
  return issues;
}
