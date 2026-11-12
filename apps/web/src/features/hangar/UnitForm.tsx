import { unitFileSchema, type UnitFile, type UnitFileInput } from '@suptron/runtime/browser';
import { Switch } from '@suptron/ui/components/switch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { CheckListEditor } from '../../components/check-list-editor';
import { Field } from '../../components/field';
import { MarkdownField } from '../../components/markdown-field';
import { ModelSelect } from '../../components/model-select';
import { TitleIdFields, withRequiredTitle } from '../../components/title-id-fields';

export type UnitFormHandle = UseFormReturn<UnitFileInput, unknown, UnitFile>;

export function emptyUnit(): UnitFile {
  return {
    name: '',
    title: '',
    model: '',
    mayAskCommander: false,
    doneCondition: [],
    rules: '',
    instructions: '',
  };
}

/** A Unit as the form edits it: a file written before titles existed shows its name as title. */
export function unitForForm(unit: UnitFile): UnitFile {
  return { ...unit, title: unit.title ?? unit.name };
}

export function useUnitForm(defaultValues: UnitFile): UnitFormHandle {
  return useForm<UnitFileInput, unknown, UnitFile>({
    resolver: withRequiredTitle(zodResolver(unitFileSchema)),
    defaultValues,
    mode: 'onChange',
  });
}

/**
 * The Unit form (editors SPEC FR-12): the file is the model, react-hook-form holds it. An existing
 * Unit keeps its ID, because Assemblies mount it by that ID.
 */
export function UnitForm({
  form,
  nameError,
  existing = false,
  takenNames = [],
}: {
  form: UnitFormHandle;
  nameError?: string | null;
  existing?: boolean;
  /** IDs of the other Units, for the live uniqueness check of a new one. */
  takenNames?: readonly string[];
}) {
  const id = useId();
  const errors = form.formState.errors;
  const name = form.watch('name');
  return (
    <div className="flex flex-col gap-6">
      <Controller
        control={form.control}
        name="title"
        render={({ field, fieldState }) => (
          <TitleIdFields
            id={id}
            value={{ title: field.value ?? '', name }}
            onChange={(next) => {
              field.onChange(next.title);
              if (next.name !== name) form.setValue('name', next.name, { shouldDirty: true });
            }}
            onBlur={field.onBlur}
            titleRef={field.ref}
            frozen={existing}
            taken={takenNames}
            titleError={fieldState.error?.message}
            idError={nameError}
          />
        )}
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Controller
            control={form.control}
            name="model"
            render={({ field }) => (
              <Field id={`${id}-model`} label="Model" required error={errors.model?.message}>
                <ModelSelect id={`${id}-model`} value={field.value} onChange={field.onChange} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="mayAskCommander"
            render={({ field }) => (
              <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                <label htmlFor={`${id}-ask`} className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">May ask the Commander</span>
                  <span className="text-muted-foreground text-xs">
                    Default for Slots made from this Unit; a Human Checkpoint stops the Mission
                    until you answer.
                  </span>
                </label>
                <Switch
                  id={`${id}-ask`}
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              </div>
            )}
          />
          <Controller
            control={form.control}
            name="doneCondition"
            render={({ field }) => (
              <Field
                id={`${id}-done`}
                label="Default Done Condition"
                hint="All Checks must hold for a Slot made from this Unit to count as done."
              >
                <CheckListEditor
                  value={field.value ?? []}
                  onChange={field.onChange}
                  label="Done Condition"
                />
              </Field>
            )}
          />
        </div>
        <div className="flex flex-col gap-5">
          <Controller
            control={form.control}
            name="rules"
            render={({ field }) => (
              <Field
                id={`${id}-rules`}
                label="Rules"
                hint="Constraints that hold wherever the Unit is used; a Slot can add Rules but never weaken them."
              >
                <MarkdownField
                  id={`${id}-rules`}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="instructions"
            render={({ field }) => (
              <Field
                id={`${id}-instructions`}
                label="Instructions"
                hint="The job the Unit does; a Slot may append additional Instructions."
              >
                <MarkdownField
                  id={`${id}-instructions`}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />
        </div>
      </div>
    </div>
  );
}
