import type { AssemblyFile, Issue } from './schemas.js';

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

/**
 * The one validation function of an Assembly, shared by the loader, the server and the editors.
 * Hard errors mirror the editors SPEC FR-37; warnings never block a Save.
 */
export function validateAssembly(
  assembly: AssemblyFile,
  units: readonly Pick<{ name: string }, 'name'>[],
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const unitNames = new Set(units.map((u) => u.name));
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
    if (!unitNames.has(slot.unit)) {
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
