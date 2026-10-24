# @suptron/engine-claude

`ClaudeEngine` implements the runtime's `Engine` port on `@anthropic-ai/claude-agent-sdk`. It is the only package that imports the SDK.

- Pilots run with the `claude_code` system-prompt preset, `acceptEdits` plus a `canUseTool` callback that allows every tool and routes `AskUserQuestion` to the Commander (the SDK skips the callback in `bypassPermissions`), and the Laws enforced twice: a `PreToolUse` hook (`src/hooks.ts`) and `git`/`gh` shims prepended to `PATH` (`src/shim.ts`, bundled from `src/shim-main.ts` with esbuild into a temp directory once per process).
- The Core runs without tools and with `outputFormat: json_schema` when a schema is given.
- `AskUserQuestion` is answered through `canUseTool`: the handle emits a `question` event whose `respond()` / `dismiss()` settle the permission.

## Authentication

The SDK reads the Commander's environment untouched: `ANTHROPIC_API_KEY`, or the Bedrock / Vertex / Foundry variables. Nothing is stored. `GET /api/health` reports `healthCheck()`, which runs a one-turn query.

## Tests

`pnpm vitest run --project engine-claude` runs the unit tests (event mapping, hook decisions, shims against a temporary repository). They need `git` on `PATH` but no credentials.

The live smoke test is skipped unless `SUPTRON_LIVE=1`:

```sh
SUPTRON_LIVE=1 pnpm vitest run --project engine-claude
```

It runs a real Pilot in a temporary directory, expects a file to be created, a `git push --force` to be denied by the Laws, and a result with a cost. It also checks `healthCheck()` and `listModels()`.
