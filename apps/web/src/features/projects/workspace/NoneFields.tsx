/** Kind `none` has no fields: the Mission folder is the working directory (SPEC FR-12). */
export function NoneFields() {
  return (
    <p className="text-muted-foreground text-sm" data-testid="workspace-none">
      Missions of this Project work in their own Mission folder under the configuration home and
      write results next to the Task. Nothing is picked at Launch, and any number of Missions may
      run at once.
    </p>
  );
}
