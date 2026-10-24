import { ConfirmDialog } from '../../../components/confirm-dialog';

/** The SPEC FR-30 confirmation: nothing is undone, and a Stopped Mission cannot be resumed. */
export function StopMissionDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Stop this Mission?"
      description="The current Slot is interrupted immediately. The branch, the Checkout and the Pull Request stay as they are. A Stopped Mission cannot be resumed."
      confirmLabel="Stop Mission"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
