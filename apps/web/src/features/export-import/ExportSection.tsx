import type { ExportContents, ExportSelection } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Checkbox } from '@suptron/ui/components/checkbox';
import { Label } from '@suptron/ui/components/label';
import { toast } from '@suptron/ui/components/sonner';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useId, useState } from 'react';
import { useExportContents } from '../../api/queries';
import { transferApi } from '../../api/transfer';
import { StatePanel } from '../../components/page';
import { packExport } from './archive';
import { ZIP_MIME_TYPE, downloadFile, exportFileName } from './download';
import { initialSelection, toggleProject, toggleUnit } from './export-selection';

interface CheckRow {
  name: string;
  title?: string;
}

/** One titled list of checkbox rows. */
function CheckList({
  title,
  rows,
  isChecked,
  onToggle,
}: {
  title: string;
  rows: readonly CheckRow[];
  isChecked: (name: string) => boolean;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-1 flex-col gap-3">
      <h3 id={`${id}-title`} className="m-0 text-sm font-bold">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center gap-3">
              <Checkbox
                id={`${id}-${row.name}`}
                checked={isChecked(row.name)}
                onCheckedChange={(checked) => onToggle(row.name, checked === true)}
              />
              <Label htmlFor={`${id}-${row.name}`} className="flex items-center gap-3 font-normal">
                <span>{row.title ?? row.name}</span>
                {row.title && (
                  <span className="text-muted-foreground font-mono text-xs">{row.name}</span>
                )}
              </Label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The lists of what to export, all checked when they arrive, and the Export button. */
function ExportForm({ contents }: { contents: ExportContents }) {
  const [selection, setSelection] = useState<ExportSelection>(() => initialSelection(contents));
  const download = useMutation({
    mutationFn: async () => {
      const files = await transferApi.export(selection);
      downloadFile(packExport(files), exportFileName(new Date()), ZIP_MIME_TYPE);
    },
    onError: (error) => toast.error(error.message),
  });
  const nothingChecked = selection.units.length === 0 && selection.projects.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-8">
        <CheckList
          title="Units"
          rows={contents.units}
          isChecked={(name) => selection.units.includes(name)}
          onToggle={(name, checked) => setSelection((s) => toggleUnit(s, name, checked))}
        />
        <CheckList
          title="Projects"
          rows={contents.projects}
          isChecked={(name) => selection.projects.includes(name)}
          onToggle={(name, checked) => {
            const project = contents.projects.find((p) => p.name === name);
            if (project) setSelection((s) => toggleProject(s, project, checked));
          }}
        />
      </div>
      <div>
        <Button
          type="button"
          disabled={nothingChecked || download.isPending}
          onClick={() => download.mutate()}
        >
          <Download aria-hidden="true" /> Export
        </Button>
      </div>
    </div>
  );
}

/** Export: choose Units and Projects and download them as one file. */
export function ExportSection() {
  const contents = useExportContents();
  return (
    <section aria-labelledby="export-title" className="flex flex-col gap-4">
      <div>
        <h2 id="export-title" className="m-0 text-xl font-bold">
          Export
        </h2>
        <p className="text-muted-foreground text-sm">
          One file with the chosen Units and Projects, each Project with its Profile and all its
          Assemblies. Missions are never exported.
        </p>
      </div>
      {contents.isPending ? (
        <p>Loading…</p>
      ) : contents.isError ? (
        <StatePanel
          compact
          headingLevel={2}
          title="What can be exported could not be read"
          description={contents.error.message}
        />
      ) : (
        <ExportForm contents={contents.data} />
      )}
    </section>
  );
}
