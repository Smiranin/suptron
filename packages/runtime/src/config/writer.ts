import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { etagOf } from './etag.js';
import { ASSEMBLIES_DIR, PROJECTS_DIR } from './paths.js';

export type WriteExpectation = { etag: string } | { create: true } | { force: true };

export type WriteResult =
  | { ok: true; etag: string }
  | {
      ok: false;
      reason: 'conflict' | 'exists' | 'missing';
      current?: { text: string; etag: string };
    };

/** Atomic writes inside `SUPTRON_HOME` with content ETags for optimistic concurrency. */
export class ConfigWriter {
  readonly home: string;

  constructor(home: string) {
    this.home = resolve(home);
  }

  etagOf(text: string): string {
    return etagOf(text);
  }

  /** Resolves a relative path and refuses anything that escapes the home. */
  resolve(relPath: string): string {
    const absolute = resolve(this.home, relPath);
    if (absolute !== this.home && !absolute.startsWith(this.home + sep)) {
      throw new Error(`Path escapes the configuration home: ${relPath}`);
    }
    return absolute;
  }

  async read(relPath: string): Promise<{ text: string; etag: string } | null> {
    try {
      const text = await readFile(this.resolve(relPath), 'utf8');
      return { text, etag: etagOf(text) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.resolve(relPath));
      return true;
    } catch {
      return false;
    }
  }

  /** Writes to `<file>.tmp-<random>` and renames, so an editor never sees a half-written file. */
  private async writeAtomic(absolute: string, text: string): Promise<void> {
    await mkdir(dirname(absolute), { recursive: true });
    const tmp = `${absolute}.tmp-${randomBytes(6).toString('hex')}`;
    try {
      await writeFile(tmp, text, 'utf8');
      await rename(tmp, absolute);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
  }

  async writeIfMatch(
    relPath: string,
    text: string,
    expected: WriteExpectation,
  ): Promise<WriteResult> {
    const current = await this.read(relPath);
    if ('create' in expected) {
      if (current) return { ok: false, reason: 'exists', current };
    } else if ('etag' in expected) {
      if (!current) return { ok: false, reason: 'missing' };
      if (current.etag !== expected.etag) return { ok: false, reason: 'conflict', current };
    }
    await this.writeAtomic(this.resolve(relPath), text);
    return { ok: true, etag: etagOf(text) };
  }

  /** Moves a file or folder; fails when the target exists. */
  async rename(fromRel: string, toRel: string): Promise<void> {
    const to = this.resolve(toRel);
    if (await this.exists(toRel)) throw new Error(`Target already exists: ${toRel}`);
    await mkdir(dirname(to), { recursive: true });
    await rename(this.resolve(fromRel), to);
  }

  async delete(relPath: string): Promise<void> {
    await rm(this.resolve(relPath), { force: true });
  }

  async createProject(name: string): Promise<void> {
    await mkdir(this.resolve(join(PROJECTS_DIR, name, ASSEMBLIES_DIR)), { recursive: true });
  }

  async deleteProject(name: string): Promise<void> {
    await rm(this.resolve(join(PROJECTS_DIR, name)), { recursive: true, force: true });
  }
}
