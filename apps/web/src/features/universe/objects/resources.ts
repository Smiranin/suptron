/** Anything three.js asks to be released by hand: a geometry, a material, a texture. */
interface Disposable {
  dispose(): void;
}

/**
 * The geometries, materials and textures one object created. Everything is created through
 * `track`, so `dispose` releases exactly what was made: creating and destroying stay symmetrical.
 */
export class Resources {
  private readonly items: Disposable[] = [];

  /** Remembers `item` for release and hands it back. */
  track<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  /** Releases everything tracked, once. */
  dispose(): void {
    for (const item of this.items.splice(0)) item.dispose();
  }
}
