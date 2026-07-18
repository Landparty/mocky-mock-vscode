# mockymock VS Code Extension — v1 Design

Date: 2026-07-18

## Overview

A VS Code extension that lets a developer run `mockymock` `.cut` test suites
against COBOL programs directly from the editor, with pass/fail results shown
inline via VS Code's native Test Explorer — without ever typing a `mockymock`
or `docker` command by hand.

This is for internal/personal use on the author's own machine(s): distributed
as a locally built `.vsix` (`vsce package` + `code --install-extension` or
"Install from VSIX"), not published to the Marketplace. No multi-tenant or
locked-down-enterprise constraints apply.

## Goals (v1)

- One-click test running: click "Run" on a `.cut` test case or suite in the
  Test Explorer, see pass/fail (and failure reasons) inline, no terminal use
  required for the day-to-day loop.
- As close to zero-setup as possible: on first use, the extension detects and
  fixes a missing `mockymock` CLI or a stopped Docker Desktop itself, only
  asking the user to click something when the fix genuinely requires an
  OS-level action (installing Docker Desktop from scratch).

## Non-goals (v1 — candidates for a later version)

- `.cut` authoring support: syntax highlighting, snippets, or a command to
  invoke `mockymock generate` to scaffold a starter `.cut` file.
- Coverage report integration (`mockymock run --coverage`).
- Debug-mode runs / breakpoints.
- Marketplace publishing.

## Architecture

TypeScript VS Code extension. Uses the native **Testing API**
(`vscode.tests.createTestController`) for the test tree/gutter icons/status,
Node's `child_process` to shell out to `mockymock` (and, for bootstrap, `uv`
and `docker`), and a small XML parser for the JUnit output `mockymock run
--junit-xml` already produces.

The extension is a thin orchestrator: it does not reimplement any DSL
parsing, splicing, or COBOL analysis — that all stays in the `mockymock`
Python CLI. JUnit XML already carries per-test-case pass/fail plus
failure-reason text (confirmed against `mocky-mock`'s `.okf/report.md`), which
is sufficient detail for a v1 Test Explorer integration.

## Components

| Component | Responsibility |
|---|---|
| `EnvironmentManager` | Checks/bootstraps the `mockymock` CLI (via `uv`) and Docker Desktop; exposes a `ready()` gate that test runs wait on, and a status bar item reflecting current state (ready / installing / starting Docker / needs attention) |
| `CutDiscovery` | Finds `**/*.cut` files in the workspace, watches for create/change/delete, regex-scans each file's text for `TESTSUITE "<name>"` / `TESTCASE "<name>"` lines (with line numbers) — no `mockymock` invocation needed just to populate the tree |
| `TestController` | Builds and maintains the VS Code test tree (suite → cases) from `CutDiscovery`'s output; wires run requests to `MockymockRunner` |
| `MockymockRunner` | Resolves the paired `.cbl` for a `.cut` file (same filename stem, same directory), assembles and executes `mockymock run <cbl> --cut <cut> --junit-xml <tmp-path> [--copybook-path <p> ...]`, returns stdout/stderr and the JUnit XML path (if produced) |
| `ResultMapper` | Parses the JUnit XML into per-test-item pass/fail/failure-message; handles the "no XML produced" and "case missing from XML" cases explicitly (see Error Handling) |

## Configuration (settings)

- `mockymock.executablePath` (string, optional) — explicit path to the
  `mockymock` executable. When unset, resolved via PATH.
- `mockymock.copybookPaths` (array of strings, optional) — folder paths
  passed as one or more `--copybook-path` flags on every run.

## Data Flow

1. On activation (and via a `FileSystemWatcher`), `CutDiscovery` scans the
   workspace for `.cut` files and regex-extracts suite/case names, building
   `TestItem`s under `TestController`'s root.
2. `mockymock run` only executes a whole suite in a single compile + binary
   run — there is no single-case invocation. So any run request (one case,
   a whole suite, or "Run All") resolves to running the entire containing
   `.cut` file; results are then distributed back to the specific items that
   were requested as well as their siblings.
3. `MockymockRunner` resolves `<cut-file-stem>.cbl` in the same directory,
   builds the CLI invocation with configured `--copybook-path` flags and a
   temp `--junit-xml` path, and executes it (gated on
   `EnvironmentManager.ready()`).
4. `ResultMapper` reads the JUnit XML (if it exists) and matches
   `<testcase name="...">` entries back to tree items by name, setting
   passed/failed + failure message per item.
5. Any tree item in that suite with **no** matching `<testcase>` entry (a
   case never reached because an earlier one hit `STOP RUN` mid-suite, per
   `mocky-mock`'s crash semantics) is marked failed with a synthetic message:
   "did not run — an earlier case in this suite crashed" — never left in a
   perpetual running/queued state.
6. If the process exited before producing any JUnit XML at all (a refusal
   like `PARSE_WARNING`/`UNRESOLVED_COPYBOOK`, or a compile failure — both
   exit before execution per `mockymock`'s own docs), every item in that
   suite is marked failed, with the raw stderr/stdout surfaced as the
   failure message on each (there's no per-case detail to distribute in
   this case).

## Environment Bootstrap

`EnvironmentManager` runs these checks, automating everything that doesn't
require an OS-level admin action:

1. **`mockymock` CLI** — resolved via `mockymock.executablePath` or PATH
   (`mockymock --version`). If missing: check for `uv`; if present, run
   `uv tool install git+https://github.com/samdion1994/mocky-mock.git`
   automatically (with a progress notification — this is a git clone +
   build, not instant). A GitHub auth failure (`mocky-mock` is a private
   repo) surfaces the actual git/uv error, pointing at `gh auth setup-git`
   per the repo's own README. If `uv` itself is missing, prompt with an
   "Install uv" action that runs the official installer visibly in an
   integrated terminal (not silently backgrounded).
2. **Docker daemon** — `docker info`. If Docker Desktop is installed but not
   running, launch it automatically (Windows: start `Docker Desktop.exe`)
   and poll until ready, showing a "Starting Docker Desktop…" progress
   notification. If the `docker` CLI isn't present at all, show a one-click
   "Install Docker Desktop" prompt (opens the installer / runs
   `winget install Docker.DockerDesktop` in a visible terminal) rather than
   attempting a silent install — Docker Desktop's own installer requires a
   UAC elevation prompt and a license-acceptance click that no extension can
   click through on the user's behalf, and occasionally a WSL2 feature
   enable + reboot.
3. **GnuCOBOL image/container** — not separately orchestrated by the
   extension: `mockymock run`'s own `ensure_toolchain()` already builds the
   image and starts/recreates the `mockymock-cobc` container on first use.
   The extension may opportunistically invoke this early (e.g. on
   activation, once Docker is confirmed reachable) purely so the first
   "Run Test" click isn't the one paying for a multi-minute image build.

The status bar item reflects the current phase (ready / installing mockymock
/ starting Docker / needs Docker installed) so the user always knows why a
test run might be waiting.

## Testing / Verification Plan

Before calling v1 done, exercise the extension manually against
`mocky-mock/examples/invupdt/` (the repo's own worked example):

- Tree population from a `.cut` file with multiple `TESTSUITE`/`TESTCASE`
  blocks.
- A full pass, a failing `EXPECT`/`VERIFY`, and a mid-suite `STOP RUN` crash
  — confirming each renders correctly (pass / fail-with-message /
  fail-with-synthetic-crash-message on unreached siblings).
- A deliberately broken environment: `mockymock` removed from PATH, and
  Docker Desktop stopped — confirming the bootstrap flow detects and repairs
  each without manual CLI use.

## Future Work (not v1)

- `.cut` syntax highlighting, snippets, and a "Generate Test" command
  wrapping `mockymock generate`.
- Coverage-report integration (`--coverage` / `--coverage-out`) as gutter
  decorations.
- Debug-mode runs.
- Marketplace publishing, if this ever needs to reach other developers.
