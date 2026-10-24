/** "N active Missions use a snapshot of this Unit" (SPEC FR-8). Renders nothing at zero. */
export function ActiveMissionsNote({ count, subject }: { count: number; subject: string }) {
  if (count <= 0) return null;
  return (
    <p className="text-warning text-sm" data-testid="active-missions-note">
      {count === 1 ? '1 active Mission uses' : `${count} active Missions use`} a snapshot of this{' '}
      {subject}; your changes apply to later Missions only.
    </p>
  );
}
