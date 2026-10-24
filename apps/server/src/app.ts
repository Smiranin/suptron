import cors from '@fastify/cors';
import {
  ConfigWriter,
  type Engine,
  type GitClient,
  type MissionRegistry,
  type RepoHost,
} from '@suptron/runtime';
import Fastify, { type FastifyInstance } from 'fastify';
import { ConfigService } from './config-service.js';
import type { ServerContext } from './context.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMissionRoutes } from './routes/missions.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerToolRoutes } from './routes/tools.js';
import { registerUnitRoutes } from './routes/units.js';
import { EventHub } from './sse.js';
import { registerStatic } from './static.js';
import { TranscriptStore } from './transcript-store.js';
import { UsageService } from './usage-service.js';

export interface BuildAppOptions {
  home: string;
  registry: MissionRegistry;
  engine: Engine;
  host: RepoHost;
  git: GitClient;
  /** Directory of the built web application; served when it exists. */
  webDist?: string;
  logger?: boolean;
  heartbeatMs?: number;
  openInEditor?: (path: string) => Promise<void>;
}

export interface BuiltApp {
  app: FastifyInstance;
  context: ServerContext;
}

/** Wires the services and routes; the composition root supplies the adapters. */
export async function buildApp(options: BuildAppOptions): Promise<BuiltApp> {
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors, { origin: true });

  const transcripts = new TranscriptStore();
  const events = new EventHub(options.heartbeatMs);
  options.registry.events.onAny((event) => {
    transcripts.apply(event);
    events.publish(event);
  });

  const context: ServerContext = {
    config: new ConfigService(options.home),
    writer: new ConfigWriter(options.home),
    usage: new UsageService(options.registry),
    registry: options.registry,
    engine: options.engine,
    host: options.host,
    git: options.git,
    transcripts,
    events,
    ...(options.openInEditor && { openInEditor: options.openInEditor }),
  };

  registerHealthRoutes(app, context);
  registerUnitRoutes(app, context);
  registerProjectRoutes(app, context);
  registerMissionRoutes(app, context);
  registerToolRoutes(app, context);
  if (options.webDist) await registerStatic(app, options.webDist);

  return { app, context };
}
