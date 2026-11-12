import { slugify } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import type { Ref } from 'react';
import type { FieldValues, Resolver } from 'react-hook-form';
import { Field } from './field';

export interface TitleId {
  title: string;
  /** The ID: file name, URL and what other configuration refers to. */
  name: string;
}

const TITLE_REQUIRED = 'A title is required';

/**
 * What is wrong with a title and its ID, judged on the client. A frozen ID belongs to an existing
 * item and is never judged again; uniqueness is checked against the names already loaded, the
 * server's `name_taken` stays the final word.
 */
export function titleIdProblems(
  value: TitleId,
  { taken = [], frozen = false }: { taken?: readonly string[]; frozen?: boolean } = {},
): { title: string | null; id: string | null } {
  if (value.title.trim() === '') return { title: TITLE_REQUIRED, id: null };
  if (frozen) return { title: null, id: null };
  if (value.name === '') return { title: null, id: 'The ID needs Latin letters or digits' };
  if (taken.includes(value.name))
    return { title: null, id: `The ID "${value.name}" is already taken` };
  return { title: null, id: null };
}

/**
 * Makes `title` required in a react-hook-form whose schema keeps it optional (files written
 * before titles existed carry none), so the empty title shows up with the other errors on submit.
 */
export function withRequiredTitle<V extends FieldValues & { title?: string }, C, T>(
  resolver: Resolver<V, C, T>,
): Resolver<V, C, T> {
  return async (values, context, options) => {
    const result = await resolver(values, context, options);
    if (values.title?.trim()) return result;
    return {
      values: {},
      errors: { ...result.errors, title: { type: 'required', message: TITLE_REQUIRED } },
    } as Awaited<ReturnType<Resolver<V, C, T>>>;
  };
}

/**
 * The Title the Commander types and the ID derived from it, side by side. The ID is never typed:
 * while creating it follows the title, once the item exists it is frozen, because Assemblies and
 * Missions refer to it.
 */
export function TitleIdFields({
  id,
  value,
  onChange,
  onBlur,
  frozen = false,
  taken = [],
  titleError,
  idError,
  titleRef,
  autoFocus,
}: {
  id: string;
  value: TitleId;
  onChange: (next: TitleId) => void;
  onBlur?: () => void;
  frozen?: boolean;
  taken?: readonly string[];
  /** The title error from the form, shown once the form has been submitted. */
  titleError?: string | null | undefined;
  /** An ID error the server reported, such as `name_taken`. */
  idError?: string | null | undefined;
  titleRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  // An empty title is reported by the form on submit, not while the Commander is still typing.
  const live = titleIdProblems(value, { taken, frozen });
  const idMessage = idError ?? live.id;
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Field id={`${id}-title`} label="Title" required error={titleError ?? undefined}>
        <Input
          id={`${id}-title`}
          ref={titleRef}
          value={value.title}
          onChange={(event) => {
            const title = event.target.value;
            onChange({ title, name: frozen ? value.name : slugify(title) });
          }}
          onBlur={onBlur}
          aria-required
          aria-invalid={titleError ? true : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </Field>
      <Field
        id={`${id}-name`}
        label="ID"
        hint={
          frozen
            ? 'Fixed once created: other configuration refers to it.'
            : 'Made from the Title: file name and what other configuration refers to.'
        }
        error={idMessage ?? undefined}
      >
        <Input
          id={`${id}-name`}
          value={value.name}
          disabled
          aria-invalid={idMessage ? true : undefined}
          className="font-mono text-sm"
        />
      </Field>
    </div>
  );
}
