import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@suptron/ui/components/select';
import { useModels } from '../api/queries';

export interface ModelSelectProps {
  id?: string;
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Offers only the models the Engine reports (SPEC FR-5); keeps the current value when the list is empty. */
export function ModelSelect({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Select a model',
}: ModelSelectProps) {
  const models = useModels();
  const list = models.data ?? [];
  const known = list.some((m) => m.id === value);
  const unavailable = !models.isPending && list.length === 0;
  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={onChange} disabled={disabled || unavailable}>
        <SelectTrigger id={id} aria-label="Model" className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {!known && value && <SelectItem value={value}>{value}</SelectItem>}
          {list.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {unavailable && (
        <p className="text-warning text-xs" role="status">
          The Engine reported no models; the current value is kept.
        </p>
      )}
    </div>
  );
}
