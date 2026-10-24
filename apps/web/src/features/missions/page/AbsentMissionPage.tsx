import { Button } from '@suptron/ui/components/button';
import { Link } from '@tanstack/react-router';
import { Rocket } from 'lucide-react';
import { StatePanel } from '../../../components/page';

/** A Mission the application no longer knows: Dismissed elsewhere or lost in a restart (FR-35). */
export function AbsentMissionPage() {
  return (
    <StatePanel
      icon={Rocket}
      label="Mission"
      title="This Mission is gone"
      description="It was dismissed, or the application restarted and no longer knows it."
      action={
        <Button asChild>
          <Link to="/missions">Back to Missions</Link>
        </Button>
      }
    />
  );
}
