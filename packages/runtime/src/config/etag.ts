import { createHash } from 'node:crypto';

/** Content hash used as the ETag of a configuration file. */
export function etagOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
