import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FakeEngine,
  FakeHost,
  MissionRegistry,
  RealGitClient,
  primaryAssembly,
  primaryProfile,
  primaryUnits,
  tempRepo,
  writeHome,
  type MissionEvent,
  type TempRepo,
  type UnitFile,
} from '@suptron/runtime';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuiltApp } from '../src/app.js';

export interface TestServer extends BuiltApp {
  app: FastifyInstance;
  repo: TempRepo;
  home: string;
  taskDir: string;
  engine: FakeEngine;
  host: FakeHost;
  registry: MissionRegistry;
  events: MissionEvent[];
  opened: string[];
  waitFor(predicate: (events: MissionEvent[]) => boolean, timeoutMs?: number): Promise<void>;
  waitForState(id: string, state: string): Promise<void>;
  startBody(overrides?: Record<string, unknown>): Record<string, unknown>;
  cleanup(): Promise<void>;
}

/** The primary Units with every `pnpm test` replaced by a command the temp repository can run. */
export function runnableUnits(): UnitFile[] {
  return primaryUnits().map((u) => ({
    ...u,
    doneCondition: u.doneCondition.map((c) =>
      c.kind === 'command' ? { ...c, command: 'true' } : c,
    ),
  }));
}

export async function testServer(): Promise<TestServer> {
  const repo = await tempRepo();
  const home = await mkdtemp(join(tmpdir(), 'suptron-home-'));
  const taskDir = await mkdtemp(join(tmpdir(), 'suptron-task-'));
  await writeFile(join(taskDir, 'SPEC.md'), '# My task\n');
  await writeHome(home, {
    units: runnableUnits(),
    projects: [{ profile: primaryProfile(repo.clonePath), assemblies: [primaryAssembly()] }],
  });
  const engine = new FakeEngine();
  const host = new FakeHost();
  const git = new RealGitClient();
  const registry = new MissionRegistry({
    home,
    engine,
    host,
    git,
    ciPollIntervalMs: 5,
    ciNoneGraceMs: 0,
    ciWaitTimeoutMs: 300,
  });
  const events: MissionEvent[] = [];
  registry.events.onAny((e) => events.push(e));
  const opened: string[] = [];
  const built = await buildApp({
    home,
    registry,
    engine,
    host,
    git,
    heartbeatMs: 50,
    openInEditor: async (path) => {
      opened.push(path);
    },
  });
  const waitFor = async (predicate: (events: MissionEvent[]) => boolean, timeoutMs = 10_000) => {
    const started = Date.now();
    while (!predicate(events)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out. Events: ${events.map((e) => e.type).join(', ')}`);
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  return {
    ...built,
    repo,
    home,
    taskDir,
    engine,
    host,
    registry,
    events,
    opened,
    waitFor,
    waitForState: (id, state) =>
      waitFor((es) =>
        es.some((e) => e.missionId === id && e.type === 'mission.state' && e.state === state),
      ),
    startBody: (overrides = {}) => ({
      project: 'my-app',
      assembly: 'feature',
      task: { kind: 'path', path: taskDir },
      checkoutPath: repo.clonePath,
      ...overrides,
    }),
    cleanup: async () => {
      for (const m of registry.list())
        if (m.state !== 'completed' && m.state !== 'stopped') await registry.stop(m.id);
      await registry.flush();
      await built.app.close();
      await Promise.all([
        repo.cleanup(),
        rm(home, { recursive: true, force: true }),
        rm(taskDir, { recursive: true, force: true }),
      ]);
    },
  };
}
