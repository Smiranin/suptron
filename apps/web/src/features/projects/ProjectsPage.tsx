import { Button } from '@suptron/ui/components/button';
import { Link } from '@tanstack/react-router';
import { FolderGit2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useProjects } from '../../api/queries';
import { EmptyState, PageContainer, PageHeader, StatePanel } from '../../components/page';
import { LaunchButton } from '../missions/start/LaunchButton';
import { AssemblyStatusBadge } from './AssembliesList';
import { NewProjectDialog } from './NewProjectDialog';

/** Every Project expanded with its Assemblies and a Launch button on the valid ones (missions SPEC FR-1). */
export function ProjectsPage() {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  const newButton = (
    <Button type="button" onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" /> New Project
    </Button>
  );
  if (projects.isPending) return <PageContainer>Loading…</PageContainer>;
  if (projects.isError)
    return <StatePanel title="Projects could not be read" description={projects.error.message} />;
  return (
    <PageContainer>
      <PageHeader title="Projects" count={projects.data.length} action={newButton} />
      {projects.data.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No Projects yet"
          description="A Project is one repository with its Profile and Assemblies."
          action={newButton}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {projects.data.map((project) => (
            <section
              key={project.name}
              className="border-border bg-card rounded-2xl border p-5"
              aria-labelledby={`project-${project.name}`}
              data-testid="project-card"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2
                    id={`project-${project.name}`}
                    className="m-0 text-lg font-bold tracking-tight"
                  >
                    <Link
                      to="/projects/$project"
                      params={{ project: project.name }}
                      className="text-foreground no-underline hover:underline"
                    >
                      {project.name}
                    </Link>
                  </h2>
                  <p className="text-muted-foreground truncate font-mono text-xs">
                    {project.profile?.repository.path ?? 'Profile is invalid'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {project.activeMissions > 0 && (
                    <span className="text-warning text-xs font-medium">
                      {project.activeMissions} active{' '}
                      {project.activeMissions === 1 ? 'Mission' : 'Missions'}
                    </span>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/projects/$project" params={{ project: project.name }}>
                      Open Project
                    </Link>
                  </Button>
                </div>
              </div>
              {project.issues.length > 0 && (
                <p className="text-destructive mb-3 text-sm" role="alert">
                  {project.issues.map((i) => i.message).join('; ')}
                </p>
              )}
              {project.assemblies.length === 0 ? (
                <p className="text-muted-foreground text-sm">No Assemblies yet.</p>
              ) : (
                <ul className="flex flex-col gap-2" aria-label={`Assemblies of ${project.name}`}>
                  {project.assemblies.map((assembly) => (
                    <li
                      key={assembly.name}
                      className="border-border flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3"
                      data-testid="assembly-item"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <Link
                            to="/projects/$project/assemblies/$assembly"
                            params={{ project: project.name, assembly: assembly.name }}
                            className="text-foreground font-mono text-sm font-bold no-underline hover:underline"
                          >
                            {assembly.name}
                          </Link>
                          <AssemblyStatusBadge status={assembly.status} />
                          {assembly.activeMissions > 0 && (
                            <span className="text-warning text-xs font-medium">
                              {assembly.activeMissions} active{' '}
                              {assembly.activeMissions === 1 ? 'Mission' : 'Missions'}
                            </span>
                          )}
                        </div>
                        {assembly.status !== 'valid' && (
                          <p className="text-destructive text-xs" data-testid="launch-reason">
                            Cannot start a Mission:{' '}
                            {assembly.issues.errors[0]?.message ?? 'the Assembly is invalid'}
                          </p>
                        )}
                      </div>
                      {assembly.status === 'valid' && (
                        <LaunchButton project={project.name} assembly={assembly.name} size="sm" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </PageContainer>
  );
}
