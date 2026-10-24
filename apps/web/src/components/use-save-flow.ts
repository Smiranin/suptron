import { useCallback, useState } from 'react';
import { ConflictError } from '../api/client';

export interface SaveMode {
  etag?: string;
  force?: boolean;
}

export interface SaveFlowOptions<T> {
  /** The current etag; null when the document is new (no `If-Match`). */
  etag: string | null;
  save(doc: T, mode: SaveMode): Promise<{ data: T; etag: string }>;
  onSaved(result: { data: T; etag: string }): void;
  /** Reload after a conflict: replace the editor state with the file on disk. */
  onReload(current: { data: T; etag: string }): void;
  onError?(error: Error): void;
}

export interface SaveFlow<T> {
  save(doc: T): Promise<boolean>;
  saving: boolean;
  conflict: boolean;
  reload(): void;
  overwrite(): Promise<void>;
  cancelConflict(): void;
  error: Error | null;
}

/** The shared Save → 412 → Reload / Overwrite cycle of every editor (editors SPEC FR-2, FR-3). */
export function useSaveFlow<T>(options: SaveFlowOptions<T>): SaveFlow<T> {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [conflict, setConflict] = useState<{
    current: { data: T; etag: string };
    pending: T;
  } | null>(null);
  const { etag, save, onSaved, onReload, onError } = options;

  const run = useCallback(
    async (doc: T, mode: SaveMode): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const result = await save(doc, mode);
        onSaved(result);
        return true;
      } catch (caught) {
        if (caught instanceof ConflictError) {
          setConflict({ current: caught.current as { data: T; etag: string }, pending: doc });
        } else {
          const failure = caught instanceof Error ? caught : new Error(String(caught));
          setError(failure);
          onError?.(failure);
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [save, onSaved, onError],
  );

  return {
    save: (doc) => run(doc, etag ? { etag } : {}),
    saving,
    conflict: conflict !== null,
    reload: () => {
      if (conflict) onReload(conflict.current);
      setConflict(null);
    },
    overwrite: async () => {
      if (!conflict) return;
      const pending = conflict.pending;
      setConflict(null);
      await run(pending, { force: true });
    },
    cancelConflict: () => setConflict(null),
    error,
  };
}
