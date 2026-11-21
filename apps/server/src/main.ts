// Composition root: loads configuration and serves the real Engine and host.
import { join, resolve } from 'node:path';
import { ClaudeEngine } from '@suptron/engine-claude';
import { GitHubHost } from '@suptron/host-github';
import { RealGitClient, defaultConfigHome, sessionCostsRelPath } from '@suptron/runtime';
import { serve } from './serve.js';

async function main(): Promise<void> {
  const home = resolve(defaultConfigHome());
  const ciPoll = Number(process.env.SUPTRON_CI_POLL_SECONDS ?? '');
  await serve({
    home,
    engine: new ClaudeEngine({ sessionCostsPath: join(home, sessionCostsRelPath()) }),
    host: new GitHubHost(),
    git: new RealGitClient(),
    ...(Number.isFinite(ciPoll) && ciPoll > 0 && { ciPollIntervalMs: ciPoll * 1000 }),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
