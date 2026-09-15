# mockymock for VS Code

[![Download latest release](https://img.shields.io/github/v/release/Landparty/mocky-mock-vscode?label=Download&style=for-the-badge&cacheSeconds=60)](https://github.com/Landparty/mocky-mock-vscode/releases/latest)

Download the `.vsix` and install it in VS Code to start unit-testing your
COBOL today — see you on the *wildside*.

## Quick start

1. **Install** the `.vsix` for your OS from the
   [latest release](https://github.com/Landparty/mocky-mock-vscode/releases/latest)
   (`Extensions` → `…` → `Install from VSIX…`). The mockymock CLI is bundled;
   you also need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   to run tests.
2. **Open a COBOL program** (`.cbl`, `.cob` or `.cobol`) and click the
   beaker icon in the editor title bar — **New Test Suite for This Program**.
   mockymock reads the program and writes a `.cut` suite next to it, one
   test case per paragraph with every `CALL`, file, SQL, CICS and IMS
   boundary already mocked.
3. **Press play** in the Test Explorer (or the green arrow beside any
   `TESTCASE`). The first run checks your setup and starts Docker Desktop
   for you if it isn't running.

A **Getting Started** walkthrough opens on install and is always one
command away (`mockymock: Open Getting Started Guide`). If something's
off, `mockymock: Check Setup (CLI and Docker)` diagnoses it and fixes
what it can.

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

- **New Test Suite in one click** — scaffolds a runnable `.cut` next to any
  COBOL program, boundaries pre-mocked; falls back to a starter template
  when the CLI can't analyze the program, so you always get a file to edit.
- **Getting Started walkthrough** and an empty-state Test Explorer that
  points at the next step, so the first test never needs the docs.
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
- **Live `.cut` linting** on open/save, zero Docker needed — the suite
  checked against the program it tests. (COBOL source itself is linted by
  the companion COBOL Analyzer extension; the two never overlap.)
- **`.cut` editor intelligence** — completion for `MOCK` categories and the
  program's own real boundary keys, hover text on tally counters, `CAPTURE`
  targets and refusal codes, and a **Quick Fix** that inserts a missing
  `MOCK` block for you.
- **`.cut` language support** — syntax highlighting, folding, snippets.
- **Export Mainframe-Ready COBOL** — write the instrumented build to a
  real fixed-format `.cbl`, adjusted for a mainframe (z/OS) COBOL
  compiler instead of GnuCOBOL, zero Docker needed.
- **Environment bootstrap** — auto-installs the CLI and starts Docker
  Desktop for you, with a status bar item to check or retry. Every
  "can't do that" message carries the button that fixes it (check setup,
  open the file, update the extension).
- **No silent failures** — anything mockymock can't attribute to a test
  case still surfaces as an error, not a false green.

## Companion extension: COBOL Analyzer

mockymock and [**COBOL Analyzer**](https://github.com/Landparty/cobol-analyzer)
are two halves of one COBOL workflow, deliberately split so neither ships
the other's job. mockymock owns everything that **runs your program**;
COBOL Analyzer owns everything that **reads it without running it**. Install
both and they interlock; install either alone and it still works, minus the
other half.

| You want to | Extension | How |
|---|---|---|
| Write, run, debug a COBOL unit test | **mockymock** | `.cut` suites, Test Explorer, interactive debugger |
| Coverage, mutation score, execution trace | **mockymock** | run profiles in the Test Explorer |
| Mainframe-ready instrumented build | **mockymock** | **Export Mainframe-Ready COBOL** |
| COBOL syntax highlighting, Outline, Go to Definition | **COBOL Analyzer** | the `cobol` grammar and language configuration |
| Completion, rename, format, fixed-format column guardrails | **COBOL Analyzer** | in-process editing providers |
| Dead code, unused variables, MOVE type checks, I/O sequence, LINKAGE, recursion, complexity, DCLGEN | **COBOL Analyzer** | `cobol-parser lint` on save, and **Analyze COBOL File…** |
| Program Flow diagram, workspace debt table, cross-file clone detection | **COBOL Analyzer** | `cobol-parser` analyzers and `scan` |
| Expand `COPY` members, decode a record image, generate CSV from a copybook | **COBOL Analyzer** | **Show Expanded Source**, **Record Viewer**, **Generate Data from Copybook** |
| Cross-file navigation, JCL → COBOL dataset answers, Call Hierarchy | **COBOL Analyzer** | its workspace index |

A natural loop across the two: read the program with COBOL Analyzer's
Outline and **Analyze COBOL File…**, then click the beaker for **New Test
Suite for This Program** here, then run and debug it in the Test Explorer,
then check the coverage gutter against the analyzer's dead-code findings.

### What each extension deliberately does not do

These are the seams — the places where a feature looks like it should be in
both and is in exactly one, on purpose:

- **The `cobol` grammar and language configuration are COBOL Analyzer's
  alone.** VS Code resolves a grammar by `scopeName` and a language
  configuration by language id, and two extensions contributing the same one
  is a conflict with no priority rule. mockymock ships neither.
- **mockymock still contributes a *minimal* `cobol` language entry** — the
  id and the `.cbl`/`.cob`/`.cobol` extensions, no grammar, no
  configuration. Language ids *merge* across extensions where grammars do
  not, and VS Code only offers the breakpoint gutter on a language some
  extension named in `contributes.breakpoints`. Dropping the entry would
  silently disable COBOL breakpoints for anyone running mockymock without
  COBOL Analyzer. It is not a second COBOL language; it is the debugger's
  hook. `src/companionExtension.test.ts` pins both halves of that.
- **The MOVE type check lives only in COBOL Analyzer now.** It used to be a
  `mockymock.moveCheckOnSave` diagnostic here; it moved with the rest of the
  analysis surface and is now the `move-type-check` rule inside
  `cobol-parser lint` (`cobolAnalyzer.moveCheckOnSave`,
  `cobolAnalyzer.lintRules`). Two extensions publishing the same finding
  would double every squiggle, so this side no longer runs it at all.
- **Two lints, two file types, no overlap.** `mockymock lint` checks `.cut`
  suites against their paired program. COBOL Analyzer's lint checks the
  COBOL (and JCL) itself. Neither publishes diagnostics on the other's
  files.
- **Two CLIs, two "Check Setup" commands.** mockymock drives the bundled
  `mockymock` binary (and Docker, for GnuCOBOL); COBOL Analyzer drives a
  bundled `cobol-parser`. They are different programs, so
  `mockymock.executablePath` and `cobolAnalyzer.executablePath` are never
  inherited from one another — see [Settings](#settings).
- **Test *data* generation is split by what it is for.** COBOL Analyzer's
  **Generate Data from Copybook** produces CSV rows from a record layout for
  you to look at. Seeded fixture generation *for a test suite* is
  mockymock's (`mockymock generate --with-data`, and the `mockymock` Claude
  Code skill) — same underlying `cobol-parser` generators, different
  deliverable.

### Sharing one copybook setup

Both extensions pass `--copybook-path` to their own CLI, so they need the
same answer to "where do the copybooks live". They read it from each other:
`mockymock.copybookPaths` falls back to `cobolAnalyzer.copybookPaths` when
it is unset, and COBOL Analyzer does the mirror image. Set either one and
both extensions use it; set both and each uses its own. A
`zapp.yml`/`zapp.yaml` at the workspace root (the file IBM Z Open Editor's
DBB tooling uses) is honored by both on top of that.

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
permission denied" in the status bar, run `mockymock: Check Setup (CLI and
Docker)` to see the exact bundled binary path, then in Terminal:

```bash
xattr -d com.apple.quarantine <path-from-the-command-above>
```

...and reload the window (`Developer: Reload Window`).

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `mockymock.executablePath` | `""` | Explicit path to the `mockymock` executable (bundled binary otherwise, falling back to PATH) |
| `mockymock.copybookPaths` | `[]` | Folders passed as `--copybook-path` on every run/lint (resource-scoped; relative paths resolve against the workspace folder). When left unset it falls back to `cobolAnalyzer.copybookPaths`, so one copybook setup serves both extensions — see [Sharing one copybook setup](#sharing-one-copybook-setup). A `zapp.yml`/`zapp.yaml` at the workspace root — the same file IBM Z Open Editor's DBB tooling uses — is also honored: its `cobol`-language `local` library locations are merged in after this setting's own entries, which win on a duplicate path |
| `mockymock.lintOnSave` | `true` | Run `mockymock lint` on open/save of `.cut` files |
| `mockymock.maxParallelRuns` | `1` | Concurrent `.cut` files per test run — raise only if your container setup tolerates concurrent compiles |

All of the defaults work out of the box; most users never touch these.

`mockymock.executablePath` is never inherited from `cobolAnalyzer.executablePath`
and vice versa: they point at two different programs. `copybookPaths` is the
one setting the two extensions deliberately share.

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

**New Test Suite for This Program** (beaker icon on any open COBOL file,
also in the right-click menu and the empty Test Explorer) runs
`mockymock generate` and writes `PROG.cut` next to `PROG.cbl`: one
`TESTCASE` per paragraph, every boundary mocked, no Docker needed. It never
overwrites an existing suite — it opens it instead. If the CLI can't
analyze the program (a parse error, an unresolved copybook), you still get
a minimal starter suite plus the reason, so there's always a file to edit.

Seeded test-*data* generation (what the removed "COBOL Boundaries" view used
to do) lives in the `mockymock` Claude Code skill instead of a sidebar
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

## Known Issues

Caveats that are real and current today, gathered here instead of scattered
across the sections above:

- **GnuCOBOL, not an IBM mainframe compiler.** mockymock compiles and runs
  your COBOL with GnuCOBOL — see [Compiler](#compiler) above. Green tests
  here are strong local signal, not a guarantee the same source compiles
  and behaves identically on z/OS.
- **Older `mockymock` CLI versions degrade, not fail.** Single-test runs,
  tags, lint, JSON reports, and coverage mapping all need a CLI new enough
  to support them (see [Requirements](#requirements)). Against an older
  CLI, each affected feature falls back to a coarser behavior or a clear
  upgrade message instead of breaking the rest of the extension.
- **A narrow Windows path-quoting gap.** On Windows, a path containing a
  spelled-out environment variable name between two `%` signs (e.g. a
  folder literally named `%USERNAME%`) can be expanded by `cmd.exe` before
  mockymock, Docker, or `uv` ever see it, even though the extension quotes
  every other shell metacharacter. There's no complete fix for this short
  of not using a shell at all, which would break `uv`'s Windows `.cmd`
  shims — in practice this only bites a path that happens to contain
  another environment variable's exact name.

## License

[GPL-3.0](LICENSE). This covers this extension repo (the `.cut` language
tooling, examples, and docs here) — the `mockymock` CLI itself lives in a
separate, private repository and is not covered by this license.
