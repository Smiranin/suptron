import type { AssemblyFile } from '@suptron/runtime/browser';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fitBox, layoutClock } from '../../src/features/assembly-editor/model/layout';
import type { Point } from '../../src/lib/geometry';
import { FakeHome, useFakeHome as installFakeHome } from '../fake-server';
import { primaryAssembly } from '../fixtures/primary';
import { renderApp } from '../render';

const VIEWPORT = { width: 900, height: 600 };
const ROUTE = '/projects/my-app/assemblies/feature';

/** Clock coordinates → the clientX/clientY a pointer would report (the container rect is zero in jsdom). */
function toScreen(doc: Pick<AssemblyFile, 'slots'>, point: Point) {
  const layout = layoutClock(doc);
  const fit = fitBox(layout.box, VIEWPORT);
  return {
    clientX: fit.translate.x + point.x * fit.scale,
    clientY: fit.translate.y + point.y * fit.scale,
  };
}

function slotPoint(doc: Pick<AssemblyFile, 'slots'>, name: string): Point {
  const layout = layoutClock(doc);
  return layout.slots.find((s) => s.name === name)!.position;
}

async function openEditor(route = ROUTE, home = FakeHome.primary()) {
  installFakeHome(home);
  const app = renderApp(route, home.live);
  await screen.findByTestId('assembly-editor');
  await screen.findByTestId('clock-canvas');
  return { ...app, home, user: userEvent.setup() };
}

const cardNames = () => screen.queryAllByTestId('slot-card').map((card) => card.dataset.slot);
const card = (name: string) =>
  screen.getAllByTestId('slot-card').find((c) => c.dataset.slot === name)!;
const chords = () =>
  screen.queryAllByTestId('loop-chord').map((c) => `${c.dataset.from}>${c.dataset.to}`);

function drag(
  target: Element,
  from: { clientX: number; clientY: number },
  to: { clientX: number; clientY: number },
) {
  fireEvent.pointerDown(target, { ...from, button: 0, pointerId: 1, isPrimary: true });
  fireEvent.pointerMove(target, { ...to, pointerId: 1, isPrimary: true });
  fireEvent.pointerUp(target, { ...to, button: 0, pointerId: 1, isPrimary: true });
}

async function save(home: FakeHome, user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Meta>}s{/Meta}');
  await waitFor(() =>
    expect(home.requestsTo('PUT', /assemblies\/feature/).length).toBeGreaterThan(0),
  );
  return home.requestsTo('PUT', /assemblies\/feature/).at(-1)!;
}

describe('Assembly editor: rendering', () => {
  it('renders the primary scenario as a clock', async () => {
    await openEditor();
    expect(cardNames()).toEqual([
      'analyst',
      'implementer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
    ]);
    expect(chords()).toEqual([
      'reviewer>implementer',
      'tester>implementer',
      'pr-reviewer>implementer',
    ]);
    expect(screen.getAllByText('max 3')).toHaveLength(3);
    const exits = screen.getAllByTestId('exit-arrow');
    expect(exits).toHaveLength(1);
    expect(exits[0]!.dataset.slot).toBe('pr-reviewer');
    expect(within(exits[0]!).getByText('when done')).toBeInTheDocument();
    expect(within(card('reviewer')).getByTestId('loop-badge')).toHaveTextContent(
      '↩ implementer, max 3',
    );
    expect(within(card('implementer')).getByLabelText('Persistent memory')).toBeInTheDocument();
    expect(within(card('analyst')).getByLabelText('May ask the Commander')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('draws dashed context chords for the selected Slot only', async () => {
    await openEditor();
    expect(screen.queryAllByTestId('context-chord')).toHaveLength(0);
    fireEvent.pointerDown(card('implementer'), {
      clientX: 10,
      clientY: 10,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(card('implementer'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    await waitFor(() => expect(screen.getAllByTestId('context-chord')).toHaveLength(1));
    expect(screen.getByTestId('context-chord').dataset.from).toBe('analyst');
    expect(screen.getByTestId('inspector')).toBeInTheDocument();
    fireEvent.pointerDown(card('reviewer'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    fireEvent.pointerUp(card('reviewer'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    await waitFor(() => expect(screen.queryAllByTestId('context-chord')).toHaveLength(0));
  });

  it('zooms with the wheel around the centre and Fit restores the transform', async () => {
    const { user } = await openEditor();
    const fit = fitBox(layoutClock(primaryAssembly()).box, VIEWPORT);
    const transform = () => screen.getByTestId('clock-transform').style.transform;
    await waitFor(() => expect(transform()).toContain(`scale(${fit.scale})`));
    fireEvent.wheel(screen.getByTestId('clock-canvas'), { deltaY: -300 });
    await waitFor(() => expect(transform()).not.toContain(`scale(${fit.scale})`));
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform())![1]);
    expect(scale).toBeGreaterThan(fit.scale);
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    await waitFor(() => expect(transform()).toContain(`scale(${fit.scale})`));
  });

  it('shows the empty-clock hint for a new Assembly and cannot save it', async () => {
    await openEditor('/projects/my-app/assemblies/new-one');
    expect(screen.getByText(/Drag a Unit from the palette/)).toBeInTheDocument();
    expect(cardNames()).toEqual([]);
    expect(screen.getByTestId('save-button')).toBeDisabled();
    expect(screen.getByTestId('launch-button')).toBeDisabled();
  });

  it('shows an unparseable file with Open in editor instead of the canvas', async () => {
    const home = FakeHome.primary();
    home.projects.get('my-app')!.assemblies.set('bad', { doc: null, text: 'name: [broken' });
    installFakeHome(home);
    renderApp('/projects/my-app/assemblies/bad', home.live);
    await screen.findByTestId('unparseable');
    expect(screen.getByText('name: [broken')).toBeInTheDocument();
    expect(screen.queryByTestId('clock-canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in editor/ })).toBeInTheDocument();
  });
});

describe('Assembly editor: canvas interactions', () => {
  it('drags a card along the ring to reorder', async () => {
    await openEditor();
    const doc = primaryAssembly();
    drag(
      card('reviewer'),
      toScreen(doc, slotPoint(doc, 'reviewer')),
      toScreen(doc, slotPoint(doc, 'implementer')),
    );
    await waitFor(() =>
      expect(cardNames()).toEqual([
        'analyst',
        'reviewer',
        'implementer',
        'tester',
        'publisher',
        'pr-reviewer',
      ]),
    );
    expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument();
    const arcs = screen.getByTestId('forward-arrows').querySelectorAll('path');
    expect([...arcs].map((a) => a.dataset.to)).toEqual([
      'analyst',
      'reviewer',
      'implementer',
      'tester',
      'publisher',
      'pr-reviewer',
    ]);
  });

  it('creates a Loop by dragging the failure handle onto an earlier Slot, not a later one', async () => {
    await openEditor();
    const doc = primaryAssembly();
    const handle = (name: string) =>
      screen.getAllByTestId('failure-handle').find((h) => h.dataset.slot === name)!;
    drag(
      handle('publisher'),
      toScreen(doc, slotPoint(doc, 'publisher')),
      toScreen(doc, slotPoint(doc, 'implementer')),
    );
    await waitFor(() => expect(chords()).toContain('publisher>implementer'));
    expect(within(card('publisher')).getByTestId('loop-badge')).toHaveTextContent(
      '↩ implementer, max 3',
    );
    const before = chords().length;
    drag(
      handle('analyst'),
      toScreen(doc, slotPoint(doc, 'analyst')),
      toScreen(doc, slotPoint(doc, 'tester')),
    );
    expect(chords()).toHaveLength(before);
    expect(screen.queryByTestId('loop-ghost')).not.toBeInTheDocument();
  });

  it('drops a Unit from the palette into a gap, suffixing repeated names', async () => {
    const home = FakeHome.primary();
    home.units.set('docs', {
      name: 'docs',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [],
      rules: '',
      instructions: '',
    });
    await openEditor(ROUTE, home);
    const item = screen.getAllByTestId('palette-unit').find((p) => p.dataset.unit === 'docs')!;
    let doc = primaryAssembly();
    let layout = layoutClock(doc);
    const gap = layout.plusPositions[1]!.position;
    const screenGap = toScreen(doc, gap);
    fireEvent.pointerDown(item, { clientX: -100, clientY: -100, button: 0, pointerId: 2 });
    fireEvent.pointerMove(item, { ...screenGap, pointerId: 2 });
    await waitFor(() =>
      expect(
        screen.getAllByTestId('plus-control').find((p) => p.dataset.index === '1')?.dataset
          .highlighted,
      ).toBe('true'),
    );
    fireEvent.pointerUp(item, { ...screenGap, button: 0, pointerId: 2 });
    await waitFor(() =>
      expect(cardNames()).toEqual([
        'analyst',
        'docs',
        'implementer',
        'reviewer',
        'tester',
        'publisher',
        'pr-reviewer',
      ]),
    );
    doc = { ...doc, slots: [doc.slots[0]!, { name: 'docs', unit: 'docs' }, ...doc.slots.slice(1)] };
    layout = layoutClock(doc);
    const second = toScreen(doc, layout.plusPositions[2]!.position);
    drag(item, { clientX: -100, clientY: -100 }, second);
    await waitFor(() =>
      expect(cardNames()).toEqual([
        'analyst',
        'docs',
        'docs-2',
        'implementer',
        'reviewer',
        'tester',
        'publisher',
        'pr-reviewer',
      ]),
    );
  });

  it('adds a Slot through the + control and the Unit picker', async () => {
    const { user } = await openEditor();
    await user.click(screen.getAllByTestId('plus-control').find((p) => p.dataset.index === '0')!);
    const picker = await screen.findByTestId('unit-picker');
    await user.click(within(picker).getByRole('button', { name: /tester/ }));
    await waitFor(() => expect(cardNames()[0]).toBe('tester-2'));
  });

  it('Delete asks for confirmation when other Slots refer to the Slot and strips the references', async () => {
    const { user } = await openEditor();
    fireEvent.pointerDown(card('implementer'), {
      clientX: 10,
      clientY: 10,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(card('implementer'), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    await screen.findByTestId('inspector');
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/Other Slots refer to this Slot/);
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(cardNames()).toEqual(['analyst', 'reviewer', 'tester', 'publisher', 'pr-reviewer']),
    );
    expect(chords()).toEqual([]);
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument();
  });
});

describe('Assembly editor: inspector', () => {
  async function select(name: string, double = false) {
    if (double) fireEvent.doubleClick(card(name));
    else {
      fireEvent.pointerDown(card(name), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
      fireEvent.pointerUp(card(name), { clientX: 10, clientY: 10, button: 0, pointerId: 1 });
    }
    return screen.findByTestId('inspector');
  }

  it('overrides the model on and off', async () => {
    const { user, home } = await openEditor();
    const inspector = await select('implementer', true);
    expect(within(inspector).getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(inspector).getByTestId('override-model')).toHaveTextContent('sonnet');
    await user.click(within(inspector).getByRole('switch', { name: 'Override Model' }));
    await user.click(within(inspector).getByRole('combobox', { name: 'Model' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Opus' }));
    await waitFor(() => expect(within(card('implementer')).getByText('opus')).toBeInTheDocument());
    let request = await save(home, user);
    expect((request.body as AssemblyFile).slots[1]).toMatchObject({
      name: 'implementer',
      model: 'opus',
    });
    await user.click(within(inspector).getByRole('switch', { name: 'Override Model' }));
    await waitFor(() =>
      expect(within(card('implementer')).getByText('sonnet')).toBeInTheDocument(),
    );
    request = await save(home, user);
    expect('model' in (request.body as AssemblyFile).slots[1]!).toBe(false);
  });

  it('wires Slot Outputs in the Context tab and draws the chord', async () => {
    const { user } = await openEditor();
    const inspector = await select('reviewer');
    await user.click(within(inspector).getByRole('tab', { name: 'Context' }));
    await user.click(
      within(inspector).getByRole('checkbox', { name: 'Read the Slot Output of analyst' }),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('context-chord').map((c) => c.dataset.from)).toEqual([
        'analyst',
      ]),
    );
  });

  it('forces the Exit Point on the last Slot and sets a Loop in the Loop tab', async () => {
    const { user } = await openEditor();
    let inspector = await select('pr-reviewer');
    await user.click(within(inspector).getByRole('tab', { name: 'Exit' }));
    const exit = within(inspector).getByRole('switch', { name: 'Exit Point' });
    expect(exit).toBeDisabled();
    expect(exit).toHaveAttribute('aria-checked', 'true');

    inspector = await select('publisher');
    await user.click(within(inspector).getByRole('tab', { name: 'Loop' }));
    await user.click(within(inspector).getByRole('combobox', { name: 'Loop target' }));
    await user.click(await screen.findByRole('option', { name: 'implementer' }));
    await waitFor(() => expect(chords()).toContain('publisher>implementer'));
    expect(within(inspector).getByLabelText('Iteration limit')).toHaveValue(3);
    await user.click(within(inspector).getByRole('button', { name: 'Remove Loop' }));
    await waitFor(() => expect(chords()).not.toContain('publisher>implementer'));
  });

  it('renames a Slot and rewrites the Loop targets', async () => {
    const { user, home } = await openEditor();
    const inspector = await select('implementer');
    const name = within(inspector).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'builder{Enter}');
    await waitFor(() => expect(cardNames()[1]).toBe('builder'));
    expect(chords()).toEqual(['reviewer>builder', 'tester>builder', 'pr-reviewer>builder']);
    const request = await save(home, user);
    expect(
      (request.body as AssemblyFile).slots.filter((s) => s.loop?.target === 'builder'),
    ).toHaveLength(3);
  });

  it('edits the Core Directives from the centre circle', async () => {
    const { user, home } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Core' }));
    const panel = await screen.findByTestId('core-panel');
    await user.click(within(panel).getByRole('combobox', { name: 'Model' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Sonnet' }));
    const request = await save(home, user);
    expect((request.body as AssemblyFile).core.model).toBe('sonnet');
  });
});

describe('Assembly editor: save, validation and conflicts', () => {
  it('lists errors, disables Save with the reason, selects the Slot and enables Save once fixed', async () => {
    const { user } = await openEditor('/projects/my-app/assemblies/broken');
    const error = screen.getByTestId('issue-error');
    expect(error).toHaveTextContent(/loops to a later Slot/);
    expect(screen.getByTestId('save-button')).toBeDisabled();
    expect(screen.getByTestId('launch-button')).toBeDisabled();
    expect(within(card('analyst')).getByTestId('card-error-badge')).toBeInTheDocument();
    await user.hover(screen.getByTestId('save-button').parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/loops to a later Slot/);
    await user.click(within(error).getByRole('button'));
    const inspector = await screen.findByTestId('inspector');
    expect(inspector).toHaveTextContent('analyst');
    await user.click(within(inspector).getByRole('tab', { name: 'Loop' }));
    await user.click(within(inspector).getByRole('button', { name: 'Remove Loop' }));
    await waitFor(() => expect(screen.queryByTestId('issue-error')).not.toBeInTheDocument());
    expect(screen.getByTestId('save-button')).toBeEnabled();
  });

  it('saves with If-Match, clears the dirty state and returns warnings', async () => {
    const { user, home } = await openEditor();
    const doc = primaryAssembly();
    drag(
      card('tester'),
      toScreen(doc, slotPoint(doc, 'tester')),
      toScreen(doc, slotPoint(doc, 'reviewer')),
    );
    await screen.findByTestId('unsaved-indicator');
    const request = await save(home, user);
    expect(request.headers['if-match']).toMatch(/^etag-/);
    expect((request.body as AssemblyFile).slots.map((s) => s.name)).toEqual([
      'analyst',
      'implementer',
      'tester',
      'reviewer',
      'publisher',
      'pr-reviewer',
    ]);
    expect((request.body as AssemblyFile).slots[2]?.exitPoint).toBeUndefined();
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument();
    expect(home.projects.get('my-app')!.assemblies.get('feature')!.doc!.slots[2]!.name).toBe(
      'tester',
    );
  });

  it('offers Reload and Overwrite on a conflict', async () => {
    const { user, home } = await openEditor();
    const serverDoc = { ...primaryAssembly(), slots: primaryAssembly().slots.slice(0, 5) };
    serverDoc.slots[4] = { ...serverDoc.slots[4]!, exitPoint: true };
    home.projects.get('my-app')!.assemblies.set('feature', { doc: serverDoc });
    const doc = primaryAssembly();
    drag(
      card('tester'),
      toScreen(doc, slotPoint(doc, 'tester')),
      toScreen(doc, slotPoint(doc, 'reviewer')),
    );
    await screen.findByTestId('unsaved-indicator');
    await user.keyboard('{Meta>}s{/Meta}');
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/changed on disk/);
    await user.click(within(dialog).getByRole('button', { name: 'Reload' }));
    await waitFor(() =>
      expect(cardNames()).toEqual(['analyst', 'implementer', 'reviewer', 'tester', 'publisher']),
    );
    expect(screen.getByText('Saved')).toBeInTheDocument();

    drag(
      card('tester'),
      toScreen(serverDoc, slotPoint(serverDoc, 'tester')),
      toScreen(serverDoc, slotPoint(serverDoc, 'reviewer')),
    );
    await screen.findByTestId('unsaved-indicator');
    home.projects.get('my-app')!.assemblies.set('feature', {
      doc: { ...serverDoc, core: { ...serverDoc.core, instructions: 'changed again' } },
    });
    await user.keyboard('{Meta>}s{/Meta}');
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Overwrite' }),
    );
    await waitFor(() => expect(home.requestsTo('PUT', /feature\?force=1/)).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('asks before leaving with unsaved changes', async () => {
    const { user, router } = await openEditor();
    const doc = primaryAssembly();
    drag(
      card('reviewer'),
      toScreen(doc, slotPoint(doc, 'reviewer')),
      toScreen(doc, slotPoint(doc, 'implementer')),
    );
    await screen.findByTestId('unsaved-indicator');
    await user.click(screen.getByRole('link', { name: 'Hangar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Discard changes?');
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe(ROUTE);
  });
});
