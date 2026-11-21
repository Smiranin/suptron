/** A small flat record of plain values: the look a view object was asked to take. */
export type Look = Readonly<Record<string, string | number | boolean | undefined>>;

/**
 * True when two looks hold the same values under the same keys. This comparison is how a view
 * object learns that its piece of the picture changed: there is no flag and no subscription.
 */
export function sameLook(previous: Look | null, next: Look): boolean {
  if (previous === null) return false;
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(previous).length) return false;
  return keys.every((key) => previous[key] === next[key]);
}
