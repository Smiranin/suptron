import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Why the page itself gave up on the Universe: its code did not download, or it crashed. */
export type UniverseBoundaryFailure = 'module-load' | 'crashed';

/** The download of the Universe's code failed; the boundary tells it apart from a crash. */
export class UniverseModuleLoadError extends Error {
  /** Wraps the error the dynamic import rejected with. */
  constructor(cause: unknown) {
    super('The code of the Universe did not download', { cause });
    this.name = 'UniverseModuleLoadError';
  }
}

interface UniverseBoundaryProps {
  onFailure(failure: UniverseBoundaryFailure): void;
  children: ReactNode;
}

/**
 * Turns a failed download of the Universe or an error while rendering it into a failure the page
 * reports, so every failure ends at the clock. A class component: React has no other way to catch
 * an error of rendering.
 */
export class UniverseBoundary extends Component<UniverseBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  /** Renders nothing more of the Universe once it failed. */
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Logs the error for the developer and reports the failure to the page. */
  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('The Universe failed', error, info.componentStack);
    this.props.onFailure(error instanceof UniverseModuleLoadError ? 'module-load' : 'crashed');
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
