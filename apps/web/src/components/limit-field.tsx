import { Input } from '@suptron/ui/components/input';
import { useState } from 'react';

export interface LimitFieldProps {
  id: string;
  /** undefined: nothing is set and the default applies. */
  value: number | undefined;
  /** Shown as the placeholder of an empty field. */
  defaultValue: number;
  /** The smallest number the field accepts. */
  min: number;
  onChange(value: number | undefined): void;
  disabled?: boolean;
}

const format = (value: number | undefined) => (value === undefined ? '' : String(value));

/**
 * A whole number with a default, for the limits of an Assembly. The field keeps what is typed and
 * applies it when it loses focus or on Enter, so a digit can be replaced without the default jumping in
 * between; an empty field means the default, shown as the placeholder. What is not a whole number
 * of at least `min` is not applied and the field shows the last value again.
 */
export function LimitField({ id, value, defaultValue, min, onChange, disabled }: LimitFieldProps) {
  const [text, setText] = useState(format(value));
  // A value changed from outside (a discard, a reload) replaces what the field shows.
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(format(value));
  }
  const apply = () => {
    const raw = text.trim();
    if (raw === '') {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min) {
      setText(format(value));
      return;
    }
    setText(String(parsed));
    if (parsed !== value) onChange(parsed);
  };
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      step={1}
      value={text}
      placeholder={String(defaultValue)}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') apply();
      }}
    />
  );
}
