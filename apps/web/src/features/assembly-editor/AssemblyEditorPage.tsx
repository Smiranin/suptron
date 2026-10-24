import {
  DEFAULTS,
  referencesToSlot,
  type AssemblyFile,
  type UnitFile,
} from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { Skeleton } from '@suptron/ui/components/skeleton';
import { toast } from '@suptron/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ConflictError, NameTakenError, NotFoundError, ValidationError } from '../../api/client';
import {
  api,
  useAssembly,
  useHealth,
  useInvalidateConfig,
  useModels,
  useUnits,
} from '../../api/queries';
import { ActiveMissionsNote } from '../../components/active-missions-note';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { ConflictDialog } from '../../components/conflict-dialog';
import { DiscardGuard } from '../../components/discard-guard';
import { OpenInEditorButton } from '../../components/open-in-editor-button';
import { StatePanel } from '../../components/page';
import { SaveBar } from '../../components/save-bar';
import { deepEqual } from '../../lib/deep-equal';
import { isEditableTarget, useSaveShortcut } from '../../lib/keyboard';
import type { ClockViewportState } from '../clock/use-clock-viewport';
import { useViewportSize } from '../clock/use-viewport-size';
import { LaunchButton } from '../missions/start/LaunchButton';
import { ClockCanvas } from './canvas/ClockCanvas';
import { usePaletteDrop } from './canvas/usePaletteDrop';
import {
  editorReducer,
  initialEditorState,
  type EditorAction,
  type EditorState,
} from './editor-state';
import { Inspector } from './inspector/Inspector';
import { IssuesList } from './IssuesList';
import { layoutClock, type Viewport } from './model/layout';
import type { Command } from './model/reducer';
import { unitIndex } from './model/selectors';
import { validate } from './model/validate';
import { UnitPalette } from './palette/UnitPalette';
import { UnitPicker } from './palette/UnitPicker';

/** jsdom and a not-yet-measured container report 0×0; the editor then lays out for this size. */
const FALLBACK_VIEWPORT: Viewport = { width: 900, height: 600 };

export interface AssemblyEditorPageProps {
  project: string;
  assembly: string;
  /** Fixed viewport for tests; the router passes none and the page measures itself. */
  viewport?: Viewport;
}

export function AssemblyEditorPage({ project, assembly, viewport }: AssemblyEditorPageProps) {
  const query = useAssembly(project, assembly);
  const units = useUnits();
  const models = useModels();
  const isNew = query.error instanceof NotFoundError;

  if (query.isPending || units.isPending || models.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }
  if (query.error && !isNew) {
    return (
      <StatePanel
        label="Error"
        title="Could not load the Assembly"
        description={query.error.message}
      />
    );
  }
  if (units.error) {
    return (
      <StatePanel
        label="Error"
        title="Could not load the Units"
        description={units.error.message}
      />
    );
  }
  const unitFiles = (units.data ?? []).flatMap((u) => (u.unit ? [u.unit] : []));

  if (query.data?.status === 'unparseable') {
    return (
      <UnparseableAssembly
        project={project}
        assembly={assembly}
        text={query.data.text ?? ''}
        message={query.data.issues.errors[0]?.message ?? 'The file cannot be parsed'}
      />
    );
  }

  const initialDoc: AssemblyFile =
    query.data?.assembly ??
    ({
      name: assembly,
      core: {
        model: models.data?.[0]?.id ?? 'sonnet',
        defaultAttemptLimit: DEFAULTS.core.defaultAttemptLimit,
        defaultLoopLimit: DEFAULTS.core.defaultLoopLimit,
        instructions: '',
      },
      slots: [],
    } satisfies AssemblyFile);

  return (
    <AssemblyEditor
      key={`${project}/${assembly}`}
      project={project}
      assembly={assembly}
      initialDoc={initialDoc}
      initialEtag={isNew ? null : (query.data?.etag ?? null)}
      activeMissions={query.data?.activeMissions ?? 0}
      units={unitFiles}
      viewport={viewport}
    />
  );
}

function UnparseableAssembly({
  project,
  assembly,
  text,
  message,
}: {
  project: string;
  assembly: string;
  text: string;
  message: string;
}) {
  const health = useHealth();
  const path = health.data
    ? `${health.data.configHome}/projects/${project}/assemblies/${assembly}.yaml`
    : null;
  return (
    <div className="flex flex-col gap-4 p-6" data-testid="unparseable">
      <EditorHeader project={project} assembly={assembly} />
      <StatePanel
        compact
        headingLevel={2}
        label="Unparseable"
        title="This Assembly file cannot be parsed"
        description={message}
        action={<OpenInEditorButton path={path} />}
      />
      <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-4 font-mono text-xs">{text}</pre>
    </div>
  );
}

function EditorHeader({
  project,
  assembly,
  children,
}: {
  project: string;
  assembly: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={`Back to ${project}`}>
          <Link to="/projects/$project" params={{ project }}>
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="truncate text-xl font-bold tracking-tight">
          <span className="text-muted-foreground">{project} / </span>
          {assembly}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

interface AssemblyEditorProps {
  project: string;
  assembly: string;
  initialDoc: AssemblyFile;
  initialEtag: string | null;
  activeMissions: number;
  units: UnitFile[];
  viewport?: Viewport;
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  return editorReducer(state, action, {
    defaultLoopLimit: state.doc.core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit,
  });
}

function AssemblyEditor({
  project,
  assembly,
  initialDoc,
  initialEtag,
  activeMissions,
  units,
  viewport: fixedViewport,
}: AssemblyEditorProps) {
  const [state, dispatchAction] = useReducer(reducer, undefined, () =>
    initialEditorState(initialDoc, initialEtag),
  );
  const dispatch = useCallback((cmd: Command) => dispatchAction({ type: 'command', cmd }), []);
  const navigate = useNavigate();
  const invalidate = useInvalidateConfig();
  const health = useHealth();
  const { ref: measureRef, viewport: measured } = useViewportSize(fixedViewport);
  const viewport = measured.width > 0 && measured.height > 0 ? measured : FALLBACK_VIEWPORT;

  const unitMap = useMemo(() => unitIndex(units), [units]);
  const layout = useMemo(() => layoutClock(state.doc), [state.doc]);
  const issues = useMemo(() => validate(state.doc, units), [state.doc, units]);
  const dirty = !deepEqual(state.doc, state.loadedDoc) || state.etag === null;
  const canSave = dirty && issues.errors.length === 0;
  // The first validation error outranks "nothing to save": it tells the Commander what blocks the file.
  const disabledReason = issues.errors[0]?.message ?? (!dirty ? 'No changes to save' : undefined);

  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ current: AssemblyFile; etag: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const viewportState = useRef<ClockViewportState | null>(null);
  const onViewportState = useCallback((state: ClockViewportState) => {
    viewportState.current = state;
  }, []);
  const paletteDrop = usePaletteDrop(layout, container, viewportState, (unit, index) =>
    dispatch({ type: 'addSlot', unit, index }),
  );

  const save = useCallback(
    async (force = false) => {
      if (saving || (!force && !canSave)) return;
      setSaving(true);
      try {
        const options = force ? { force: true } : state.etag ? { etag: state.etag } : {};
        const result = await api.putAssembly(project, assembly, state.doc, options);
        dispatchAction({ type: 'saved', doc: result.assembly, etag: result.etag });
        setConflict(null);
        if (result.warnings.length > 0)
          toast.warning(
            `Saved with ${result.warnings.length} warning(s): ${result.warnings[0]!.message}`,
          );
        else toast.success('Assembly saved');
        void invalidate();
        if (result.assembly.name !== assembly) {
          void navigate({
            to: '/projects/$project/assemblies/$assembly',
            params: { project, assembly: result.assembly.name },
            replace: true,
          });
        }
      } catch (error) {
        if (error instanceof ConflictError) {
          setConflict({ current: error.current.data as AssemblyFile, etag: error.current.etag });
        } else if (error instanceof ValidationError) {
          toast.error(`The server refused the Assembly: ${error.message}`);
        } else if (error instanceof NameTakenError) {
          toast.error('An Assembly with this name already exists in the Project');
        } else {
          toast.error(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        setSaving(false);
      }
    },
    [assembly, canSave, invalidate, navigate, project, saving, state.doc, state.etag],
  );
  useSaveShortcut(() => void save(), canSave && !saving);

  const removeSelected = useCallback(() => {
    if (typeof state.selected !== 'string' || state.selected === 'core') return;
    const name = state.selected;
    if (referencesToSlot(state.doc, name).length > 0) setConfirmRemove(name);
    else dispatch({ type: 'removeSlot', name });
  }, [dispatch, state.doc, state.selected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !isEditableTarget(event.target) &&
        !confirmRemove
      ) {
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmRemove, removeSelected]);

  const filePath = health.data
    ? `${health.data.configHome}/projects/${project}/assemblies/${assembly}.yaml`
    : null;
  const launchReason =
    state.etag === null
      ? 'Save the Assembly first'
      : dirty
        ? 'Save your changes first'
        : issues.errors[0]?.message;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="assembly-editor">
      <DiscardGuard
        when={dirty && state.etag !== null ? dirty : dirty && state.doc.slots.length > 0}
      />
      <EditorHeader project={project} assembly={state.doc.name}>
        <ActiveMissionsNote count={activeMissions} subject="Assembly" />
        <OpenInEditorButton path={filePath} disabled={state.etag === null} />
        <LaunchButton
          project={project}
          assembly={assembly}
          disabled={!!launchReason}
          disabledReason={launchReason}
        />
        <SaveBar
          dirty={dirty}
          canSave={canSave}
          saving={saving}
          disabledReason={disabledReason}
          onSave={() => void save()}
        />
      </EditorHeader>
      <div className="flex min-h-0 flex-1">
        <UnitPalette
          units={units}
          dragging={paletteDrop.dragging?.unit ?? null}
          itemHandlers={paletteDrop.itemHandlers}
          onAppend={(unit) => dispatch({ type: 'addSlot', unit, index: state.doc.slots.length })}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={measureRef} className="min-h-0 flex-1">
            <ClockCanvas
              doc={state.doc}
              layout={layout}
              viewport={viewport}
              units={unitMap}
              issues={issues}
              selected={state.selected}
              dispatch={dispatch}
              onSelect={(selected) => dispatchAction({ type: 'select', selected })}
              onOpenInspector={() => dispatchAction({ type: 'openInspector', tab: 'general' })}
              onPlus={setPicker}
              container={container}
              viewportState={viewportState}
              onViewportState={onViewportState}
              paletteGap={paletteDrop.dragging?.gap ?? null}
            />
          </div>
          <IssuesList
            issues={issues}
            onSelect={(slot) => {
              dispatchAction({ type: 'select', selected: slot });
              dispatchAction({ type: 'openInspector' });
            }}
          />
        </div>
        {state.selected !== null && state.inspectorOpen && (
          <Inspector
            doc={state.doc}
            units={unitMap}
            issues={issues}
            selected={state.selected}
            tab={state.tab}
            onTab={(tab) => dispatchAction({ type: 'setTab', tab })}
            dispatch={dispatch}
            onClose={() => dispatchAction({ type: 'closeInspector' })}
          />
        )}
      </div>
      <UnitPicker
        open={picker !== null}
        units={units}
        onPick={(unit) => {
          if (picker !== null) dispatch({ type: 'addSlot', unit, index: picker });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <ConfirmDialog
        open={confirmRemove !== null}
        title={`Remove Slot "${confirmRemove ?? ''}"?`}
        description="Other Slots refer to this Slot; those references (Loops and Slot Output wiring) will be removed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmRemove) dispatch({ type: 'removeSlot', name: confirmRemove });
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
      <ConflictDialog
        open={conflict !== null}
        onCancel={() => setConflict(null)}
        onReload={() => {
          if (conflict)
            dispatchAction({ type: 'loaded', doc: conflict.current, etag: conflict.etag });
          setConflict(null);
        }}
        onOverwrite={() => void save(true)}
      />
    </div>
  );
}
