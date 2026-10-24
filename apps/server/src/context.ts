import type { ConfigWriter, Engine, GitClient, MissionRegistry, RepoHost } from '@suptron/runtime';
import type { ConfigService } from './config-service.js';
import type { EventHub } from './sse.js';
import type { TranscriptStore } from './transcript-store.js';
import type { UsageService } from './usage-service.js';

/** Everything the routes need, passed by the composition root. */
export interface ServerContext {
  config: ConfigService;
  writer: ConfigWriter;
  usage: UsageService;
  registry: MissionRegistry;
  engine: Engine;
  host: RepoHost;
  git: GitClient;
  transcripts: TranscriptStore;
  events: EventHub;
  openInEditor?: (path: string) => Promise<void>;
}
