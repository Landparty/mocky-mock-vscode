# mockymock for VS Code

[![Download latest release](https://img.shields.io/github/v/release/Landparty/mocky-mock-vscode?label=Download&style=for-the-badge&cacheSeconds=60)](https://github.com/Landparty/mocky-mock-vscode/releases/latest)

Download the `.vsix` and install it in VS Code to start unit-testing your
COBOL today — see you on the *wildside*.

## Why mockymock

Unit testing and debugging COBOL is normally gated behind provisioning a
z/OS environment — infrastructure that can run into the hundreds of
thousands of dollars for something that's standard, free tooling in every
other language *thank you IBM*. mockymock's goal is to close that gap: a fast, local
and simple unit-testing and debugging loop for COBOL — write a `.cut` suite, mock out
the file I/O, CICS, DB2, IMS, and MQ boundaries, vola you're good to go. 
No mainframe access required and no hassel, *good vibration* guaranteed.

The idea started from [cobol-check](https://github.com/openmainframeproject/cobol-check),
the open-source COBOL unit-testing framework, but mockymock was rebuilt from
the ground up with its own `.cut` syntax, mocking model, coverage/trace
tooling, and interactive debugger. `mockymock`'s own CLI source lives in a
private repository, so this extension repo — its `.cut` language, the
[`examples/`](examples/) below, and this README — is the reference for what
it does and how to use it.

## Features

- **Test Explorer tree** for every `.cut` file, with tag filtering.
- **Run single tests or subsets**, including "rerun failed."
- **Failures land on the failing line**, with an expected/actual diff.
- **Coverage** painted on your original `.cbl` gutter.
- **Debug (Execution Trace)** — see the executed path and mocks that fired.
- **Debug (Interactive)** — real breakpoints, stepping, and variable
  inspection on your original `.cbl`.
- **Mutation Test** — surviving mutants painted as warnings on your
  original `.cbl`, with a mutation score.
- **Continuous run** — re-run a test automatically on file change.
- **Cancellation** that actually kills the in-flight run.
- **Live linting** on open/save, zero Docker needed.
- **`.cut` language support** — syntax highlighting, folding, snippets.
- **Export Mainframe-Ready COBOL** — write the instrumented build to a
  real fixed-format `.cbl`, adjusted for a mainframe (z/OS) COBOL
  compiler instead of GnuCOBOL, zero Docker needed.
- **Environment bootstrap** — auto-installs the CLI and starts Docker
  Desktop for you, with a status bar item to check or retry.
- **No silent failures** — anything mockymock can't attribute to a test
  case still surfaces as an error, not a false green.

## Compiler

mockymock compiles and runs your COBOL with [GnuCOBOL](https://gnucobol.sourceforge.io/),
**not** an IBM Enterprise COBOL compiler. GnuCOBOL is close enough for most
day-to-day unit testing, but it's a different compiler with its own dialect
quirks, extensions, and gaps versus IBM's mainframe compiler — some IBM-only
syntax or behavior may not compile or may behave differently under
mockymock. Treat green tests here as strong local signal, not a guarantee
that the same source will compile and behave identically on z/OS.

Compiling and running tests directly against a mainframe/IBM COBOL compiler
is on the roadmap.

## Install

Download the `.vsix` matching your OS from this repo's
[Releases page](https://github.com/Landparty/mocky-mock-vscode/releases),
then install it:

```bash
code --install-extension mockymock-vscode-<platform>-<version>.vsix
```

Or download from the microsoft extension store (currently worked on)

### macOS

Two release builds cover macOS: `darwin-arm64` (Apple Silicon: M1/M2/M3/M4)
and `darwin-x64` (Intel — available from the first release built after this
was added; earlier releases only shipped `darwin-arm64`, and Intel Macs fall
back to the `uv`-based auto-install described below). If you're not sure
which chip you have, run `uname -m` in Terminal — `arm64` means Apple
Silicon, `x86_64` means Intel — and download the matching `.vsix`.

The bundled `mockymock` binary isn't signed with a paid Apple Developer
Program certificate, so on first activation the extension automatically
clears the macOS quarantine flag on it (the thing Gatekeeper checks) —
no action needed on your part. If a fresh install still shows "mockymock:
permission denied" in the status bar, run `mockymock: Check Environment
Status` to see the exact bundled binary path, then in Terminal:

```bash
xattr -d com.apple.quarantine <path-from-the-command-above>
```

...and reload the window (`Developer: Reload Window`).

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `mockymock.executablePath` | `""` | Explicit path to the `mockymock` executable (bundled binary otherwise, falling back to PATH) |
| `mockymock.copybookPaths` | `[]` | Folders passed as `--copybook-path` on every run/lint (resource-scoped; relative paths resolve against the workspace folder). A `zapp.yml`/`zapp.yaml` at the workspace root — the same file IBM Z Open Editor's DBB tooling uses — is also honored: its `cobol`-language `local` library locations are merged in after this setting's own entries, which win on a duplicate path |
| `mockymock.lintOnSave` | `true` | Run `mockymock lint` on open/save of `.cut` files |
| `mockymock.maxParallelRuns` | `1` | Concurrent `.cut` files per test run — raise only if your container setup tolerates concurrent compiles |

## Requirements

- The `mockymock` CLI. Official release `.vsix` packages (see Install
  above) already bundle a matching binary — nothing to install. Otherwise
  (running from source, or on a platform with no bundled binary) it's
  auto-installed via `uv` on first run if missing. Single-test runs, tags,
  lint, JSON reports, and coverage mapping need a CLI new enough to have
  `collect`/`lint`/`--case`/`--json-report`/`--coverage-json`; older CLIs
  degrade gracefully (whole-file runs, JUnit results, regex discovery).
  Debug (Execution Trace) additionally needs `--trace-json`; Debug
  (Interactive) needs the `debug` subcommand; Export Mainframe-Ready COBOL
  needs the `export` subcommand. An older CLI degrades to a clear message
  on the one feature it affects rather than failing anything else.
- Docker (mockymock compiles and runs COBOL in its `mockymock-cobc`
  container). If Docker Desktop is installed but not running, the extension
  starts it automatically before your first run/lint and waits for it to
  become ready — no need to launch it yourself. If Docker isn't installed at
  all, you'll get a prompt linking to the Docker Desktop download page.
- VS Code ≥ 1.88.

## Generating tests

Seeded test-data generation (what the removed "COBOL Boundaries" view used
to do) now lives in the `mockymock` Claude Code skill instead of a sidebar
UI — install it with `mockymock skills install` and ask your assistant to
generate tests for a program. See the mocky-mock repo's skill docs.

## Mutation testing

The **Mutation Test** run profile (Test Explorer → run-button dropdown) runs
`mockymock mutate` for the selected `.cut` file: mockymock re-runs the whole
suite against many single-line variants of your COBOL program (`IF X > 0`
becomes `IF X >= 0`, a `MOVE` is deleted, a boundary literal shifts by one)
and reports which variants your tests failed to notice.

- Each **surviving mutant** — a deliberate bug every test still passes on —
  is attached to the `.cut` file item as a diff and painted as a
  `mockymock mutation` warning on the exact `.cbl` line (cleared when you
  edit the file or start a new mutation run).
- The **mutation score** (killed ÷ scored mutants) streams into Test Results
  along with per-mutant progress; a hang counts as killed, a mutant that
  fails to compile is excluded from the score.
- Mutation always exercises the whole suite (the CLI has no per-case mode),
  needs Docker like a normal run, and costs one compile+run per mutant —
  expect minutes, not seconds, on a large program.

Requires a mockymock CLI new enough to have the `mutate` subcommand; older
CLIs get a clear upgrade message instead.

## Examples

[`examples/`](examples/) has 13 worked COBOL programs, copied from
`mockymock`'s own test suite so they're here even though the CLI's
source repo is private. Each proves a boundary category compiles and
runs for real under GnuCOBOL, and each has its own README plus a
runnable `.cut`:

```bash
mockymock run examples/invupdt/INVUPDT.cbl --cut examples/invupdt/INVUPDT.cut
```

(Examples under `copybooks/` — `cpyproc`, `custprog`, and everything
under `real-world/` — need a `--copybook-path examples/<name>/copybooks`
flag too; see that example's own README.)

- [`ordrproc`](examples/ordrproc) — the minimal case: one external subprogram `CALL`.
- [`raterte`](examples/raterte) — dynamic `CALL` through a variable holding the program name ("poor man's polymorphism").
- [`invupdt`](examples/invupdt) — every boundary category in one program: file I/O, a DB2 `UPDATE`, an MQ `CALL`, and operator `ACCEPT`.
- [`custinq`](examples/custinq) — a CICS transaction (`EXEC CICS READ`/`RETURN`), no CICS translator needed.
- [`custprog`](examples/custprog) — DB2 cursors (`DECLARE`/`OPEN`/`FETCH`/`CLOSE`) and DCLGEN-style copybook host variables.
- [`claimseg`](examples/claimseg) — IMS DL/I segment retrieval and insert (`EXEC DLI GU`/`ISRT`).
- [`cpyproc`](examples/cpyproc) — a shared paragraph pulled in via a `COPY` copybook, tested directly and as a stubbed collaborator.
- [`flowmock`](examples/flowmock) — mocking an internal paragraph or section directly, not just external calls.
- [`regnavg`](examples/regnavg) — subscripted tables, `REDEFINES`, `DIVIDE ROUNDED`, and `--trace` output.
- [`statelkup`](examples/statelkup) — data-driven cases: one `TESTCASE ... USING PROVIDER` row-expands into many.
- [`taxfile`](examples/taxfile) — shared `BEFORE-EACH` mocks that individual cases override.
- [`nist-cobol85`](examples/nist-cobol85) — unmodified programs from the public-domain NIST COBOL-85 validation suite.
- [`real-world`](examples/real-world) — four production-shaped programs: an IMS DL/I batch purge, an IMS MPP deposit transaction (also the coverage-reporting worked example), and an MQ producer/consumer pair with two-phase DB2 commit.

## License

[GPL-3.0](LICENSE). This covers this extension repo (the `.cut` language
tooling, examples, and docs here) — the `mockymock` CLI itself lives in a
separate, private repository and is not covered by this license.
