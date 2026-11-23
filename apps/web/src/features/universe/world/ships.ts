import { SHIP_COLOURS, SHIP_FILES, type ShipColour } from './models';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** The 32-bit FNV-1a hash of a string, as an unsigned number. */
function fnv1a(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** The ship a Unit flies: which model, painted in which colour. */
export interface ShipChoice {
  /** The index of the model in `SHIP_FILES`. */
  model: number;
  colour: ShipColour;
}

/**
 * The ship a Unit flies, picked by the Unit's name: the same Unit has the same ship in the same
 * colour in every Mission and after every reload. The model and the colour come from different
 * parts of one hash, so they do not follow each other.
 */
export function shipFor(unitName: string): ShipChoice {
  const hash = fnv1a(unitName);
  const model = hash % SHIP_FILES.length;
  const colour = SHIP_COLOURS[Math.floor(hash / SHIP_FILES.length) % SHIP_COLOURS.length]!;
  return { model, colour };
}
