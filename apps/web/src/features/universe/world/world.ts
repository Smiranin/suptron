/**
 * Everything about the look of the Universe: palette, lights, fog, sizes, distances, durations,
 * the camera and the labels. No other file of the module writes a colour, a size, a distance or
 * a duration as a literal. Plain data: this file imports nothing, so the labels can read it.
 *
 * Colours are 0xRRGGBB numbers for the scene and CSS strings for the labels. Distances are in
 * world units; one unit is roughly the width of a dock's ship.
 */
export const WORLD = {
  palette: {
    space: 0x05070b,
    /** Matte grey surfaces: hulls, docks, pads. */
    hull: 0x59616b,
    hullDark: 0x262b32,
    dock: 0x2e333a,
    dockEdge: 0x4a525c,
    /** The body of the Core's crystal, under the light it gives off. */
    crystal: 0x1b2330,
    /** The route between docks that the Mission has not run yet. */
    route: 0x8a96a6,
    /** The tint over a model's own picture: white leaves the picture as it was painted. */
    paint: 0xffffff,
    /** The calm light of things at work: running engines, the beam, the Core's glow. */
    work: 0x9fc3e6,
    /** The light of a dock whose Slot has not run. */
    idle: 0x3a4250,
    done: 0x3fae6a,
    failed: 0xd04545,
    waiting: 0xe0b23a,
    /** The mark of the Slot the Mission stands at. */
    current: 0xc8d2dc,
    /** The ring around the selected element. */
    selected: 0xe8eef4,
    alarm: 0xff2a2a,
    loop: 0x7f9cc0,
    loopFired: 0xd8ecff,
    exit: 0x55606c,
    exitLit: 0xd8ecff,
  },

  lights: {
    ambient: { color: 0x8090a8, intensity: 0.55 },
    /** The sun: from above and aside, like the camera. */
    key: { color: 0xdfe6ef, intensity: 1.6, position: [-40, 80, 50] },
    /** A cold light from behind, to separate shapes from the dark. */
    rim: { color: 0x6c87b0, intensity: 0.9, position: [50, 30, -70] },
    /** How much of every light is left on low power. */
    lowPower: 0.35,
    /** How strongly the alarm tints the ambient light at its peak. */
    alarmTint: 0.55,
  },

  /** Matte surfaces: rough, barely metallic. */
  surface: { roughness: 0.85, metalness: 0.15 },

  fog: { color: 0x05070b, nearFactor: 0.9, farFactor: 2.6 },

  stars: { count: 1400, radius: 900, size: 1.6, color: 0x9aa6b8, opacity: 0.7 },

  layout: {
    /** The radius of the ring of docks, at least, and per Slot. */
    minRadius: 9,
    radiusPerSlot: 1.5,
    /** How high a ship hovers over its dock. */
    shipHeight: 1.8,
    /** How high a Slot's label stands over its dock. */
    slotLabelHeight: 2.6,
    /** Sub-pilots: outward from the ship, on the side the ring comes from. */
    subPilotOutward: 2.6,
    subPilotAside: 1.6,
    subPilotStep: 1.1,
    subPilotHeight: 2.2,
    /** Side Slots: on their own pads, on the side the ring runs on to. */
    sideSlotOutward: 2.4,
    sideSlotAside: 2.4,
    sideSlotStep: 1.9,
    /** The gate of an Exit Point, behind the dock. */
    exitOutward: 4.4,
    exitHeight: 1.6,
    /** How far a Loop's arc is drawn towards the Core, as a share of the radius. */
    loopInward: 0.45,
    /** Room kept around everything when the whole Assembly is fitted into view. */
    fitMargin: 3,
  },

  sizes: {
    /** The column the Core's crystal floats over: its width and its height. */
    coreColumn: { span: 1.1, height: 3 },
    /** The Core's crystal: half its width, how much taller than wide it is, its gap over the column. */
    crystal: { radius: 0.9, stretch: 1.5, lift: 0.5 },
    /** The rings of light around the crystal, each tilted by its own angle in radians. */
    coreRings: [
      { radius: 1.8, tilt: 0.35 },
      { radius: 2.3, tilt: -0.6 },
    ],
    coreRingTube: 0.035,
    /** The plinth under the Core. */
    plinth: { radius: 3.2, height: 0.3 },
    /** The dock's platform model is stretched to this height; it is flatter by itself. */
    dock: { radius: 1.7, height: 0.2 },
    /** The ring of lights around a dock's edge. */
    dockLights: { radius: 1.75, tube: 0.07 },
    /** The longest side of a ship across the ground: its length or its wingspan. */
    ship: { span: 6.4 },
    currentRing: { inner: 2.05, outer: 2.3 },
    selectedRing: { inner: 2.45, outer: 2.6 },
    coreSelectedRing: { inner: 3.7, outer: 3.9 },
    beacon: { radius: 0.28, height: 3.2 },
    /** The band on the ground from a running dock to the Core. */
    beam: { width: 0.3 },
    /** The longest side of a Sub-pilot's drone across the ground. */
    subPilot: { span: 0.7 },
    sideSlotPad: { radius: 0.75, height: 0.18 },
    sideSlotShuttle: { radius: 0.32, height: 0.9 },
    smallSelectedRing: { inner: 0.55, outer: 0.65 },
    padSelectedRing: { inner: 0.9, outer: 1.02 },
    /** The band on the ground a Loop draws from one dock back to another. */
    loop: { width: 0.22, segments: 48 },
    /** How far marks on the ground float over it, so they never flicker into it. */
    markLift: 0.03,
    /** The route on the ground from dock to dock: its width, and the room left at each dock. */
    route: { width: 0.22, gap: 0.35, segments: 32 },
    /** The frame of an Exit Point's gate: its width and its height. */
    exitGate: { span: 2.6, height: 2.7 },
  },

  /** Light levels (emissive intensities) of the parts that glow. */
  glow: {
    off: 0,
    dim: 0.25,
    on: 1.2,
    hovered: 0.35,
    /** How bright a dock's platform lights up under the pointer. */
    dockHovered: 0.6,
    /** How bright a dock's platform glows while its ship is at work. */
    dockRunning: 0.5,
    /** How much lighter a ship is while it is at work: it glows in its own paint. */
    shipRunning: 0.35,
    beam: 0.7,
    core: { idle: 0.15, atWork: 0.9 },
    /** How bright a Loop flashes when it fires, and how bright it rests. */
    loop: { rest: 0.35, fired: 0.65 },
    exit: { rest: 0.1, lit: 1.6 },
    /** The light the Core casts on its plinth and the docks near it, at full glow. */
    coreLight: { intensity: 60, distance: 40 },
    /** How bright the rings around the crystal are, as a share of the crystal's glow. */
    coreRings: 0.8,
    /** How bright the route into a dock is: before the Mission reaches it, and after. */
    route: { ahead: 0.12, reached: 0.55 },
    /** How bright the marks on the ground are when shown. */
    mark: { selected: 0.9, current: 0.55, hovered: 0.25 },
    beacon: 1,
  },

  motion: {
    /** How fast a value moves towards its target, per second; higher is quicker. */
    approachRate: 3,
    /** The longest step of time one frame may take, so a tab coming back does not jump. */
    maxDeltaSeconds: 0.1,
    hover: { amplitude: 0.18, periodSeconds: 6 },
    /** The phase between two neighbouring ships, so they do not bob together. */
    hoverPhaseStep: 1.3,
    breathe: { periodSeconds: 5, depth: 0.15 },
    corePulse: { periodSeconds: 1.6, depth: 0.6 },
    beaconBlink: { periodSeconds: 1.2 },
    alarmBreathe: { periodSeconds: 2.4 },
    /** How long a fired Loop flashes. */
    loopFlashMs: 1500,
    subPilotSpin: 1.2,
    /** How fast the Core's crystal turns, and its rings at rest and at work, in radians a second. */
    coreSpin: { crystal: 0.25, ringsIdle: 0.15, ringsAtWork: 0.9 },
  },

  camera: {
    fov: 38,
    /** Degrees above the ground the camera looks down from; it never turns. */
    elevation: 52,
    /** Degrees around the vertical axis, from straight in front. */
    azimuth: -18,
    near: 0.5,
    far: 3000,
    /** How far the Commander may zoom in and out, relative to "the whole Assembly in view". */
    minZoom: 0.45,
    maxZoom: 6,
    dampingFactor: 0.12,
    /** A press and release closer than this, in pixels, is a click and not a drag. */
    clickTolerancePx: 4,
    /** Sharper than this costs more than it shows. */
    maxPixelRatio: 2,
  },

  labels: {
    /** From this zoom on, labels show their details. */
    closeFromZoom: 1.7,
    /** Pixels between a label and its anchor. */
    offsetPx: 6,
    text: '#d4dae1',
    muted: '#8c96a3',
    background: 'rgba(8, 10, 14, 0.72)',
    border: 'rgba(140, 150, 163, 0.25)',
    selectedBorder: 'rgba(232, 238, 244, 0.7)',
    done: '#5cc786',
    failed: '#e36a6a',
    waiting: '#ecc45a',
    running: '#a9cbec',
  },

  /** The CSS colour of the area while the Universe loads or has no WebGL yet. */
  spaceCss: '#05070b',
} as const;

/** How much a label shows: only what matters from far away, or the details close up. */
export type LabelDetail = 'far' | 'close';

/** The detail a label shows at this zoom (1 is "the whole Assembly in view"). */
export function labelDetail(zoom: number): LabelDetail {
  return zoom >= WORLD.labels.closeFromZoom ? 'close' : 'far';
}
