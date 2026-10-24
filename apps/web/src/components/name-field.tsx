import { NAME_PATTERN } from '@suptron/runtime/browser';
import { Input } from '@suptron/ui/components/input';
import type { ComponentProps } from 'react';

export function nameError(value: string): string | null {
  if (value.trim() === '') return 'A name is required';
  if (!NAME_PATTERN.test(value)) return 'Use lowercase letters, digits and "-" only';
  return null;
}

/** A basename field (lowercase, digits, `-`); uniqueness errors come from the server. */
export function NameField({
  value,
  error,
  ...props
}: ComponentProps<typeof Input> & { value: string; error?: string | null }) {
  const message = error ?? nameError(value);
  return (
    <div className="flex flex-col gap-1">
      <Input
        value={value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={message ? true : undefined}
        className="font-mono text-sm"
        {...props}
      />
      {message && (
        <p className="text-destructive text-xs" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
