# Export and Import: Implementation Plan

**SPEC:** ./SPEC.md
**ADRs:** ../../adr/0013-export-and-import.md
**Status:** implemented

## Summary

We add one page, **Export & Import**, and four JSON routes behind it. An Export is a `.zip` whose entries are the files of the configuration home, at the same relative paths (ADR-0013). The zip is only a container, and it lives entirely in the browser: the server hands out and takes in a plain list of `{ path, text }` files, the browser packs them into a zip for download and unpacks a chosen zip before sending its files to the server. The server therefore stays JSON-only (no multipart, no binary parser, no staged upload), and an Import is stateless: the browser holds the unpacked files and sends them with the Commander's choices, once per preview and once more to apply.

Everything that knows the Export layout or compares elements lives in one new runtime module, `packages/runtime/src/transfer/`:

- `collectExport` turns a selection into the files to export, using the raw texts the loader already read.
- `planImport` is a pure function over the loaded configuration, the files and the choices. It rejects a file set that is not an Export, marks every element new, same or different, decides what will be written, and validates every element against the configuration as it will be after the Import. Preview and apply both call it, so they can never disagree.
- `applyImport` writes the plan's files through `ConfigWriter` and puts the home back as it was when a write fails.

"Same" means equal text after CRLF is turned into LF; imported files are written with LF. Nothing is overwritten unless the choices name it: an element that differs and is not listed under `replace` is kept, which is also what protects a change made between preview and apply.

## Current State

- **Configuration home layout** (`packages/runtime/src/config/paths.ts`): `hangar/<name>.md` (`unitRelPath`), `projects/<project>/profile.yaml` (`profileRelPath`), `projects/<project>/assemblies/<assembly>.yaml` (`assemblyRelPath`), and `missions/…` for the ledger and Mission folders. The module imports `node:os`, so it is not browser-safe.
- **Loading** (`packages/runtime/src/config/load.ts`): `loadConfig(home)` returns `LoadedConfig { home, units, projects }`. `LoadedUnit`, `LoadedProject` and `LoadedAssembly` each carry the raw `text` and an `etag`; invalid and unparseable files are listed with `unit: null` / `profile: null` / `status`. A missing `profile.yaml` yields the Issue `missing_profile` and `text: ''`. Pure parsers exist for two of the three kinds: `parseProfileText(name, text)` and `parseAssemblyText(name, text, units, capabilities)`. For a Unit, `parseUnitMarkdown(text)` (`config/unit-markdown.ts`) is pure, but the `name_mismatch` check sits inside `loadUnit(path)`, which reads the disk.
- **Validation**: `validateAssembly(assembly, units: ValidationUnit[], capabilities)` is pure; `capabilitiesOf(profile.workspace)` is in `workspace/kinds.ts`; `validateOuterFolders(folders, configHome)` (`config/outer-folders.ts`) is Node-only and `loadProject` applies it. Problems are `Issue { code, message, slotName?, path? }` (`config/schemas.ts`); Assemblies use `{ errors, warnings }`.
- **Line endings**: the Unit frontmatter regex and section split accept `\r?\n`; YAML parsing accepts CRLF. `etagOf(text)` hashes the raw text, so an etag cannot be used to compare an LF and a CRLF copy.
- **Units placed by an Assembly**: `unitsOfSlot(slot)` in `config/usage.ts` returns the Slot's Unit, its Sub-pilots' Units, its Side Slots' Units and their Sub-pilots' Units.
- **Writing** (`config/writer.ts`): `ConfigWriter(home)` with `read`, `exists`, `writeIfMatch(relPath, text, {etag}|{create:true}|{force:true})`, `delete`, `createProject`, `deleteProject`. One write is atomic (temp file + rename, parent created). There is no multi-file transaction.
- **Serialising**: `serializeProfile(profile)` (`config/serialize.ts`) writes the canonical form every Profile route already writes.
- **Server** (`apps/server`): Fastify 5. `buildApp` (`src/app.ts`) builds a `ServerContext` (`config: ConfigService`, `writer: ConfigWriter`, …) and calls one `registerXRoutes(app, ctx)` per file in `src/routes/`. Bodies are checked with zod (`safeParse` → `badRequest(reply, issuesFromZod(error))`), errors go through `src/errors.ts` (`fail`, `notFound`, `badRequest`). Only JSON bodies are parsed, with Fastify's default 1 MiB limit. No route sends or receives a file.
- **Web** (`apps/web`): React 19, TanStack Router (code-based tree in `src/router.tsx`, nothing lazy), TanStack Query (`src/api/queries.ts`), `request<T>()` in `src/api/client.ts` (JSON only, maps 400 to `ValidationError(issues)`, other statuses to typed errors or `HttpError`). `src/api/missions.ts` is the example of a per-feature API object. Navigation is hard-coded JSX in `src/components/shell-navigation.tsx`; `SidebarFooter` is exported by `@suptron/ui/components/sidebar` and unused. No file input, Blob download or zip library exists.
- **Shared types**: the web imports configuration types and schemas from `@suptron/runtime/browser` (`packages/runtime/src/browser.ts`, must never pull in `node:`); response wrappers are written by hand in `apps/web/src/api/types.ts`.
- **A running Mission** works on the snapshot taken at start (`config/snapshot.ts`, `MissionRegistry.start`) and never reads the home again, so FR-18 already holds and needs no code.

Limitations to overcome: no way to get raw files out of or into the home over HTTP; no pure Unit parser that includes the name check; no multi-file all-or-nothing write; `/api/projects` does not say which Units a Project's Assemblies place; nothing in the browser handles files.

## Target Architecture

### Modules and Responsibilities

**`packages/runtime/src/transfer/` (new)**

- `types.ts`: the contract types (see Interfaces). Type-only, no imports from `node:`; re-exported with `export type` from `browser.ts` and from `index.ts`.
- `layout.ts`: the Export layout. `elementOfPath(path)` classifies a POSIX relative path as a Unit, Profile or Assembly or returns `null`; `pathOfElement(ref)` builds the path. Built on the `…RelPath` helpers of `config/paths.ts` and `NAME_PATTERN`, with separators forced to `/`. It is the only place that knows which paths an Export may hold. It must not know about zip.
- `export.ts`: `listExportContents(config)` and `collectExport(config, selection)`. Reads only `LoadedConfig`; never touches the disk; never returns anything under `missions/`.
- `plan-import.ts`: `planImport(config, files, choices)`. Pure. Owns rejection, comparison, the effect of the choices, path edits and validation of the result. It must not write and must not know about HTTP.
- `project-paths.ts`: `projectPathsOf(profile)` and `withProjectPaths(profile, paths)`: reading and replacing the machine-bound paths of a Profile. Pure.
- `apply-import.ts`: `applyImport(writer, writes)`. Owns the order of writes and the rollback. It takes the `writes` of a plan and knows nothing about how they were decided.
- `index.ts`: re-exports the above.

**`packages/runtime/src/config/load.ts` (changed)**: gains the pure `parseUnitText(name, text)` (parse plus `name_mismatch`), extracted from `loadUnit`, which now calls it.

**`apps/server/src/routes/transfer.ts` (new)**: `registerTransferRoutes(app, ctx)`. Thin: check the body with zod, load the configuration through `ctx.config`, call the transfer module, map the result to a response. Holds the body limit constant for the Import routes.

**`apps/web/src/features/export-import/` (new)**

- `archive.ts`: the zip container. `packExport(files)` and `unpackExport(bytes)`, built on `fflate`. Knows zip, UTF-8 and operating system leftovers; does not know the Export layout.
- `download.ts`: `downloadFile(bytes, fileName, mimeType)` through a Blob URL, and `exportFileName(date)`.
- `export-selection.ts`: pure functions over the Export selection (initial selection, toggling a Unit, toggling a Project with its Units).
- `ExportImportPage.tsx`: the page; two sections.
- `ExportSection.tsx`: the checkbox lists and the Export button.
- `ImportSection.tsx`: the file input, the state of one Import (files, choices), preview and apply.
- `ImportPreview.tsx`: the element list with status, choice and problems.
- `ProjectPathsFields.tsx`: the path editors of one Profile, built on `PathField`.
- `ImportSummary.tsx`: what was added and replaced.

**`apps/web/src/api/transfer.ts` (new)**: `transferApi` with the four calls, in the style of `api/missions.ts`.

### Relations and Data Flow

```
Export
  ExportSection ── GET /api/export/contents ──▶ listExportContents(config)
  ExportSection ── POST /api/export {selection} ──▶ collectExport(config, selection) ──▶ { files }
  ExportSection ── packExport(files) ──▶ downloadFile(…, "suptron-export-<date>.zip")

Import
  file input ── unpackExport(bytes) ──▶ files (kept in ImportSection state)
  ImportSection ── POST /api/import/preview {files, choices} ──▶ planImport ──▶ plan.preview
        ▲ repeated whenever a choice or a path changes
  ImportSection ── POST /api/import/apply {files, choices} ──▶ planImport ──▶ applyImport(writer, plan.writes) ──▶ summary
```

Dependencies point one way: web → `@suptron/runtime/browser` (types only); server routes → `@suptron/runtime` transfer module → `config/*`. The transfer module depends on `config/` and `workspace/kinds.ts` and on nothing in `runner/`.

The server keeps no state between preview and apply. Apply plans again from the home as it is at that moment; an element that became different in between is not named in `replace`, so it is kept.

### Patterns and Technologies

- **One pure planning function used twice** (preview and apply) instead of a preview that is stored and later executed.
- **Read the before-state, write, restore on failure** for all-or-nothing, on top of the existing atomic single-file write. No staging directory and no directory swap.
- **`fflate`** (new dependency of `apps/web` only; add the current version with `pnpm --filter @suptron/web add fflate`): `zipSync`, `unzipSync`, `strToU8`. It writes a standard deflate zip that the file managers of macOS, Windows and Linux open.
- **TanStack Query** for the preview, keyed by the files and the choices, with `placeholderData: keepPreviousData` so the list does not blink while a new preview loads; `useMutation` for export and apply; `useInvalidateConfig()` after apply.
- **Not applied**: multipart upload, a server-side zip library, a staged Import on the server, etag checks between preview and apply, validation in the browser, react-hook-form (the Import is a list of choices, not a form with a schema), a generic "problems" component shared with the Assembly editor.

## Interfaces and Contracts

### Types: `packages/runtime/src/transfer/types.ts`

```ts
/** One file of an Export: a POSIX path relative to the configuration home and its text. */
interface TransferFile { path: string; text: string }

interface ExportSelection { units: string[]; projects: string[] }

interface ExportContents {
  units: { name: string; title?: string }[]
  /** `units`: names of Hangar Units placed by the Project's Assemblies. */
  projects: { name: string; title?: string; units: string[] }[]
}

type ElementKind = 'unit' | 'profile' | 'assembly'
interface ElementRef { kind: ElementKind; name: string; project?: string }

/** The machine-bound paths of one Profile. */
interface ProjectPaths {
  /** `null` for the Workspace kind `none`. */
  workspace: string | null
  outerFolders: string[]
  /** Knowledge Sources given as absolute paths; `index` is the position in the Profile's list. */
  knowledgeSources: { index: number; path: string }[]
}

interface ImportChoices {
  /** Paths of different elements the Commander chose to replace. */
  replace: string[]
  /** Edited paths, by Project name. A Project that is absent keeps the paths of the file. */
  paths: Record<string, ProjectPaths>
}

type ImportStatus = 'new' | 'same' | 'different'
type ImportAction = 'add' | 'replace' | 'keep' | 'none'

interface ImportElement extends ElementRef {
  path: string
  title?: string
  status: ImportStatus
  /** new → add; same → none; different → replace when chosen, else keep. */
  action: ImportAction
  /** Problems of the version that will exist after the Import. */
  issues: { errors: Issue[]; warnings: Issue[] }
  /** Profiles only: present when the Profile will be written and can be parsed. */
  paths?: ProjectPaths
}

interface ImportPreview { elements: ImportElement[] }

interface ImportWrite { path: string; text: string; action: 'add' | 'replace' }

interface ImportSummary { added: ElementRef[]; replaced: ElementRef[] }
```

### Functions

```ts
// transfer/layout.ts
elementOfPath(path: string): ElementRef | null
pathOfElement(ref: ElementRef): string

// transfer/export.ts
listExportContents(config: LoadedConfig): ExportContents
collectExport(config: LoadedConfig, selection: ExportSelection):
  { ok: true; files: TransferFile[] } | { ok: false; issues: Issue[] }

// transfer/plan-import.ts
planImport(config: LoadedConfig, files: readonly TransferFile[], choices: ImportChoices):
  { ok: true; preview: ImportPreview; writes: ImportWrite[] } | { ok: false; issues: Issue[] }

// transfer/project-paths.ts
projectPathsOf(profile: ProfileFile): ProjectPaths
withProjectPaths(profile: ProfileFile, paths: ProjectPaths): ProfileFile

// transfer/apply-import.ts
applyImport(writer: ConfigWriter, writes: readonly ImportWrite[]): Promise<ImportSummary>  // throws ImportFailedError

// config/load.ts
parseUnitText(name: string, text: string): { unit: UnitFile | null; issues: Issue[] }
```

### Rules the functions encode

**Export**

- `listExportContents`: every Unit of the Hangar (invalid ones too, without a title) and every Project folder. A Project's `units` is the union of `unitsOfSlot` over the Slots of its Assemblies that could be parsed (`assembly !== null`), kept only where the Hangar has a Unit of that name, sorted.
- `collectExport`: for each chosen Unit its `text`; for each chosen Project its Profile `text` (left out when the Profile file is missing) and the `text` of every Assembly. Texts are passed on untouched. A name the home does not have gives `ok: false` with code `unknown_unit` / `unknown_project`; an empty selection gives `empty_selection`.

**Rejection** (`planImport`, `ok: false`; FR-9). Checked before anything else, in this order, collecting every offending path:

| Code | When |
|---|---|
| `empty_export` | no files |
| `outside_layout` | `elementOfPath(path)` is `null` (this covers names that break the name rule, `missions/…`, a wrapping top folder, `..`, absolute paths) |
| `duplicate_path` | the same path twice |
| `invalid_paths` | `choices.paths` names a Project whose Profile will not be written or cannot be parsed, or its shape differs from `projectPathsOf` of the file's Profile (other length of `outerFolders`, other `index` set, `workspace` null where the file has a path or the reverse) |

Messages name the path and say why, in the Commander's words ("`notes/readme.txt` is not part of an Export").

**Comparison** (FR-10, FR-11). `normalize(text)` replaces `\r\n` with `\n`. An element is `new` when the home has no file at its path, `same` when `normalize(file.text) === normalize(local.text)`, otherwise `different`. A local Profile that is missing (`missing_profile`) counts as no file.

**What is written** (FR-12, FR-14). `add` for `new`; `replace` for `different` whose path is in `choices.replace`; nothing else. The written text is `normalize(file.text)`, except for a Profile whose `choices.paths` entry differs from `projectPathsOf` of the file's Profile: then it is `serializeProfile(withProjectPaths(profile, paths))`. Paths in `choices.replace` that are not `different` elements are ignored.

**Path editing**. `ImportElement.paths` is set for a Profile with action `add` or `replace` whose file text parses (`parseProfileText(...).profile !== null`); it holds the edited values when `choices.paths` has the Project, otherwise the values of the file. `knowledgeSources` lists only sources with a `path` that `isAbsolutePath` accepts. `withProjectPaths` replaces values only; it never adds or removes an Outer Folder or a Knowledge Source.

**Validation of the result** (FR-15). Build the configuration as it will be: the home's Unit, Profile and Assembly texts with every write laid over them. For each element of the file, take the text that will exist after the Import (the written text for `add`/`replace`, the home's text otherwise) and validate it:

- Unit: `parseUnitText`; issues go to `errors`.
- Profile: `parseProfileText`, then `validateOuterFolders(profile.outerFolders, config.home)`; issues go to `errors`.
- Assembly: `parseAssemblyText(name, text, units, capabilities)` where `units` are the valid Units of the resulting Hangar and `capabilities` is `capabilitiesOf` of the resulting Profile's Workspace, or `null` when that Profile is missing or invalid.

Problems never change `status`, `action` or the writes.

**Order of `elements`**: Units by name, then per Project (by name) its Profile followed by its Assemblies by name.

**Apply** (NFR-2). `applyImport`:

1. Reads the current text of every target (`writer.read`) and notes which Project folders do not exist yet.
2. Writes in the order given, `add` with `{ create: true }`, `replace` with `{ force: true }`; a result that is not `ok` counts as a failure like a thrown error. A new Project gets its `assemblies/` folder as `createProject` makes it.
3. On a failure: restores every file already written to its previous text, deletes the ones that did not exist, removes Project folders created in step 2, and throws `ImportFailedError` naming the path that failed and the cause. When a restore fails too, the message lists the paths that could not be put back.
4. On success returns the summary, `added` and `replaced` in the order written.

A crash of the process between two writes is not covered.

### HTTP: `apps/server/src/routes/transfer.ts`

```
GET  /api/export/contents                         → ExportContents
POST /api/export          body ExportSelection    → { files: TransferFile[] }      400 { issues }
POST /api/import/preview  body { files, choices } → ImportPreview                  400 { issues }
POST /api/import/apply    body { files, choices } → ImportSummary                  400 { issues }, 500 { reason: 'import_failed', message }
```

- Bodies are checked with zod schemas declared in the route file (`files`: array of `{ path: string, text: string }`; `choices`: `{ replace: string[], paths: record of ProjectPaths }`), failures answered with `badRequest(reply, issuesFromZod(error))`. A rejection of `collectExport` or `planImport` is answered with `badRequest(reply, issues)`.
- Both Import routes set the route option `bodyLimit` to a named constant `IMPORT_BODY_LIMIT_BYTES` (32 MiB).
- `ImportFailedError` is caught in the apply handler and answered with `fail(reply, 500, { reason: 'import_failed', message })`.
- Every handler loads the configuration afresh through `ctx.config.load()`, as the other routes do.

### Web

```ts
// features/export-import/archive.ts
packExport(files: readonly TransferFile[]): Uint8Array
unpackExport(bytes: Uint8Array): TransferFile[]   // throws ArchiveError(message)

// features/export-import/download.ts
exportFileName(date: Date): string                // "suptron-export-2026-11-17.zip", local date
downloadFile(bytes: Uint8Array, fileName: string, mimeType: string): void

// features/export-import/export-selection.ts
initialSelection(contents: ExportContents): ExportSelection
toggleUnit(selection, name, checked): ExportSelection
toggleProject(selection, project: ExportContents['projects'][number], checked): ExportSelection

// api/transfer.ts
transferApi.contents(), .export(selection), .preview(files, choices), .apply(files, choices)
```

`unpackExport`:

- throws `ArchiveError` when the bytes are not a zip ("This file is not a zip archive") or an entry is not valid UTF-8 (`TextDecoder('utf-8', { fatal: true })`), naming the entry;
- turns `\` in entry names into `/`;
- drops directory entries and operating system leftovers: anything under `__MACOSX/`, and entries whose last segment is `.DS_Store`, `Thumbs.db` or `desktop.ini`. The list is one named constant;
- passes everything else on untouched. It does not unwrap a top folder: the server rejects such a file with `outside_layout`.

`toggleProject(…, true)` adds the Project and its `units`; with `false` it removes only the Project. `toggleUnit` changes only that Unit.

## Testing Strategy

Two seams, both already in use.

**1. Server routes through `app.inject`** (`apps/server/test/transfer.test.ts`, new). This is where behaviour is proven: the selection, the layout, the statuses, line endings, the choices, the paths, validation of the result, all-or-nothing. Copy the shape of `apps/server/test/units.test.ts` and `apps/server/test/projects.test.ts`: `testServer({ units, projects })` from `apps/server/test/helpers.ts`, `s.app.inject({ method, url, payload })`, `res.statusCode`, `res.json()`, and reading or writing files of `s.home` by hand (`readFile(join(s.home, 'hangar', …))`) for the state on disk. A good test reads like a user story: "after editing a Unit on both sides the preview marks it different and apply without a choice leaves the file as it was". No test calls `planImport` or `collectExport` directly; the transfer module is covered through the routes.

**2. The page through `renderApp`** (`apps/web/test/export-import.test.tsx`, new). Copy `apps/web/test/hangar.test.tsx` and `apps/web/test/projects.test.tsx`: `useFakeHome(home)`, `renderApp('/export-import')`, `userEvent`, assertions on what is on screen and on `home.requestsTo('POST', …)[0].body`. `apps/web/test/fake-server.ts` gains handlers for the four routes: contents built from the fake's Units and Projects, and test-settable answers for export, preview and apply (the fake does not reimplement planning). The Import tests build a real zip with `fflate` in the test and hand it to the file input with `userEvent.upload`, so `archive.ts` is exercised through the page. `URL.createObjectURL` / `revokeObjectURL` do not exist in jsdom: stub them in the test and assert on the Blob they receive. If jsdom's `File` lacks `arrayBuffer()`, add the stub next to the others in `apps/web/test/setup.ts`.

The navigation link is asserted in `apps/web/test/smoke.test.tsx`, next to the existing links.

## Stages

Every stage ends green on `mise run check` (typecheck, lint, format check, tests). Run tools through mise (`mise run …`, `mise exec -- pnpm …`). Follow the repository's rule of a TSDoc comment on every new function, method and class.

### Stage 1: Export on the server

- **Goal:** the server lists what can be exported and returns the files of a selection.
- **Depends on:** none.
- **Touches:** `packages/runtime/src/transfer/{types,layout,export,index}.ts`, `packages/runtime/src/index.ts`, `packages/runtime/src/browser.ts`, `apps/server/src/routes/transfer.ts`, `apps/server/src/app.ts`, `apps/server/test/transfer.test.ts`.
- **Steps:**
  1. Add `types.ts` with all contract types above; export them as types from `browser.ts` and `index.ts`.
  2. Add `layout.ts` (`elementOfPath`, `pathOfElement`) on top of the `…RelPath` helpers and `NAME_PATTERN`; paths always use `/`.
  3. Add `export.ts` (`listExportContents`, `collectExport`).
  4. Add `registerTransferRoutes` with `GET /api/export/contents` and `POST /api/export`; register it in `buildApp`.
  5. Tests: contents list every Unit and Project, an invalid Unit included; a Project's `units` include the Units of Sub-pilots and Side Slots; the files of an Export equal the bytes on disk, for an invalid Unit and an unparseable Assembly too (write them by hand into `s.home`); a Project brings its Profile and all its Assemblies; nothing under `missions/` is ever returned; an unknown name and an empty selection answer 400.
- **Verify:** `mise exec -- pnpm vitest run --project server`, then `mise run check`.

### Stage 2: The page and the Export section

- **Goal:** the Commander opens Export & Import from the navigation, sees everything checked and downloads `suptron-export-<date>.zip`.
- **Depends on:** Stage 1.
- **Touches:** `apps/web/package.json` (`fflate`), `apps/web/src/features/export-import/{ExportImportPage,ExportSection}.tsx`, `…/{archive,download,export-selection}.ts`, `apps/web/src/api/transfer.ts`, `apps/web/src/api/queries.ts` (query key and hook for the contents), `apps/web/src/router.tsx`, `apps/web/src/components/shell-navigation.tsx`, `apps/web/test/{fake-server.ts,export-import.test.tsx,smoke.test.tsx}`.
- **Steps:**
  1. Add `fflate`; write `archive.ts` (`packExport` now, `unpackExport` in the same file so the container has one home) and `download.ts`.
  2. Add `transferApi.contents` and `.export`, and a `useExportContents()` hook beside the other hooks.
  3. Add the route `/export-import` to the route tree and the page with `PageContainer` / `PageHeader`, loading and error states as on `HangarPage`.
  4. Add the navigation item in a `SidebarFooter` of `ShellNavigation`, in the same `NavigationItem` + `Link` form as the three main items, labelled "Export & Import".
  5. `ExportSection`: two lists ("Units", "Projects") of `Checkbox` + `Label` rows, the selection held in component state and initialised by `initialSelection` once the contents arrive; the Export button is disabled while nothing is checked; on click: `transferApi.export` → `packExport` → `downloadFile`; a failure is a `toast.error`.
  6. Tests: the link is in the navigation; everything is checked on open; unchecking a Project and checking it again checks its Units; a Unit can be unchecked afterwards; Export posts the selection and hands the browser a zip whose entries (unzipped in the test) are the files the fake returned, under the expected file name.
- **Verify:** `mise exec -- pnpm vitest run --project web`, `mise run check`; by hand with `mise run dev`: export, then unpack the zip with the operating system and read a Unit.

### Stage 3: Import preview on the server

- **Goal:** the server says, for a set of files and choices, what an Import would do, and refuses what is not an Export. Nothing is written.
- **Depends on:** Stage 1.
- **Touches:** `packages/runtime/src/config/load.ts` (`parseUnitText`), `packages/runtime/src/transfer/{plan-import,project-paths}.ts`, `apps/server/src/routes/transfer.ts`, `apps/server/test/transfer.test.ts`.
- **Steps:**
  1. Extract `parseUnitText(name, text)` from `loadUnit`; `loadUnit` calls it. Existing runtime tests must stay green unchanged.
  2. Add `project-paths.ts`.
  3. Add `planImport` following "Rules the functions encode".
  4. Add `POST /api/import/preview` with its body schema and `IMPORT_BODY_LIMIT_BYTES`.
  5. Tests: an element absent from the home is `new`, an identical one `same`, an edited one `different` with action `keep`; naming it in `replace` turns the action to `replace`; a CRLF copy of a Unit, a Profile and an Assembly is `same`; a file outside the layout, a name with an uppercase letter, a `missions/` path, a wrapping folder and an empty list each answer 400 with a message naming the path; an Assembly placing a Unit that neither the home nor the file has shows `unknown_unit`, and no longer does once the file brings that Unit; an invalid Unit is listed with its problems and is still `add`; a new Profile carries `paths`, and edited `paths` come back in the preview and change the problems (an Outer Folder inside the configuration home shows `invalid_outer_folder`); a kept Profile has no `paths`; `invalid_paths` for a mismatched shape; after every preview the files of `s.home` are byte for byte what they were.
- **Verify:** `mise exec -- pnpm vitest run --project server --project runtime`, `mise run check`.

### Stage 4: Apply on the server

- **Goal:** an Import is applied all or nothing and reports what it added and replaced.
- **Depends on:** Stage 3.
- **Touches:** `packages/runtime/src/transfer/apply-import.ts`, `apps/server/src/routes/transfer.ts`, `apps/server/test/transfer.test.ts`.
- **Steps:**
  1. Add `applyImport` and `ImportFailedError`.
  2. Add `POST /api/import/apply`: same body and rejection as preview, then `applyImport(ctx.writer, plan.writes)`.
  3. Tests: new elements are on disk afterwards, with LF line endings when the file had CRLF; a different element is replaced only when chosen, otherwise the file on disk is untouched; a new Project appears in `GET /api/projects` with its Assemblies; edited paths are what `profile.yaml` holds and what `GET /api/projects/:name` returns; the summary lists added and replaced; a round trip (export everything from one `testServer`, apply to a second, empty one, preview again) marks every element `same`; a file that is not an Export changes nothing; a write that fails part way (make one target path a directory in `s.home` before applying) answers 500 `import_failed`, and every other file, including ones written before the failure and a Project folder that did not exist, is as before.
- **Verify:** `mise exec -- pnpm vitest run --project server`, `mise run check`.

### Stage 5: The Import section

- **Goal:** the Commander picks a file, sees the preview, chooses, corrects paths, applies and reads the summary.
- **Depends on:** Stages 2 and 4.
- **Touches:** `apps/web/src/features/export-import/{ImportSection,ImportPreview,ProjectPathsFields,ImportSummary}.tsx`, `ExportImportPage.tsx`, `apps/web/src/api/transfer.ts`, `apps/web/test/{fake-server.ts,export-import.test.tsx}`.
- **Steps:**
  1. `transferApi.preview` and `.apply`.
  2. `ImportSection` state: the unpacked `files` (or none), `choices`, the last `ImportSummary`. Choosing a file runs `unpackExport`; an `ArchiveError` or a 400 from the preview is shown as the reason the file was refused (inline, `role="alert"`), and nothing else of the Import is rendered. Choosing another file resets files, choices and summary. Nothing is persisted, so leaving the page discards the preview.
  3. The preview is a query keyed by the files and the choices, with the previous data kept while a new one loads. Path edits are debounced by the same 250 ms `PathField` uses before they enter the query key.
  4. `ImportPreview`: one row per element, grouped as the server orders them (Units, then each Project). A row shows the name and title, a `StatusBadge` (`new`, `same`, `different`), its errors and warnings in the styling of `features/assembly-editor/IssuesList.tsx`, and, for `different`, a `RadioGroup` "Keep mine" / "Replace" with "Keep mine" selected.
  5. `ProjectPathsFields`: under a Profile row that has `paths`: a `PathField` for the Workspace (when not `null`), one per Outer Folder and one per Knowledge Source, labelled like their counterparts in `features/projects/`. A path that does not exist shows `PathField`'s own status and does not disable Apply.
  6. Apply button: enabled when a preview is on screen; on success show `ImportSummary` ("Added", "Replaced", or that nothing changed), clear the files and call `useInvalidateConfig()`; on failure keep the preview and show the server's message.
  7. Tests (with real zips built in the test): a picked Export shows its elements with their status; "Keep mine" is preselected and the apply body has an empty `replace`; choosing "Replace" asks for a new preview with that path and sends it on apply; an edited Workspace path is in the apply body; problems are shown and Apply stays enabled; a file that is not a zip shows the message and sends no request; a zip with `__MACOSX/` entries and `.DS_Store` is accepted; a 400 from the server shows its message; after apply the summary lists what the fake returned; picking another file replaces the preview.
- **Verify:** `mise exec -- pnpm vitest run --project web`, `mise run check`; by hand with `mise run dev` and two homes (`SUPTRON_HOME` pointing to a copy of `examples/suptron-home` and to an empty folder): export all from the first, import into the second, correct a Workspace path, apply, open the Project and launch dialog.

### Stage 6: Documentation

- **Goal:** the documents describe what was built.
- **Depends on:** Stage 5.
- **Touches:** `docs/api.md`, `README.md` (only if it lists the pages or routes), `docs/adr/0013-export-and-import.md` (status line), `docs/features/export-import/PLAN.md` (status).
- **Steps:**
  1. Add an "Export and Import" section to `docs/api.md` in the file's own form: the four routes, one line each, and short notes on rejection codes, `choices` and the body limit.
  2. Change the ADR's status line from "not implemented yet" to where it is implemented, as the earlier ADRs do.
  3. Set this plan's status to implemented.
- **Verify:** `mise run check`.

## Risks and Rollback

- **A partly applied Import after a crash of the process.** `applyImport` restores on an error it sees, not on a kill between two writes. Detect: the summary never arrived; a second Import of the same file shows what is still `new`. Accepted for a personal system.
- **A replaced Unit can break an Assembly that is not in the file.** The preview validates only the elements of the file. Detect: the Projects page marks the Assembly invalid, as after any edit of a Unit. No change planned.
- **Text equality marks reformatted files as different.** A file that was saved through the UI on one machine and edited by hand on the other differs in formatting even when the content is equal. The Commander sees `different` and keeps or replaces; nothing is lost.
- **A Profile whose paths were edited is written in canonical form**, without comments, as every Profile saved from the UI is.
- **Paths of another operating system.** `isAbsolutePath` accepts only paths that start with `/`; a Profile exported on Windows with `C:\…` Outer Folders does not pass the schema, so it has no editable `paths` and arrives with problems to fix in the Profile editor. Outside this plan; see the SPEC's open question on Windows.
- **Body size.** An Import above `IMPORT_BODY_LIMIT_BYTES` is refused by Fastify with 413 and shown as a failure. A Hangar is far below it.
- **`jsdom` gaps** (`URL.createObjectURL`, possibly `File.arrayBuffer`). Stubbed in tests only; production code uses the platform APIs.
- **Rollback of the work.** Stages 1 to 5 only add modules, routes and one page; the one change to existing behaviour is the extraction of `parseUnitText` (Stage 3), a refactor covered by the existing loader tests. Reverting a stage's commit removes it without touching stored data: the feature adds no new file to the configuration home and changes no format.

## Out of Scope

- A zip library, multipart parsing or any binary route on the server; a server-side staged Import.
- Comparing elements by parsed content, a diff view of a different element, or merging two versions.
- Importing under another name, exporting single Assemblies, exporting Missions (SPEC).
- Adding or removing Outer Folders and Knowledge Sources during an Import; editing anything of a Profile other than its paths.
- Unwrapping a top folder of a re-packed archive.
- Forbidding Windows-reserved names in the name rule, and Windows absolute paths in the Profile schema.
- A format version inside the Export; it is added when the layout of the configuration home first changes.
- A transaction that survives a process crash.
- Changes to `examples/suptron-home` and to the starting Units.
