import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@suptron/ui/components/alert-dialog';
import { Button } from '@suptron/ui/components/button';

export interface ConflictDialogProps {
  open: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onCancel: () => void;
}

/** The file changed on disk since it was loaded: Reload (lose UI changes) or Overwrite (SPEC FR-3). */
export function ConflictDialog({ open, onReload, onOverwrite, onCancel }: ConflictDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>The file changed on disk</AlertDialogTitle>
          <AlertDialogDescription>
            Someone or something edited this file since you loaded it. Reload replaces your changes
            with the file on disk; Overwrite discards the changes made on disk and saves yours.
            Nothing is merged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onReload}>
            Reload
          </Button>
          <AlertDialogAction onClick={onOverwrite}>Overwrite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
