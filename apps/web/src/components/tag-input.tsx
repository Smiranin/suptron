import { Button } from '@suptron/ui/components/button';
import { Input } from '@suptron/ui/components/input';
import { X } from 'lucide-react';
import { useState } from 'react';

export interface TagInputProps {
  id?: string;
  value: string[];
  onChange(value: string[]): void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Labels and reviewers: Enter or a comma adds a tag, the × removes it. */
export function TagInput({ id, value, onChange, placeholder, disabled, ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const tag = draft.trim().replace(/,$/, '').trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${aria['aria-label'] ?? 'Tags'} list`}>
          {value.map((tag) => (
            <li
              key={tag}
              className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            >
              {tag}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-4"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((t) => t !== tag))}
              >
                <X aria-hidden="true" className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value.endsWith(',')) {
            setDraft(event.target.value);
            queueMicrotask(commit);
          } else setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        {...aria}
      />
    </div>
  );
}
