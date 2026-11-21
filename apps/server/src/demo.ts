// The demo: the server with the FakeEngine playing the demo voyage, in a fresh home of its own.
// Nothing is read from or written to the Commander's real home, and no model is called.
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FakeEngine,
  FakeHost,
  RealGitClient,
  installDemoScripts,
  writeDemoHome,
} from '@suptron/runtime';
import { serve } from './serve.js';

const DEMO_HOME = join(tmpdir(), 'suptron-demo-home');
/** Watching speed; `SUPTRON_DEMO_PACE=0.5` plays the voyage twice as fast. */
const DEFAULT_PACE = 1;

/** The pace `SUPTRON_DEMO_PACE` asks for; a value that is not a number of zero or more is refused. */
function demoPace(): number {
  const raw = process.env.SUPTRON_DEMO_PACE;
  if (raw === undefined) return DEFAULT_PACE;
  const pace = Number(raw);
  if (!Number.isFinite(pace) || pace < 0) {
    throw new Error(`SUPTRON_DEMO_PACE must be a number of zero or more, got "${raw}"`);
  }
  return pace;
}

/** Recreates the demo home from scratch and serves it with the demo voyage. */
async function demo(): Promise<void> {
  const pace = demoPace();
  await rm(DEMO_HOME, { recursive: true, force: true });
  await mkdir(DEMO_HOME, { recursive: true });
  await writeDemoHome(DEMO_HOME);
  const engine = new FakeEngine();
  installDemoScripts(engine, { pace });
  await serve({ home: DEMO_HOME, engine, host: new FakeHost(), git: new RealGitClient() });
}

demo().catch((error) => {
  console.error(error);
  process.exit(1);
});
