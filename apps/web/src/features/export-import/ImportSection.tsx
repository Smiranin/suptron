import type {
  ImportChoices,
  ImportElement,
  ImportSummary as Summary,
  ProjectPaths,
  TransferFile,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import { ValidationError } from '../../api/client';
import { useInvalidateConfig } from '../../api/queries';
import { transferApi } from '../../api/transfer';
import { PATH_DEBOUNCE_MS, useDebounced } from '../../lib/use-debounced';
import { ArchiveError, unpackExport } from './archive';
import { ImportPreview, type ElementChoice } from './ImportPreview';
import { ImportSummary } from './ImportSummary';

/** The unpacked files of one chosen Export; `id` tells two choices of the same file apart. */
interface PickedExport {
  id: number;
  files: TransferFile[];
}

/** An inline message saying why a file was refused or an Import failed. */
function Refusal({ children }: { children: string }) {
  return (
    <p className="text-destructive m-0 text-sm" role="alert">
      {children}
    </p>
  );
}

/** The message of a failed request: the server's reasons for a refused body, or the error itself. */
function messageOf(error: Error): string {
  return error instanceof ValidationError && error.issues.length > 0
    ? error.issues.map((issue) => issue.message).join('; ')
    : error.message;
}

/** `paths` of only the Projects `keep` lists, leaving out `drop`. */
function pickProjects(
  paths: Readonly<Record<string, ProjectPaths>>,
  keep: Readonly<Record<string, ProjectPaths>>,
  drop?: string,
): Record<string, ProjectPaths> {
  return Object.fromEntries(
    Object.entries(paths).filter(([project]) => project in keep && project !== drop),
  );
}

/**
 * The preview of one chosen Export with the Commander's choices, and Apply. Mounted once per
 * chosen file, so choosing another file starts over with no choices.
 */
function ImportPlan({
  picked,
  onApplied,
}: {
  picked: PickedExport;
  onApplied: (summary: Summary) => void;
}) {
  const invalidate = useInvalidateConfig();
  const [replace, setReplace] = useState<string[]>([]);
  const [paths, setPaths] = useState<Record<string, ProjectPaths>>({});
  const debouncedPaths = useDebounced(paths, PATH_DEBOUNCE_MS);
  // A Project whose Profile is no longer written drops its paths at once, not after the pause.
  const previewChoices: ImportChoices = { replace, paths: pickProjects(debouncedPaths, paths) };
  const preview = useQuery({
    queryKey: ['import', 'preview', picked.id, previewChoices],
    queryFn: () => transferApi.preview(picked.files, previewChoices),
    placeholderData: keepPreviousData,
    retry: false,
    gcTime: 0,
  });
  const apply = useMutation({
    mutationFn: () => transferApi.apply(picked.files, { replace, paths }),
    onSuccess: async (summary) => {
      await invalidate();
      onApplied(summary);
    },
  });

  const choose = (element: ImportElement, choice: ElementChoice) => {
    setReplace((list) => {
      const rest = list.filter((path) => path !== element.path);
      return choice === 'replace' ? [...rest, element.path] : rest;
    });
    if (element.kind === 'profile' && choice === 'keep') {
      setPaths((all) => pickProjects(all, all, element.name));
    }
  };

  if (preview.isError) return <Refusal>{messageOf(preview.error)}</Refusal>;
  if (!preview.data) return <p className="m-0 text-sm">Reading the file…</p>;
  return (
    <div className="flex flex-col gap-4">
      <ImportPreview
        elements={preview.data.elements}
        paths={paths}
        onChoose={choose}
        onPathsChange={(project, edited) => setPaths((all) => ({ ...all, [project]: edited }))}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" disabled={apply.isPending} onClick={() => apply.mutate()}>
          Apply
        </Button>
        {apply.isError && <Refusal>{messageOf(apply.error)}</Refusal>}
      </div>
    </div>
  );
}

/** Import: choose an Export file, review what it would change, choose, correct paths and apply. */
export function ImportSection() {
  const [picked, setPicked] = useState<PickedExport | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPicked(null);
    setRefusal(null);
    setSummary(null);
    if (!file) return;
    try {
      const files = unpackExport(new Uint8Array(await file.arrayBuffer()));
      nextId.current += 1;
      setPicked({ id: nextId.current, files });
    } catch (error) {
      // An ArchiveError says why the file is not an Export; anything else is a failure to read it.
      const reason = error instanceof Error ? error.message : String(error);
      setRefusal(error instanceof ArchiveError ? reason : `The file could not be read: ${reason}`);
    }
  };

  return (
    <section aria-labelledby="import-title" className="flex flex-col gap-4">
      <div>
        <h2 id="import-title" className="m-0 text-xl font-bold">
          Import
        </h2>
        <p className="text-muted-foreground text-sm">
          Nothing changes until you apply. An element that differs from yours is kept unless you
          choose to replace it.
        </p>
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="import-file">Export file</Label>
        <Input
          id="import-file"
          ref={input}
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => void choose(event)}
        />
      </div>
      {refusal && <Refusal>{refusal}</Refusal>}
      {summary && <ImportSummary summary={summary} />}
      {picked && (
        <ImportPlan
          key={picked.id}
          picked={picked}
          onApplied={(applied) => {
            // The same file can be chosen again for another Import.
            if (input.current) input.current.value = '';
            setPicked(null);
            setSummary(applied);
          }}
        />
      )}
    </section>
  );
}
