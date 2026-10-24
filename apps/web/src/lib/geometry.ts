/** Clock geometry: 12 o'clock is 0°, angles grow clockwise. */
export interface Point {
  x: number;
  y: number;
}

export function toRadians(degrees: number): number {
  return ((degrees - 90) * Math.PI) / 180;
}

export function polarToCartesian(center: Point, radius: number, angle: number): Point {
  const rad = toRadians(angle);
  return { x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) };
}

/** The clock angle (0..360) of a point relative to the centre. */
export function angleOf(center: Point, point: Point): number {
  const degrees = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** An SVG arc along the ring from one angle to another, clockwise. */
export function arcPath(center: Point, radius: number, from: number, to: number): string {
  const start = polarToCartesian(center, radius, from);
  const end = polarToCartesian(center, radius, to);
  const sweep = normalizeAngle(to - from);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${fmt(start.x)} ${fmt(start.y)} A ${fmt(radius)} ${fmt(radius)} 0 ${largeArc} 1 ${fmt(end.x)} ${fmt(end.y)}`;
}

/** A quadratic chord between two ring points whose control point is pulled toward the centre. */
export function chordPath(
  center: Point,
  radius: number,
  from: number,
  to: number,
  pull = 0.45,
): string {
  const start = polarToCartesian(center, radius, from);
  const end = polarToCartesian(center, radius, to);
  const control = chordControl(center, radius, from, to, pull);
  return `M ${fmt(start.x)} ${fmt(start.y)} Q ${fmt(control.x)} ${fmt(control.y)} ${fmt(end.x)} ${fmt(end.y)}`;
}

export function chordControl(
  center: Point,
  radius: number,
  from: number,
  to: number,
  pull = 0.45,
): Point {
  const start = polarToCartesian(center, radius, from);
  const end = polarToCartesian(center, radius, to);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return { x: mid.x + (center.x - mid.x) * pull, y: mid.y + (center.y - mid.y) * pull };
}

/** The point on a quadratic curve at t (for badges). */
export function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  };
}

/** A radial segment leaving the ring outward. */
export function radialPath(center: Point, radius: number, angle: number, length: number): string {
  const start = polarToCartesian(center, radius, angle);
  const end = polarToCartesian(center, radius + length, angle);
  return `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(end.x)} ${fmt(end.y)}`;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
