# Mission Universe

**ADRs:** ../../adr/0014-universe-beside-the-clock.md, ../../adr/0015-three-js-in-one-module.md, ../../adr/0016-a-fleet-not-a-robot.md, ../../adr/0017-three-js-without-a-react-layer.md, ../../adr/0018-one-picture-model-for-every-view.md
**Design:** ./DESIGN.md
**Status:** draft

## Problem Statement

The Commander watches every Mission on the clock: a ring of cards around a circle. It is correct and complete, but it is a diagram. The Commander wants the place where they spend their watching time to be beautiful and alive: a world in which every agent is a thing with a shape, seen the way a modern strategy game shows its map, and in the mood of the films they love (Dune, Arrival, Star Wars): space, the far future, something monumental and mysterious. The work is done for the pleasure of it, and it must not cost the Commander any of the information the clock gives today.

## Goal and Success Criteria

Give the Mission page an illustrated picture, the Universe, that the Commander prefers to the clock while a Mission runs.

- Everything the clock shows about a Mission is visible in the Universe, and every click the clock answers is answered the same way.
- The Commander can follow a Mission in the Universe without switching to the clock.
- The work is done when the functionality is complete and the Commander says so. There is no numeric bar; whether it is beautiful is the Commander's judgement.

## Solution

The Mission page opens with the Universe in the place where the clock is today; the header, the banner and the side panel stay as they are. A switch on the page brings the clock back, and the page remembers the Commander's last choice.

The Universe is deep space seen from one fixed angle, from above and aside. The Commander cannot turn the view, but can drag it and zoom: from far away the whole Mission reads at a glance, close up the details and the full labels appear.

| In the Mission | In the Universe |
|---|---|
| Core | a dark monolith in the centre; it pulses while the Core decides, and its light follows the state of the Mission |
| Slot with its Unit | a dock with a ship; the same Unit always has the same ship |
| Slot pending | the ship is dark, the dock's lights are dim |
| Slot running | the Pilot is aboard: engines and lights are on, a beam links the ship to the Core |
| Slot done | green lights on the dock |
| Slot failed | red lights on the dock |
| Human Checkpoint | a blinking yellow beacon over the dock |
| Needs Attention | an alarm over the whole picture and a red beacon on the dock concerned |
| name, Unit, Attempt, skipped rounds, cost | a text label at the dock |
| Sub-pilot | a small drone by the ship, lit while it is called |
| Side Slot | a small shuttle on its own pad beside the dock |
| Loop | an arc of energy back to the target dock, with its counter; it flashes when the Loop fires |
| Exit Point | a gate behind the dock; it lights up when the Mission leaves through it |
| Stopped | the picture on low power |
| Waiting for usage | the picture on low power, with the reset time at the Core |
| Completed | the gate the Mission left through is lit, the docks that are done are green |

The mood is muted and dark whatever theme the application uses: matte surfaces, fog, few lights. Colour is kept for meaning, so a state reads from far away. The world moves calmly: ships hover, lights pulse, a change of state is a smooth change of light.

## User Stories

1. As the Commander, I want the Mission page to open with the Universe, so that watching a Mission is a pleasure.
2. As the Commander, I want a switch back to the clock, so that an unfinished Universe never keeps me from my work.
3. As the Commander, I want the page to remember which picture I chose, so that I switch once and not on every Mission.
4. As the Commander, I want to see at a glance which Slot is running, so that I know where the Mission is.
5. As the Commander, I want done, failed and pending Slots to look different from far away, so that I can judge the Mission without reading.
6. As the Commander, I want a beacon on the Slot that is asking me a question, so that I notice a Human Checkpoint at once.
7. As the Commander, I want the whole picture to show an alarm in Needs Attention, so that I cannot miss it.
8. As the Commander, I want to read each Slot's name, Unit, Attempt count, skipped rounds and cost, so that I lose nothing the clock told me.
9. As the Commander, I want to see the Loops of the Assembly with their counters, so that I know how many rounds are spent.
10. As the Commander, I want a Loop to flash when it fires, so that I see the work going back.
11. As the Commander, I want to see the Exit Points and which one the Mission left through, so that I know how it ended.
12. As the Commander, I want to see the Sub-pilots of a Slot and whether one is working, so that I know who the Pilot called.
13. As the Commander, I want to see the Side Slots and their status, so that I know what runs beside the main line.
14. As the Commander, I want to see the Core's state and cost, so that I know what the Mission as a whole is doing.
15. As the Commander, I want to click a ship or its label and get that Slot's transcript in the side panel, so that the Universe works like the clock.
16. As the Commander, I want to click the monolith and get the Mission-level view, so that the Core is reachable the same way.
17. As the Commander, I want to click a drone or a shuttle and get that Sub-pilot's or Side Slot's view, so that nothing is reachable only from the clock.
18. As the Commander, I want the object under my pointer to light up, so that I know what a click will open.
19. As the Commander, I want the selected object to stay marked, so that I know whose transcript I am reading.
20. As the Commander, I want to zoom in and see more detail and fuller labels, so that the picture rewards a closer look.
21. As the Commander, I want to zoom out and see only what matters, so that a large Assembly stays readable.
22. As the Commander, I want to drag the picture, so that I can look at the part I care about.
23. As the Commander, I want the whole Assembly to fit the area when the page opens, so that I never start with half a picture.
24. As the Commander, I want each Unit to have its own ship, always the same one, so that I learn to recognise my Units.
25. As the Commander, I want the world to move calmly, so that it feels alive without distracting me from the transcript.
26. As the Commander, I want a Stopped Mission and one Waiting for usage to look powered down, so that I see that nothing runs.
27. As the Commander, I want the clock to appear with a stated reason when the Universe cannot be drawn, so that the Mission page is never empty.
28. As the Commander, I want to change how things look in one place, so that tuning the picture after seeing it is easy.
29. As the Commander, I want a change of world later to touch only the part that draws, so that changing my mind is affordable.

## Requirements

### Functional

1. The Mission page shows either the Universe or the clock in the same area; the header, the banner and the side panel are unchanged.
2. The page has a switch between the Universe and the clock. The Universe is the default. The last choice is remembered in the browser and applies to every Mission.
3. The Assembly editor keeps the clock and has no switch.
4. The Universe is seen from one fixed angle. The Commander can drag and zoom it and cannot rotate it.
5. When the page opens, the whole Assembly fits the area.
6. The Core is one object in the centre. It shows the state of the Mission and the Core's cost, and it reacts visibly while the Core is at work.
7. Every Slot of the Assembly is one dock with one ship, placed in the order of the Assembly.
8. A Slot's state (pending, running, done, failed) is shown by light and colour and can be told apart at the farthest zoom.
9. The Slot the Mission stands at is marked as the current one.
10. A Slot waiting at a Human Checkpoint carries a waiting marker; a Slot that put the Mission into Needs Attention carries an attention marker, and the whole picture shows Needs Attention.
11. Every Slot has a text label. At far zoom it shows the Slot's name and state; at close zoom it also shows the Unit (when its name differs from the Slot's), the Attempt count when above one, the skipped rounds when above zero, and the cost.
12. Every Loop is drawn from its Slot to its target with its counter and limit, and is highlighted for a moment when it fires.
13. Every Exit Point is drawn at its Slot and is lit when the Mission leaves through it.
14. Every Sub-pilot of a Slot is drawn by that Slot, with its status: not called, running, done.
15. Every Side Slot is drawn beside its Slot, with its status as recorded.
16. A Stopped Mission and a Mission Waiting for usage look powered down; Waiting for usage shows the reset time.
17. A Completed Mission shows the Exit Point it left through lit and the done Slots as done. There is no closing sequence.
18. Clicking a ship or its label selects that Slot; the monolith or its label selects the Mission; a drone or its label selects that Sub-pilot; a shuttle or its label selects that Side Slot. Each opens in the side panel exactly what the same click on the clock opens.
19. The object under the pointer is highlighted. The selected object stays marked, and the mark follows a selection made elsewhere on the page.
20. The ship of a Slot is chosen from the available ships by the name of its Unit, so that the same Unit has the same ship in every Mission and after every reload.
21. The picture is dark and muted whatever the application's theme. Green, red and yellow are used only for done, failed and waiting for the Commander.
22. Objects move calmly while idle; a change of state is shown as a smooth transition.
23. When the Universe cannot be drawn (the browser cannot draw 3D, or the models fail to load), the page shows the clock and one line that states the reason. The Mission itself is not affected.
24. The Universe shows what the Mission's live state says, with the same delay as the clock.

### Non-functional

1. Labels are real text, sharp at every zoom.
2. What the Universe shows for a given Mission state can be verified without drawing it.
3. The Mission page with the clock chosen costs the Commander nothing extra: what the Universe needs is loaded only when the Universe is shown.
4. An Assembly of twelve Slots with Loops, Sub-pilots and Side Slots stays readable and moves smoothly on the Commander's machine.
5. Everything about how the world looks (models, colours, lights, sizes, what a label shows at which zoom) is kept together, apart from the reading of the Mission's state.

## Constraints

- The repository is public. A model is used only when its licence allows committing its files (CC0, CC-BY); the authors of CC-BY models are named in the repository. A model with another licence is a separate decision of the Commander.
- No model is drawn for the project; all are taken ready. Copies of designs that belong to others (film or game vehicles, trademarked robots) are not used, whatever licence their uploader states.
- The formats of a Unit, an Assembly and a Mission do not change.
- The side panel, the header and the banner are used as they are.
- The Mission's live state gains what the picture needs and lacks: the server reports that the Core is at work.
- The clock looks and behaves as it does today. It reads the Mission through the same picture model as the Universe, so the layer between the Mission and the clock is rewritten; the drawing part shared with the Assembly editor is not.
- The existing tests of the clock keep passing.

## Out of Scope

- The Universe in the Assembly editor.
- Choosing a ship for a Unit by hand.
- A second world (a desert outpost, a hangar of robots) and any way to choose between worlds.
- Ships that fly, and a closing sequence when a Mission is Completed.
- Information beyond what the clock shows.
- Sound.
- Tests of the Universe: a separate piece of work, discussed once the architecture stands.
- Text drawn inside the 3D picture, and reaching the picture's objects by the keyboard.
- Removing the clock or the switch.

## Open Questions

- Which set of ships, which monolith, gate and dock models are used: decided in the PLAN, by the Commander looking at them in the picture.
- How large the docks ring may grow before the layout must change: to be found while building, answered by the Commander on a real Assembly.

## Further Notes

- The search for models was made on 2026-11-20. Candidates for the fleet: Quaternius Ultimate Spaceships (ten ships, CC0) and the Low Poly Spaceship series by duanesmind on Sketchfab (twelve ships, CC-BY). For the surroundings: Quaternius Modular Sci-Fi MegaKit and Sci-Fi Essentials Kit (CC0), the Jump Gate by doomsentinel and the Gangut space hub by comrade1280 on Sketchfab (CC-BY). The contents of the Sketchfab models were judged from previews, not from the files.
- A desert outpost with the same ships is the likely next world; a hangar of robots waits for better free models.
