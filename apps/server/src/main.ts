// Composition root: loads configuration, wires the adapters into the Runner,
// exposes REST + SSE on 127.0.0.1:4777 and serves apps/web/dist.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ClaudeEngine } from '@suptron/engine-claude';
import { GitHubHost } from '@suptron/host-github';
import { MissionRegistry, RealGitClient, defaultConfigHome } from '@suptron/runtime';
import { buildApp } from './app.js';

const DEFAULT_PORT = 4777;

async function main(): Promise<void> {
  const home = resolve(defaultConfigHome());
  const port = Number(process.env.SUPTRON_PORT ?? DEFAULT_PORT);
  const engine = new ClaudeEngine();
  const host = new GitHubHost();
  const git = new RealGitClient();
  const ciPoll = Number(process.env.SUPTRON_CI_POLL_SECONDS ?? '');
  const registry = new MissionRegistry({
    home,
    engine,
    host,
    git,
    ...(Number.isFinite(ciPoll) && ciPoll > 0 && { ciPollIntervalMs: ciPoll * 1000 }),
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
