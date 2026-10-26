export interface StartMissionPrefill {
  /** Only for a repository Project. */
  checkoutPath?: string;
  taskPath: string;
}

export const prefillKey = (project: string) => `suptron.startMission.${project}`;

/** The last used Checkout and Task location per Project, kept in this browser only (SPEC FR-4). */
export function readPrefill(project: string): StartMissionPrefill | null {
  try {
    const raw = window.localStorage.getItem(prefillKey(project));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StartMissionPrefill>;
    if (typeof parsed.taskPath !== 'string') return null;
    return {
      taskPath: parsed.taskPath,
      ...(typeof parsed.checkoutPath === 'string' && { checkoutPath: parsed.checkoutPath }),
    };
  } catch {
    return null;
  }
}

export function writePrefill(project: string, prefill: StartMissionPrefill): void {
  try {
    window.localStorage.setItem(prefillKey(project), JSON.stringify(prefill));
  } catch {
    // A convenience only; nothing depends on it.
  }
}
