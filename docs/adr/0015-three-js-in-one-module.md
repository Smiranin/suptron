# Draw the Universe with three.js, kept inside one module, with no engine-neutral adapter

Status: accepted. Extended by [ADR-0017](0017-three-js-without-a-react-layer.md): three.js is driven directly, with no react-three-fiber.

The Universe is made of ready 3D models that must be lit, fogged and recoloured to one mood, and must stay sharp when the Commander zooms in. We decided to draw it with three.js, and to keep every line that knows three.js, together with everything about how the world looks, inside one module. The rest of the application hands that module a plain description of the picture (what objects exist, their states, what is selected, what just happened) and gets back which object was clicked. We do not build a generic layer that could sit on any 3D engine: replacing the library or the world means rewriting this one module and nothing else, not plugging in another one.

## Considered Options

- **three.js in one module (chosen)**: both three.js and Babylon.js do everything this scene needs with room to spare, so the choice fell on the larger body of examples and ready solutions and on the smaller weight. How three.js is tied to the application's state (through react-three-fiber or directly) is left to the PLAN.
- **Babylon.js**: a full engine with an inspector, a material editor, GUI and physics, and with better backward compatibility. The scene needs none of those except, at times, the inspector; it is heavier and has fewer examples. Rejected, and worth reconsidering only if the Universe grows into something a library cannot carry.
- **Pictures rendered in advance and laid out on a flat canvas**: the lightest at run time, but every object needs a picture per state, zoom blurs them, and a change of mood or of world means rendering everything again. Rejected.
- **A game engine exported to the web**: the strongest tools, but a separate program embedded in the page, slow to load and hard to connect to the live state of a Mission and to the side panel. Rejected.
- **An adapter interface that several engines could implement**: models, materials, light and fog are expressed in the terms of one library, so such a layer would be large and leaky, for a second engine that does not exist. Rejected in favour of the one-module boundary, which gives the same protection to the rest of the code.

## Consequences

- The description of the picture is plain data and can be tested without drawing anything; the module that draws cannot be tested by the project's existing unit tests.
- A second world (a desert outpost, a hangar of robots) is a rewrite of the look inside the same module, not a configuration switch. The first version has one world and no way to choose another.
- When 3D cannot start or the models do not load, the Mission page falls back to the clock and says why.
