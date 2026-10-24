export type { Check, CheckKind, Condition } from '../config/schemas.js';
import type { Check } from '../config/schemas.js';

/** The outcome of one Check evaluation. `timedOut` marks a `ci_green` Check that hit the Profile's timeout. */
export interface CheckResult {
  check: Check;
  holds: boolean;
  detail: string;
  timedOut?: boolean;
}
