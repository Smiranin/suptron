import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { ExternalLink } from 'lucide-react';
import { api } from '../api/queries';

/** "Open in editor": the only route to the raw file (SPEC FR-4). */
export function OpenInEditorButton({
  path,
  disabled,
}: {
  path: string | null;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || !path}
      onClick={() => {
        if (!path) return;
        api
          .open(path)
          .catch((error: Error) => toast.error(`Could not open the editor: ${error.message}`));
      }}
    >
      <ExternalLink aria-hidden="true" />
      Open in editor
    </Button>
  );
}
