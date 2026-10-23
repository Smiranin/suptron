# Suptron

Assemble specialized AI agents into one robot that carries any task from start to finish.

Like a combining robot, it is built from parts: Units wait in the Hangar, an Assembly mounts them into Slots, each Slot
is flown by a Pilot, the Core in the centre orchestrates, the Commander gives the orders, and the Laws hold whatever
happens. What a Mission produces is defined only by the Slots and their Conditions; the system has no built-in goal and
is not tied to one agent Engine.

The first use, and the scope of the POC, is software development: an Assembly takes a SPEC and a PLAN to a draft Pull
Request on top of Claude Code.

Status: environment skeleton only, no implementation yet.

## Repository layout

pnpm workspace, TypeScript strict, Vitest, ESLint, Prettier.

```
packages/
  runtime/         domain, configuration, Runner, Core client, Checks, Laws, events (no SDK, no HTTP)
  engine-claude/   Engine on @anthropic-ai/claude-agent-sdk (the only package that imports the SDK)
  host-github/     RepoHost on the gh CLI
  ui/              design tokens, bundled fonts and shadcn/ui primitives for apps/web
apps/
  server/          composition root: Fastify REST + SSE on 127.0.0.1:4777, serves apps/web/dist
  web/             Vite + React + TanStack Router + Tailwind single-page application
docs/              glossary, ADRs, SPECs and PLANs
```

Workspace packages export their TypeScript sources directly; the server runs through `tsx`, the web app is bundled by
Vite, so only `apps/web` has a real build output.

## Prerequisites

- [mise](https://mise.jdx.dev) — installs the pinned Node and pnpm from `mise.toml`.
- `git` and the GitHub CLI `gh`, authenticated (`gh auth login`).
- Claude Engine credentials in the environment: `ANTHROPIC_API_KEY` (or the Bedrock / Vertex variables of the Agent SDK).
  See `.env.example`.

## Getting started

```sh
mise trust
mise install          # Node and pnpm at the pinned versions
mise run setup:all    # checks prerequisites and installs dependencies
mise run dev          # server + web UI in watch mode
```

## Tasks

All everyday commands go through mise (`mise tasks` lists them):

| Task                  | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `mise run setup:all`  | Check prerequisites and install dependencies                 |
| `mise run dev`        | Server and web UI in watch mode                              |
| `mise run dev:server` | Server only                                                  |
| `mise run dev:web`    | Web UI only (proxies `/api` to the server)                   |
| `mise run build`      | Build everything                                             |
| `mise run start`      | Build, then run the server that serves the built UI          |
| `mise run typecheck`  | Type-check every package                                     |
| `mise run test`       | Run all tests once (`test:watch` for watch mode)             |
| `mise run lint`       | ESLint over the workspace                                    |
| `mise run format`     | Prettier over the workspace                                  |
| `mise run check`      | Typecheck, lint, format check and tests: run before a commit |

## Configuration home

Units, Project Profiles and Assemblies are plain files outside any work repository, in `SUPTRON_HOME` (default
`~/.suptron`):

```
$SUPTRON_HOME/
  hangar/<unit-name>.md
  projects/<project-name>/profile.yaml
  projects/<project-name>/assemblies/<assembly-name>.yaml
  missions/active.json        # written by the server, not configuration
```
