# mockymock for VS Code

[![Download latest release](https://img.shields.io/github/v/release/samdion1994/mocky-mock-vscode?label=Download&style=for-the-badge&cacheSeconds=60)](https://github.com/samdion1994/mocky-mock-vscode/releases/latest)

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
- **Continuous run** — re-run a test automatically on file change.
- **Cancellation** that actually kills the in-flight run.
- **Live linting** on open/save, zero Docker needed.
- **`.cut` language support** — syntax highlighting, folding, snippets.
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
[Releases page](https://github.com/samdion1994/mocky-mock-vscode/releases),
then install it:

```bash
code --install-extension mockymock-vscode-<platform>-<version>.vsix
```

Or download from the microsoft extension store (currently worked on)

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `mockymock.executablePath` | `""` | Explicit path to the `mockymock` executable (bundled binary otherwise, falling back to PATH) |
| `mockymock.copybookPaths` | `[]` | Folders passed as `--copybook-path` on every run/lint (resource-scoped; relative paths resolve against the workspace folder) |
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
  (Interactive) needs the `debug` subcommand. An older CLI degrades to a
  clear message on the one profile it affects rather than failing anything
  else.
- Docker (mockymock compiles and runs COBOL in its `mockymock-cobc`
  container). If Docker Desktop is installed but not running, the extension
  starts it automatically before your first run/lint and waits for it to
  become ready — no need to launch it yourself. If Docker isn't installed at
  all, you'll get a prompt linking to the Docker Desktop download page.
- VS Code ≥ 1.88.

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
