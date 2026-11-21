# Drive three.js directly, with no React layer between the application and the scene

Status: accepted (2026-11-20)

[ADR-0015](0015-three-js-in-one-module.md) chose three.js for the Universe and left open how it is tied to the application's state: through react-three-fiber or directly. We decided to use three.js directly. The module that draws holds one scene object written in plain three.js; React creates it when the Universe appears on the page, hands it the new picture every time the Mission changes, and destroys it when the Universe leaves the page. React knows nothing about three.js, and the scene knows nothing about React. The Commander's reason: a layer that wraps a library is quick for a simple application and turns into a cost in a serious one, because the project then depends on the wrapper's release rhythm and on its idea of how the library should be used.

## Considered Options

- **three.js directly (chosen)**: one dependency, no coupling between the version of React and the version of the 3D library, a smaller lazy chunk (about 160 KB gzip against 280 KB, measured on 2026-11-20 with three r187). We write ourselves what a layer would give: finding the object under the pointer with enter, leave and click, the frame loop, the reaction to a change of size, and freeing the memory of the scene. This is affordable because the set of objects is fixed for the whole Mission: an Assembly does not change while it runs, so objects are built once and afterwards only take a new state.
- **react-three-fiber with helpers from drei**: the scene is written as React components, pointer events and disposal come for free, and a model that fails to load reaches an ordinary error boundary. Rejected: at the time of the decision react-three-fiber 9.8 accepted only React below 19.4, so every React upgrade would wait for it; its next major version changes the default renderer; drei brings its own copies of the loaders and a default decoder path on a CDN.

## Consequences

- Creating and destroying the scene must be exactly symmetrical: React's strict mode mounts twice in development, and every leaked drawing context counts against the browser's limit.
- A failed model load and a lost drawing context are handled by the module's own code, not by an error boundary; the outcome is the same as in ADR-0015: the clock and one line with the reason.
- Replacing three.js with another library is still a rewrite of this one module, as ADR-0015 says; no React component outside it changes.
