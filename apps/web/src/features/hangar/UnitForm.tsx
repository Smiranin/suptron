import { unitFileSchema, type UnitFile, type UnitFileInput } from '@suptron/runtime/browser';
import { Switch } from '@suptron/ui/components/switch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { CheckListEditor } from '../../components/check-list-editor';
import { Field } from '../../components/field';
import { MarkdownField } from '../../components/markdown-field';
import { ModelSelect } from '../../components/model-select';
import { NameField } from '../../components/name-field';

export type UnitFormHandle = UseFormReturn<UnitFileInput, unknown, UnitFile>;

export function emptyUnit(): UnitFile {
  return {
    name: '',
    model: '',
    mayAskCommander: false,
    doneCondition: [],
    rules: '',
    instructions: '',
  };
}

export function useUnitForm(defaultValues: UnitFile): UnitFormHandle {
  return useForm<UnitFileInput, unknown, UnitFile>({
    resolver: zodResolver(unitFileSchema),
    defaultValues,
    mode: 'onChange',
  });
}

/** The Unit form (editors SPEC FR-12): the file is the model, react-hook-form holds it. */
export function UnitForm({ form, nameError }: { form: UnitFormHandle; nameError?: string | null }) {
  const id = useId();
  const errors = form.formState.errors;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Field
              id={`${id}-name`}
              label="Name"
              hint="The file basename in the Hangar; renaming moves the file."
            >
              <NameField
                id={`${id}-name`}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={nameError}
              />
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="model"
          render={({ field }) => (
            <Field id={`${id}-model`} label="Model" error={errors.model?.message}>
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
                  Default for Slots made from this Unit; a Human Checkpoint stops the Mission until
                  you answer.
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
  );
}
