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
- **Debug (Execution Trace).** The debug icon on a single `TESTCASE` runs
  `mockymock run --trace-json` and prints the executed path through your
  `.cbl` plus the mocks that fired, in order, into the Test Results panel.
  Needs exactly one selected case (the CLI itself refuses an unscoped
  trace) and a `mockymock` new enough for `--trace-json` — an older CLI
  degrades to a clear "too old" message instead of a confusing generic
  failure.
- **Debug (Interactive).** A second profile in the same dropdown (next to
  the bug icon) starts a real interactive debug session —
  `mockymock debug --dap-stdio` — for a single `TESTCASE`: breakpoints on
  your original `.cbl` lines, stepping, VS Code's own Call Stack/Variables
  views showing COBOL paragraphs and COBOL-named, COBOL-shaped values (a
  `PIC 9(5)V99 COMP-3` item renders as a decimal). Unlike every other
  profile, there's no scripted pass/fail for an interactive session — the
  test item is marked "skipped" (not scored) and the run stays open until
  you end the debug session. Needs exactly one selected case and a
  `mockymock` new enough for the `debug` subcommand, with the same
  too-old-CLI degradation as the trace profile.
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
  item shows the current phase — click it (or run **mockymock: Check
  Environment Status** from the Command Palette) to check readiness or
  retry a fix on demand, without waiting for a test run.
- **Unattributed failures are never silently dropped.** A FAIL mockymock
  can't tie to any known test case (a `MOCK`/`VERIFY` firing after its case
  already ended, a framework/binary mismatch) still errors the file in Test
  Explorer with the raw detail, instead of the run just looking all-green.

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
  results, regex discovery). Debug (Execution Trace) additionally needs
  `--trace-json`; Debug (Interactive) needs the `debug` subcommand. An
  older CLI degrades to a clear message on the one profile it affects
  rather than failing anything else.
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
