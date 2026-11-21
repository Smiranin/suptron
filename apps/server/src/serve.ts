import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MissionRegistry, type Engine, type GitClient, type RepoHost } from '@suptron/runtime';
import { buildApp } from './app.js';

const DEFAULT_PORT = 4777;

export interface ServeOptions {
  home: string;
  engine: Engine;
  host: RepoHost;
  git: GitClient;
  /** How often CI is polled; the registry's default when absent. */
  ciPollIntervalMs?: number;
}

/**
 * Wires the adapters into the Runner, exposes REST + SSE on 127.0.0.1 (port `SUPTRON_PORT`, 4777
 * by default) and serves apps/web/dist, until SIGINT or SIGTERM.
 */
export async function serve({
  home,
  engine,
  host,
  git,
  ciPollIntervalMs,
}: ServeOptions): Promise<void> {
  const port = Number(process.env.SUPTRON_PORT ?? DEFAULT_PORT);
  const registry = new MissionRegistry({
    home,
    engine,
    host,
    git,
    ...(ciPollIntervalMs !== undefined && { ciPollIntervalMs }),
  });
  const recovered = await registry.recoverInterrupted();
  const webDist = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../web/dist');
  const { app } = await buildApp({ home, registry, engine, host, git, webDist, logger: true });
  await app.listen({ host: '127.0.0.1', port });
  app.log.info(
    { home, recovered: recovered.length },
    `Suptron server listening on http://127.0.0.1:${port} (SUPTRON_HOME=${home})`,
  );
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
