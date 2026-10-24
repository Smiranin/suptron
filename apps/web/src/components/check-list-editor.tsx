import {
  CHECK_CATALOGUE,
  summarizeCheck,
  type Check,
  type CheckKind,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { Label } from '@suptron/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { Textarea } from '@suptron/ui/components/textarea';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

export interface CheckListEditorProps {
  value: Check[];
  onChange: (checks: Check[]) => void;
  disabled?: boolean;
  label?: string;
}

function blankCheck(kind: CheckKind): Check {
  switch (kind) {
    case 'command':
      return { kind, command: '' };
    case 'llm_judgment':
      return { kind, criterion: '' };
    default:
      return { kind };
  }
}

/** The one Check-list widget for Done Conditions and Exit Conditions alike (editors SPEC FR-11). */
export function CheckListEditor({
  value,
  onChange,
  disabled,
  label = 'Checks',
}: CheckListEditorProps) {
  const [kind, setKind] = useState<CheckKind>('command');
  const baseId = useId();
  const update = (index: number, check: Check) =>
    onChange(value.map((c, i) => (i === index ? check : c)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="check-list-editor" aria-label={label}>
      {value.length === 0 && (
        <p className="text-muted-foreground text-sm">No Checks: the condition always holds.</p>
      )}
      <ol className="flex flex-col gap-2">
        {value.map((check, index) => {
          const descriptor = CHECK_CATALOGUE.find((d) => d.kind === check.kind)!;
          return (
            <li
              key={index}
              className="border-border flex flex-col gap-2 rounded-lg border p-3"
              data-testid="check-row"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {index + 1}. {descriptor.label}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove check ${index + 1}`}
                    disabled={disabled}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {descriptor.params.map((param) => {
                const id = `${baseId}-${index}-${param.name}`;
                const current = (check as unknown as Record<string, unknown>)[param.name];
                const set = (raw: string) => {
                  const next = { ...check } as Record<string, unknown>;
                  if (param.type === 'number') {
                    if (raw.trim() === '') delete next[param.name];
                    else next[param.name] = Number(raw);
                  } else {
                    next[param.name] = raw;
                  }
                  update(index, next as unknown as Check);
                };
                return (
                  <div key={param.name} className="flex flex-col gap-1">
                    <Label htmlFor={id}>{param.label}</Label>
                    {param.type === 'text' ? (
                      <Textarea
                        id={id}
                        value={String(current ?? '')}
                        onChange={(e) => set(e.target.value)}
                        disabled={disabled}
                        placeholder={param.placeholder}
                        rows={2}
                      />
                    ) : (
                      <Input
                        id={id}
                        type={param.type === 'number' ? 'number' : 'text'}
                        value={current === undefined ? '' : String(current)}
                        onChange={(e) => set(e.target.value)}
                        disabled={disabled}
                        placeholder={param.placeholder}
                        className={param.type === 'string' ? 'font-mono text-sm' : undefined}
                      />
                    )}
                  </div>
                );
              })}
              {descriptor.params.length === 0 && (
                <p className="text-muted-foreground text-xs">{summarizeCheck(check)}</p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as CheckKind)} disabled={disabled}>
          <SelectTrigger aria-label="Check kind" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHECK_CATALOGUE.map((d) => (
              <SelectItem key={d.kind} value={d.kind}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...value, blankCheck(kind)])}
        >
          <Plus aria-hidden="true" /> Add check
        </Button>
      </div>
    </div>
  );
}
