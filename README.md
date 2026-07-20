# mockymock for VS Code

Run [`mockymock`](https://github.com/samdion1994/mocky-mock) `.cut` COBOL
test suites directly from VS Code's native Test Explorer — with automatic
environment bootstrap (installs the `mockymock` CLI via `uv`, launches a
stopped Docker Desktop), so the day-to-day loop never needs a terminal.

## Features

- **Test Explorer tree** for every `.cut` file in the workspace
  (file → suite → cases), discovered authoritatively via
  `mockymock collect --json` with a regex fallback when the CLI isn't
  installed yet. Cases tagged `TESTCASE "..." TAGS "fast"` carry those tags
  into the Explorer's tag filter.
- **Run a single test.** Running one case (or any subset) passes
  `--case` flags to `mockymock run` — the framework splices in only the
  selected cases. "Rerun failed tests" works the same way.
- **Failures land on the failing line.** Results come from
  `mockymock run --json-report`: the failing `EXPECT`/`VERIFY`'s `.cut`
  line gets the inline error peek, with expected/actual rendered as a
  diff. (Falls back to JUnit XML for an older CLI.)
- **Coverage profile.** "Run with Coverage" uses
  `--coverage-json` and paints gutter coverage on the **original** `.cbl`
  (the framework excludes its own instrumentation lines).
- **Continuous run.** Toggle the eye icon on a test to re-run it whenever
  its `.cut` or paired `.cbl` changes.
- **Cancellation actually cancels** — stopping a run kills the in-flight
  `mockymock` process, not just the queue.
- **Live linting.** `mockymock lint` (static checks only, zero Docker) runs
  on open/save of a `.cut` file and its problems appear as squiggles.
- **`.cut` language support**: syntax highlighting, `*>` comment toggling,
  MOCK/END-MOCK folding, and snippets (`testcase`, `mock-call`,
  `mock-sql-rows`, `verify`, ...).
- **Environment bootstrap**: a missing `mockymock` CLI is installed via
  `uv` automatically; a stopped Docker Desktop is launched and polled; a
  missing Docker install gets a one-click download prompt. A status bar
  item shows the current phase.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `mockymock.executablePath` | `""` | Explicit path to the `mockymock` executable (PATH otherwise) |
| `mockymock.copybookPaths` | `[]` | Folders passed as `--copybook-path` on every run/lint (resource-scoped; relative paths resolve against the workspace folder) |
| `mockymock.lintOnSave` | `true` | Run `mockymock lint` on open/save of `.cut` files |
| `mockymock.maxParallelRuns` | `1` | Concurrent `.cut` files per test run — raise only if your container setup tolerates concurrent compiles |

## Requirements

- The `mockymock` CLI (auto-installed via `uv` on first run if missing).
  Single-test runs, tags, lint, JSON reports, and coverage mapping need a
  CLI new enough to have `collect`/`lint`/`--case`/`--json-report`/
  `--coverage-json`; older CLIs degrade gracefully (whole-file runs, JUnit
  results, regex discovery).
- Docker (mockymock compiles and runs COBOL in its `mockymock-cobc`
  container).
- VS Code ≥ 1.88.

## Development

```bash
npm install
npm run compile      # tsc
npm run test:unit    # mocha over src/**/*.test.ts (no vscode needed)
npm run package      # builds the .vsix
```

Press F5 to launch the Extension Development Host against
`../mocky-mock/examples/invupdt`. Distribution is a locally built `.vsix`
(`code --install-extension mockymock-vscode-<version>.vsix`) — not the
Marketplace.
