import { Label } from '@suptron/ui/components/label';
import { CollapsibleSection } from '../../../components/collapsible-section';
import { Markdown } from '../../../components/markdown';
import { MarkdownField } from '../../../components/markdown-field';

/**
 * What a Slot adds to its Unit's Rules or Instructions, under the Unit's own text, which is shown
 * read-only so the addition is written knowing what it extends.
 */
export function UnitTextAddition({
  id,
  kind,
  hint,
  unitText,
  value,
  onChange,
}: {
  id: string;
  kind: 'Rules' | 'Instructions';
  hint: string;
  /** Undefined when the Unit is missing from the Hangar. */
  unitText: string | undefined;
  value: string | undefined;
  /** Undefined removes the addition from the file. */
  onChange(value: string | undefined): void;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={`${id}-section`}>
      {unitText !== undefined && (
        <CollapsibleSection title={`${kind} from the Unit`}>
          {unitText.trim() === '' ? (
            <p className="text-muted-foreground text-xs">The Unit has none.</p>
          ) : (
            <Markdown
              text={unitText}
              className="bg-muted text-muted-foreground max-h-64 overflow-y-auto rounded-md p-2 text-xs"
            />
          )}
        </CollapsibleSection>
      )}
      <Label htmlFor={id}>Additional {kind}</Label>
      <p className="text-muted-foreground text-xs">{hint}</p>
      <MarkdownField
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </div>
  );
}
