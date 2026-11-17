import { checkDescriptor } from '../checks/catalogue.js';
import { CORE_SLOT_NAME } from '../domain/mission.js';
import {
  CONTEXT_SOURCE_REQUIREMENTS,
  describeCapability,
  missingCapabilities,
  type Capability,
  type ContextSource,
} from '../workspace/kinds.js';
import type { AssemblyFile, Check, Issue, SlotFile, SubPilotFile, UnitFile } from './schemas.js';
import { sideSlotName } from './slot-names.js';

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
  errors.push(...attachedWorkIssues(slots, indexOf, unitsByName, capabilities));

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
    // The placed Slot's resolved Done Condition is judged, never the Unit on its own (FR-8).
    const doneCondition = slot.doneCondition ?? unit?.doneCondition ?? [];
    errors.push(
      ...systemChecks(slot.name, doneCondition, 'doneCondition'),
      ...systemChecks(slot.name, slot.exitCondition ?? [], 'exitCondition'),
      ...systemChecks(slot.name, slot.loop?.acceptCondition ?? [], 'loop.acceptCondition'),
    );
    if (capabilities) {
      errors.push(
        ...unavailableChecks(slot.name, doneCondition, 'doneCondition', capabilities),
        ...unavailableChecks(slot.name, slot.exitCondition ?? [], 'exitCondition', capabilities),
        ...unavailableChecks(
          slot.name,
          slot.loop?.acceptCondition ?? [],
          'loop.acceptCondition',
          capabilities,
        ),
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

/** A system Check is put into a Done Condition by the snapshot; a file never names one. */
function systemChecks(
  slotName: string,
  condition: readonly Check[],
  field: 'doneCondition' | 'exitCondition' | 'loop.acceptCondition',
): Issue[] {
  return condition.flatMap((check, index) =>
    checkDescriptor(check.kind).system
      ? [
          {
            code: 'system_check_in_condition',
            message: `Slot "${slotName}" names the Check "${checkDescriptor(check.kind).label}", which only the system adds`,
            slotName,
            path: `${field}[${index}]`,
          },
        ]
      : [],
  );
}

/**
 * The Sub-pilots and Side Slots of every Slot: their Units exist, a Unit is a Sub-pilot at most
 * once per list (the Engine calls it by that name), a Side Slot's name is unique among Slots and
 * Side Slots and is not `core`, and a Side Slot reads only Slot Outputs of its parent Slot or an
 * earlier one. Every Issue is filed under the parent Slot.
 */
function attachedWorkIssues(
  slots: readonly SlotFile[],
  indexOf: ReadonlyMap<string, number>,
  unitsByName: ReadonlyMap<string, ValidationUnit>,
  capabilities: ReadonlySet<Capability> | null,
): Issue[] {
  const issues: Issue[] = [];
  const taken = new Set([CORE_SLOT_NAME, ...indexOf.keys()]);
  slots.forEach((slot, index) => {
    issues.push(...subPilotIssues(slot.name, slot.subPilots ?? [], 'subPilots', unitsByName));
    (slot.sideSlots ?? []).forEach((side, sideIndex) => {
      const path = `sideSlots[${sideIndex}]`;
      const name = sideSlotName(side);
      if (!unitsByName.has(side.unit)) {
        issues.push({
          code: 'unknown_unit',
          message: `Side Slot "${name}" of Slot "${slot.name}" uses an unknown Unit "${side.unit}"`,
          slotName: slot.name,
          path: `${path}.unit`,
        });
      }
      if (taken.has(name)) {
        issues.push({
          code: 'duplicate_side_slot_name',
          message: `Side Slot name "${name}" of Slot "${slot.name}" is already used by a Slot, a Side Slot or the Core`,
          slotName: slot.name,
          path: `${path}.name`,
        });
      }
      taken.add(name);
      for (const ref of side.context?.slotOutputs ?? []) {
        const target = indexOf.get(ref);
        if (target === undefined) {
          issues.push({
            code: 'context_reference_missing',
            message: `Side Slot "${name}" reads the Slot Output of a missing Slot "${ref}"`,
            slotName: slot.name,
            path: `${path}.context.slotOutputs`,
          });
        } else if (target > index) {
          issues.push({
            code: 'context_reference_not_earlier',
            message: `Side Slot "${name}" reads the Slot Output of "${ref}", which comes after its Slot "${slot.name}"`,
            slotName: slot.name,
            path: `${path}.context.slotOutputs`,
          });
        }
      }
      issues.push(
        ...subPilotIssues(slot.name, side.subPilots ?? [], `${path}.subPilots`, unitsByName),
      );
      if (capabilities) {
        issues.push(
          ...unavailableContextSources(slot.name, side.context ?? {}, capabilities, `${path}.`),
        );
      }
    });
  });
  return issues;
}

/** An unknown Unit, or a Unit listed twice, among the Sub-pilots of one Slot or Side Slot. */
function subPilotIssues(
  slotName: string,
  subPilots: readonly SubPilotFile[],
  path: string,
  unitsByName: ReadonlyMap<string, ValidationUnit>,
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  subPilots.forEach((sub, index) => {
    if (!unitsByName.has(sub.unit)) {
      issues.push({
        code: 'unknown_unit',
        message: `A Sub-pilot of Slot "${slotName}" uses an unknown Unit "${sub.unit}"`,
        slotName,
        path: `${path}[${index}].unit`,
      });
    }
    if (seen.has(sub.unit)) {
      issues.push({
        code: 'duplicate_sub_pilot',
        message: `The Unit "${sub.unit}" is a Sub-pilot of Slot "${slotName}" more than once`,
        slotName,
        path: `${path}[${index}].unit`,
      });
    }
    seen.add(sub.unit);
  });
  return issues;
}

function unavailableChecks(
  slotName: string,
  condition: readonly Check[],
  field: 'doneCondition' | 'exitCondition' | 'loop.acceptCondition',
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
  pathPrefix = '',
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
      path: `${pathPrefix}context.${source}`,
    });
  }
  return issues;
}
