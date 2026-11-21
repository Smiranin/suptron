/** The model files the world names, loaded for one scene and freed with it. */
export interface LoadedAssets {
  /** Frees everything that was loaded. */
  dispose(): void;
}

/**
 * Loads the model files the world names. Every model is still a shape built in code, so there is
 * nothing to load yet and nothing to free.
 */
export async function loadAssets(): Promise<LoadedAssets> {
  return {
    dispose() {
      // Nothing was loaded.
    },
  };
}
