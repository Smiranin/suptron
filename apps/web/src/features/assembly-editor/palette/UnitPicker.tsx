import type { UnitFile } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@suptron/ui/components/dialog';

/** The modal the "+" control opens: pick a Unit to place at that gap (FR-26). */
export function UnitPicker({
  open,
  units,
  onPick,
  onClose,
}: {
  open: boolean;
  units: UnitFile[];
  onPick: (unit: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Slot</DialogTitle>
          <DialogDescription>Pick the Unit to mount at this position.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto" data-testid="unit-picker">
          {units.length === 0 && (
            <p className="text-muted-foreground text-sm">No Units in the Hangar.</p>
          )}
          {units.map((unit) => (
            <Button
              key={unit.name}
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => onPick(unit.name)}
            >
              <span className="font-semibold">{unit.name}</span>
              <span className="text-muted-foreground text-xs">{unit.model}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
