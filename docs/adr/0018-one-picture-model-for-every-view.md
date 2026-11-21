# One immutable picture model feeds every view of a Mission; nothing is flagged or cached

Status: accepted (2026-11-20)

The clock was built for the POC without a model of its own: one function prepared part of what it draws, and the rest (the status of a Sub-pilot, the names of the Units, the highlight of a Loop) was worked out inside the component. The Universe is a second view of the same Mission, and a third one (another world, another drawing library) is expected. We decided that there is one **picture model**: plain data in the words of the Mission (Core, Slot, Sub-pilot, Side Slot, Loop, Exit Point), computed by one pure function from the state the Mission page already keeps. The clock and the Universe both draw it, and neither reads the state of the Mission any other way. That a Slot is a dock with a ship is known only to the view that draws it so.

How a change reaches the view follows three rules:

1. **The model is never changed in place.** Every change of the Mission gives a new model. Whether something changed is therefore never remembered anywhere: it is seen by comparing the old value with the new one.
2. **Data flows one way.** Events of the server and actions of the Commander enter the one reducer of the page; state gives the model; the model gives the views. A view never writes into the model. The only thing it sends back is an intent: "this element was clicked".
3. **Every view object compares its own piece.** A piece is small and flat (for a Slot about ten plain values). The object remembers what it applied last and does nothing when the values are the same.

A thing that has just happened (a Loop fired) is a fact with its time in the model, set by the reducer when the event arrives. How long it is shown and how is the view's business.

## Considered Options

- **One immutable model, compared by value in the view (chosen)**: no flags and no caches, so nothing to invalidate. The cost is that every element is visited on every change: about fifty elements a few times a second, which is microseconds.
- **A "needs redraw" flag on each element**: the Commander has seen this pattern grow unmanageable on another project. The flag is a second state beside the data: somebody must remember to raise it and somebody else to lower it, and in time nobody knows why it is up. Rejected.
- **Lazily computed, cached properties**: the same problem in another form: when to drop the cache becomes logic of its own that drifts from the data. Rejected.
- **Each view object subscribed to its piece of a store**: updates only who is concerned, at the price of a subscription mechanism, careful unsubscribing and an order of firing to watch. Worth it for thousands of elements changing many times a second. Rejected for now; it could replace the comparison inside the scene later without touching the model.
- **The reducer sends the view ready commands ("Slot X is now green")**: the truth is split between the model and a stream of commands, and after a reload there are no commands to rebuild the picture from. Rejected.
- **A model of its own for the Universe, the clock left as it is**: two places would decide which Slot is the current one and when a Sub-pilot counts as working, and they would drift apart. Rejected by the Commander: one model, as many views as wanted.
- **The model in a shared package, or computed by the server**: right when a second client exists. Today the web application is the only client; the model lives there in a folder that imports nothing from React, the browser or a drawing library, so that moving it later is moving files.

## Consequences

- The layer between the Mission and the clock is rewritten to read the picture model. The drawing part of the clock and the Assembly editor, which uses only that part, do not change.
- What is selected is state of the page, not a fact about the Mission, and is not part of the picture model: a view receives the model and the selection as two inputs. Both still pass through the same reducer.
- What is under the pointer, the zoom and the position of the camera mean nothing outside the picture and stay inside the view that owns them.
- When the picture needs a fact the state of the Mission does not hold, the state is extended at its source and the model is not bent around the gap. The first case: the server starts to report that the Core is at work.
