# Suptron

Assemble specialized AI agents into one robot that carries any task from start to finish.

Like a combining robot, it is built from parts: Units wait in the Hangar, an Assembly mounts them into Slots, each Slot
is flown by a Pilot, the Core in the centre orchestrates, the Commander gives the orders, and the Laws hold whatever
happens. What a Mission produces is defined only by the Slots and their Conditions; the system has no built-in goal and
is not tied to one agent Engine.

The first use, and the scope of the POC, is software development: an Assembly takes a SPEC and a PLAN to a draft Pull
Request on top of Claude Code.

Status: POC implemented (runtime, Claude Engine adapter, GitHub host, local server, web UI).

## Vocabulary

Configuration (what you edit):

| Term                 | Meaning                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**             | A reusable agent definition: model, Rules (never broken), Instructions (how to work) and a Done Condition. Units live in the **Hangar**.                        |
| **Assembly**         | An ordered ring of Slots with the Core in the centre; one Assembly is one way of carrying a Task from start to finish.                                          |
| **Slot**             | One position in an Assembly: which Unit is mounted, what context it receives, its Loop and whether it is an Exit Point.                                         |
| **Core Directives**  | The Core's model and standing instructions, part of the Assembly.                                                                                               |
| **Project Profile**  | One per Project: where the repository is, its protected branch, Knowledge Sources, Git conventions, host and CI timeout. Every Assembly of the Project uses it. |
| **Knowledge Source** | A document or folder of the repository that Slots may read as background.                                                                                       |
| **Laws**             | What the system never lets any agent do, regardless of configuration: push to or change the protected branch, force-push, delete or rename branches, and so on. |

Execution (what happens when you press Launch):

| Term                | Meaning                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commander**       | You.                                                                                                                                                       |
| **Task**            | The work to do, given when a Mission starts: a folder or file (a SPEC, a PLAN, a ticket) or text typed in, optionally with a Work Item ID.                 |
| **Checkout**        | The local working copy (clone or worktree) the Mission works in. The system never creates, switches or deletes branches there.                             |
| **Mission**         | One run of an Assembly on one Task in one Checkout.                                                                                                        |
| **Pilot**           | The agent that executes a Slot, created from the Slot's Unit for this Mission. A Slot may be flown by several Pilots over a Mission (new Attempts, Loops). |
| **Core**            | The orchestrating agent in the centre: composes each Pilot's prompt, judges Checks, explains problems. It never edits code and never changes structure.    |
| **Check**           | A deterministic verification: a shell command, CI green, a Pull Request exists, no open review comments, or an LLM judgement on a criterion.               |
| **Done Condition**  | The Checks a Slot must pass before the Mission moves on; a failure starts a new **Attempt** up to the Slot's limit.                                        |
| **Loop**            | A Slot sending the Mission back to an earlier Slot with feedback (reviewer to implementer), up to a limit.                                                 |
| **Exit Point**      | A Slot where the Mission may end, when its Exit Condition holds; the last Slot is always one.                                                              |
| **Slot Output**     | The final message of a Pilot; later Slots may read it when their context says so.                                                                          |
| **Needs Attention** | The Mission is paused for the Commander: Retry with a note, or Stop.                                                                                       |
| **Engine**          | The coding agent that runs Pilots and the Core. The POC has one: Claude Code, using its local login.                                                       |

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

## First Mission

1. Copy the example configuration and point it at a repository you own:

   ```sh
   export SUPTRON_HOME="$HOME/.suptron"
   cp -R examples/suptron-home "$SUPTRON_HOME"
   # edit $SUPTRON_HOME/projects/my-app/profile.yaml: set repository.path to an absolute path of a clone
   ```

2. Make sure `gh auth status` succeeds and Claude Code is logged in on this machine (`claude` works in a
   terminal); the Engine runs on that login, no API key is needed.
3. Start the server and the UI: `mise run dev` (server on `http://127.0.0.1:4777`, UI on the Vite port it
   prints), or `mise run start` to serve the built UI from the server.
4. Open the UI, go to Projects, press Launch on the `feature` Assembly, pick a Checkout, give the Task
   (a folder or file with the SPEC and PLAN, or just type what has to be done), and start. The Mission page shows the clock, the
   transcript, questions from the analyst and the final report with the draft Pull Request.

Without the UI, the same flow is available over HTTP; see `docs/api.md`:

```sh
curl http://127.0.0.1:4777/api/health
curl http://127.0.0.1:4777/api/projects
curl -X POST http://127.0.0.1:4777/api/missions -H 'content-type: application/json' \
  -d '{"project":"my-app","assembly":"feature","task":{"kind":"path","path":"/path/to/task"},"checkoutPath":"/path/to/clone"}'
curl -N http://127.0.0.1:4777/api/events
```

## Editors

Units, Project Profiles and Assemblies are edited in the UI (Hangar and Projects areas) or by hand in
`SUPTRON_HOME`; both produce the same files. Saving from the UI rewrites the file canonically. "Open in
editor" runs `SUPTRON_EDITOR` (default `code --goto {path}`, falling back to `open` on macOS).

## Environment variables

| Variable                  | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `SUPTRON_HOME`            | Configuration home (default `~/.suptron`)                                      |
| `SUPTRON_PORT`            | Server port (default `4777`)                                                   |
| `SUPTRON_EDITOR`          | Command template for "Open in editor"                                          |
| `SUPTRON_CI_POLL_SECONDS` | Polling interval of the `ci_green` Check (default 15)                          |
| `ANTHROPIC_API_KEY`       | Optional: bill the Engine to an API key instead of the local Claude Code login |
