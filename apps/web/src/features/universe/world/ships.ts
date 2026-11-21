import { SHIP_MODELS } from './models';

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

/**
 * The index of the ship a Unit flies, picked by the Unit's name: the same Unit has the same ship
 * in every Mission and after every reload.
 */
export function shipFor(unitName: string): number {
  return fnv1a(unitName) % SHIP_MODELS.length;
}
