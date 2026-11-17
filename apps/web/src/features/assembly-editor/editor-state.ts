import type { AssemblyFile } from '@suptron/runtime/browser';
import type { AttachedFocus } from './inspector/AttachedPanel';
import { reduce, type Command } from './model/reducer';

export type Selection = string | 'core' | null;
export type InspectorTab = 'general' | 'context' | 'done' | 'loop' | 'exit' | 'attached';

export interface EditorState {
  doc: AssemblyFile;
  loadedDoc: AssemblyFile;
  etag: string | null;
  selected: Selection;
  inspectorOpen: boolean;
  tab: InspectorTab;
  /** The row of the Attached tab a click on a plate brought into view. */
  attachedFocus?: AttachedFocus;
}

export type EditorAction =
  | { type: 'command'; cmd: Command }
  | { type: 'select'; selected: Selection }
  | { type: 'selectAttached'; slot: string; focus: AttachedFocus }
  | { type: 'openInspector'; tab?: InspectorTab }
  | { type: 'closeInspector' }
  | { type: 'setTab'; tab: InspectorTab }
  | { type: 'loaded'; doc: AssemblyFile; etag: string | null }
  | { type: 'saved'; doc: AssemblyFile; etag: string };

export function initialEditorState(doc: AssemblyFile, etag: string | null): EditorState {
  return { doc, loadedDoc: doc, etag, selected: null, inspectorOpen: false, tab: 'general' };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'command': {
      const doc = reduce(state.doc, action.cmd);
      let selected = state.selected;
      if (action.cmd.type === 'removeSlot' && selected === action.cmd.name) selected = null;
      if (action.cmd.type === 'renameSlot' && selected === action.cmd.name) {
        const { newName } = action.cmd;
        selected = doc.slots.some((s) => s.name === newName) ? newName : selected;
      }
      if (
        action.cmd.type === 'replaceDoc' &&
        typeof selected === 'string' &&
        selected !== 'core' &&
        !doc.slots.some((s) => s.name === selected)
      ) {
        selected = null;
      }
      return { ...state, doc, selected };
    }
    case 'select': {
      // Selecting opens the inspector (FR-31); a double-click additionally forces the General tab (FR-29).
      const { attachedFocus: _dropped, ...rest } = state;
      void _dropped;
      return { ...rest, selected: action.selected, inspectorOpen: action.selected !== null };
    }
    case 'selectAttached':
      // A plate selects its Slot and opens the Attached tab at its row.
      return {
        ...state,
        selected: action.slot,
        inspectorOpen: true,
        tab: 'attached',
        attachedFocus: action.focus,
      };
    case 'openInspector':
      return { ...state, inspectorOpen: true, tab: action.tab ?? state.tab };
    case 'closeInspector':
      return { ...state, inspectorOpen: false };
    case 'setTab':
      return { ...state, tab: action.tab };
    case 'loaded':
      return { ...state, doc: action.doc, loadedDoc: action.doc, etag: action.etag };
    case 'saved':
      return { ...state, loadedDoc: action.doc, doc: action.doc, etag: action.etag };
    default:
      return state;
  }
}
