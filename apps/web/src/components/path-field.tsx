import { Input } from '@suptron/ui/components/input';
import { cn } from '@suptron/ui/lib/utils';
import { useEffect, useState } from 'react';
import { useFsStat } from '../api/queries';

export interface PathFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Base directory for relative paths. */
  base?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Reports whether the path exists (and its kind) after the debounced check. */
  onStatus?: (status: PathStatus) => void;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export type PathStatus =
  { checking: true } | { checking: false; exists: boolean; kind?: 'file' | 'dir' };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** A typed path with a debounced existence check through `GET /api/fs/stat` (editors SPEC FR-14, FR-15). */
export function PathField({
  id,
  value,
  onChange,
  base,
  placeholder,
  disabled,
  onStatus,
  ...aria
}: PathFieldProps) {
  const debounced = useDebounced(value.trim(), 250);
  const stat = useFsStat(debounced, base);
  const checking = debounced !== '' && (stat.isPending || debounced !== value.trim());
  const exists = stat.data?.exists === true;
  useEffect(() => {
    if (debounced === '') return;
    if (checking) onStatus?.({ checking: true });
    else if (stat.data)
      onStatus?.({
        checking: false,
        exists: stat.data.exists,
        ...(stat.data.kind && { kind: stat.data.kind }),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, stat.data, debounced]);
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-sm"
        {...aria}
      />
      {debounced !== '' && !checking && stat.data && (
        <p
          className={cn('text-xs', exists ? 'text-success' : 'text-destructive')}
          role="status"
          data-testid="path-status"
        >
          {exists ? `Found ${stat.data.kind === 'dir' ? 'folder' : 'file'}` : 'Path does not exist'}
        </p>
      )}
    </div>
  );
}
