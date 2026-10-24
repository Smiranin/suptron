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
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/** Asks before leaving an editor with unsaved changes, in-app and on page unload. */
export function DiscardGuard({ when }: { when: boolean }) {
  // A ref so a navigation issued right after a save (before the next render) sees the clean state.
  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  }, [when]);
  const blocker = useBlocker({
    shouldBlockFn: () => whenRef.current,
    withResolver: true,
    enableBeforeUnload: when,
  });
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
  const open = blocker.status === 'blocked';
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Leaving this page will discard them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.status === 'blocked' && blocker.reset()}>
            Stay
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => blocker.status === 'blocked' && blocker.proceed()}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
