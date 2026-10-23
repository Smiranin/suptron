import { Button } from '@suptron/ui/components/button';
import { Link } from '@tanstack/react-router';
import { FolderGit2, Rocket, Warehouse } from 'lucide-react';
import { EmptyState, PageContainer, PageHeader, StatePanel } from './components/page';

// Placeholders until the editors and Missions screens are built (docs/features).

export function ProjectsPage() {
  return (
    <PageContainer>
      <PageHeader title="Projects" />
      <EmptyState
        icon={FolderGit2}
        title="No Projects yet"
        description="Projects and their Assemblies will appear here."
      />
    </PageContainer>
  );
}

export function HangarPage() {
  return (
    <PageContainer>
      <PageHeader title="Hangar" />
      <EmptyState
        icon={Warehouse}
        title="The Hangar is empty"
        description="Units you create will wait here until an Assembly mounts them."
      />
    </PageContainer>
  );
}

export function MissionsPage() {
  return (
    <PageContainer>
      <PageHeader title="Missions" />
      <EmptyState
        icon={Rocket}
        title="No Missions"
        description="Launch a Mission from an Assembly on the Projects page."
      />
    </PageContainer>
  );
}

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
