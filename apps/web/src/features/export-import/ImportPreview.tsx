import type { ImportElement, ImportStatus, Issue, ProjectPaths } from '@suptron/runtime/browser';
import { Label } from '@suptron/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@suptron/ui/components/radio-group';
import { cn } from '@suptron/ui/lib/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import { StatusBadge, type StatusTone } from '../../components/status-badge';
import { elementLabel } from './element-label';
import { ProjectPathsFields } from './ProjectPathsFields';

const STATUS_TONE: Record<ImportStatus, StatusTone> = {
  new: 'success',
  same: 'neutral',
  different: 'warning',
};

export type ElementChoice = 'keep' | 'replace';

export interface ImportPreviewProps {
  elements: readonly ImportElement[];
  /** The edited paths by Project; a Project without an entry shows the paths of the file. */
  paths: Readonly<Record<string, ProjectPaths>>;
  onChoose: (element: ImportElement, choice: ElementChoice) => void;
  onPathsChange: (project: string, paths: ProjectPaths) => void;
}

/** The errors (red) and warnings (amber) of one element, styled as the Assembly editor shows them. */
function ElementIssues({ issues }: { issues: ImportElement['issues'] }) {
  if (issues.errors.length === 0 && issues.warnings.length === 0) return null;
  const row = (issue: Issue, kind: 'error' | 'warning', index: number) => {
    const Icon = kind === 'error' ? AlertCircle : AlertTriangle;
    return (
      <li
        key={`${kind}-${index}`}
        data-testid={`issue-${kind}`}
        className={cn(
          'flex items-center gap-2 text-sm',
          kind === 'error' ? 'text-destructive' : 'text-warning',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{issue.message}</span>
      </li>
    );
  };
  return (
    <ul className="flex flex-col gap-1" aria-label="Problems">
      {issues.errors.map((issue, i) => row(issue, 'error', i))}
      {issues.warnings.map((issue, i) => row(issue, 'warning', i))}
    </ul>
  );
}

/** Keep mine or Replace, for an element that differs from what exists. */
function ChoiceRadios({
  element,
  onChoose,
}: {
  element: ImportElement;
  onChoose: (choice: ElementChoice) => void;
}) {
  const id = useId();
  return (
    <RadioGroup
      className="flex gap-4"
      value={element.action === 'replace' ? 'replace' : 'keep'}
      onValueChange={(value) => onChoose(value === 'replace' ? 'replace' : 'keep')}
      aria-label={`What to do with ${elementLabel(element)}`}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${id}-keep`} value="keep" />
        <Label htmlFor={`${id}-keep`} className="font-normal">
          Keep mine
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id={`${id}-replace`} value="replace" />
        <Label htmlFor={`${id}-replace`} className="font-normal">
          Replace
        </Label>
      </div>
    </RadioGroup>
  );
}

/** One element: its name, status, choice, problems and, for a Profile that will be written, its paths. */
function ElementRow({
  element,
  paths,
  onChoose,
  onPathsChange,
}: { element: ImportElement } & Omit<ImportPreviewProps, 'elements'>) {
  const project = element.project ?? element.name;
  const shownPaths = paths[project] ?? element.paths;
  return (
    <li
      className="border-border bg-card flex flex-col gap-2 rounded-xl border px-4 py-3"
      data-testid="import-element"
      aria-label={elementLabel(element)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-sm font-bold">{element.title ?? elementLabel(element)}</span>
          <span className="text-muted-foreground font-mono text-xs">{element.path}</span>
        </span>
        <StatusBadge tone={STATUS_TONE[element.status]} appearance="pill">
          {element.status}
        </StatusBadge>
        {element.status === 'different' && (
          <ChoiceRadios element={element} onChoose={(choice) => onChoose(element, choice)} />
        )}
      </div>
      <ElementIssues issues={element.issues} />
      {element.kind === 'profile' && shownPaths && (
        <ProjectPathsFields
          paths={shownPaths}
          onChange={(edited) => onPathsChange(project, edited)}
        />
      )}
    </li>
  );
}

/** Every element of the Export, grouped as the server orders them: the Units, then each Project. */
export function ImportPreview({ elements, ...rest }: ImportPreviewProps) {
  const groups = new Map<string, ImportElement[]>();
  for (const element of elements) {
    const group = element.kind === 'unit' ? 'Units' : `Project ${element.project}`;
    groups.set(group, [...(groups.get(group) ?? []), element]);
  }
  return (
    <div className="flex flex-col gap-6" data-testid="import-preview">
      {[...groups].map(([title, members]) => (
        <section key={title} aria-label={title} className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-bold">{title}</h3>
          <ul className="flex flex-col gap-2">
            {members.map((element) => (
              <ElementRow key={element.path} element={element} {...rest} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
