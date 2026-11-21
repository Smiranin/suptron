import { Color, type ColorRepresentation } from 'three';
import { WORLD } from '../world/world';

/** The share of the way to its target a value covers in `deltaSeconds`, the same at any frame rate. */
function approachShare(deltaSeconds: number): number {
  return 1 - Math.exp(-WORLD.motion.approachRate * deltaSeconds);
}

/** A number that moves smoothly towards the target it was last given. */
export class SmoothNumber {
  private target: number;

  /** Starts at `value`, already at rest. */
  constructor(public value: number) {
    this.target = value;
  }

  /** Sets where the value goes; it gets there over the next frames. */
  set(target: number): void {
    this.target = target;
  }

  /** Moves the value one frame towards its target and returns it. */
  step(deltaSeconds: number): number {
    this.value += (this.target - this.value) * approachShare(deltaSeconds);
    return this.value;
  }
}

/** A colour that moves smoothly towards the target it was last given. */
export class SmoothColor {
  readonly value: Color;
  private readonly target: Color;

  /** Starts at `color`, already at rest. */
  constructor(color: ColorRepresentation) {
    this.value = new Color(color);
    this.target = new Color(color);
  }

  /** Sets where the colour goes; it gets there over the next frames. */
  set(target: ColorRepresentation): void {
    this.target.set(target);
  }

  /** Moves the colour one frame towards its target and returns it. */
  step(deltaSeconds: number): Color {
    return this.value.lerp(this.target, approachShare(deltaSeconds));
  }
}

/** A wave from 0 to 1 and back over `periodSeconds`, shifted by `phase` radians. */
export function wave(now: number, periodSeconds: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / (periodSeconds * 1000) + phase);
}

/** How much of its light a thing keeps at this power. */
export function powerFactor(power: 'normal' | 'low'): number {
  return power === 'low' ? WORLD.lights.lowPower : 1;
}
