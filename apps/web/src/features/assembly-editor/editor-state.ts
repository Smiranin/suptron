import type { AssemblyFile } from '@suptron/runtime/browser';
import { reduce, type Command, type ReduceContext } from './model/reducer';

export type Selection = string | 'core' | null;
export type InspectorTab = 'general' | 'context' | 'done' | 'loop' | 'exit';

export interface EditorState {
  doc: AssemblyFile;
  loadedDoc: AssemblyFile;
  etag: string | null;
  selected: Selection;
  inspectorOpen: boolean;
  tab: InspectorTab;
}

export type EditorAction =
  | { type: 'command'; cmd: Command }
  | { type: 'select'; selected: Selection }
  | { type: 'openInspector'; tab?: InspectorTab }
  | { type: 'closeInspector' }
  | { type: 'setTab'; tab: InspectorTab }
  | { type: 'loaded'; doc: AssemblyFile; etag: string | null }
  | { type: 'saved'; doc: AssemblyFile; etag: string };

export function initialEditorState(doc: AssemblyFile, etag: string | null): EditorState {
  return { doc, loadedDoc: doc, etag, selected: null, inspectorOpen: false, tab: 'general' };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
  ctx: ReduceContext,
): EditorState {
  switch (action.type) {
    case 'command': {
      const doc = reduce(state.doc, action.cmd, ctx);
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
    case 'select':
      // Selecting opens the inspector (FR-31); a double-click additionally forces the General tab (FR-29).
      return { ...state, selected: action.selected, inspectorOpen: action.selected !== null };
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
