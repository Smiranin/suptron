import type { PanelSelection } from '../missions/model/types';
import type { MissionPicture } from '../missions/picture';

/** Why the Universe could not be drawn from inside the module. */
export type UniverseFailure = 'no-webgl2' | 'model-load' | 'context-lost';

export interface UniverseProps {
  picture: MissionPicture;
  selection: PanelSelection;
  /** A click on an object or on its label. Loops and Exit Points are not reported. */
  onSelect(selection: PanelSelection): void;
  /** Called once; the page then shows the clock. */
  onFailure(failure: UniverseFailure): void;
}
