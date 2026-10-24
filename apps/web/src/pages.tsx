import { Button } from '@suptron/ui/components/button';
import { Link } from '@tanstack/react-router';
import { StatePanel } from './components/page';

export function NotFoundPage() {
  return (
    <StatePanel
      label="404"
      title="This page isn’t here"
      description="The link may be outdated, or the page may have moved."
      action={
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      }
    />
  );
}
