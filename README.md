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

- **COBOL Boundaries view** — a sidebar tree of every external boundary
  (CALL, SQL/CICS/IMS DL/I, file I/O, ACCEPT) the active `.cbl` touches, with
  seed/placeholder checkboxes and one-click generation of a runnable, seeded
  `.cut` scaffold via `mockymock generate --with-data`.
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
  (Interactive) needs the `debug` subcommand; Export Mainframe-Ready COBOL
  needs the `export` subcommand. An older CLI degrades to a clear message
  on the one feature it affects rather than failing anything else.
- Docker (mockymock compiles and runs COBOL in its `mockymock-cobc`
  container). If Docker Desktop is installed but not running, the extension
  starts it automatically before your first run/lint and waits for it to
  become ready — no need to launch it yourself. If Docker isn't installed at
  all, you'll get a prompt linking to the Docker Desktop download page.
- VS Code ≥ 1.88.

## COBOL Boundaries view

A sidebar tree view (Explorer panel, "COBOL Boundaries") that lists every
external boundary the active `.cbl` file touches — CALLs to other programs,
SQL/CICS/IMS DL/I, file I/O (OPEN/READ/WRITE/...), and console ACCEPT —
grouped by the paragraph that touches them, each with its data direction
(`→ IN` / `← OUT` / `↔ BIDI` / `STATUS`) and resolved record layout. Check
which boundaries should get realistic generated data, then run **Generate
.cut** (play icon, view title bar) to produce a runnable, seeded test
scaffold.

**Data source.** The view is driven entirely by `mockymock fixtures
<file.cbl> --scenarios <mode> [--seed N] [--copybook-path ...]`, which prints
a `FixtureBundle` (JSON) describing every scenario's mocked boundaries. The
extension owns no COBOL knowledge of its own — it renders exactly what the
bundle says, verbatim. Only `bundle_version 1` is understood; anything else
(an older or newer CLI) shows an error node instead of a guessed tree.

**Checkbox = seed vs. placeholder.** Every boundary in a generated `.cut` is
always mocked — the scaffold is runnable by construction — the checkbox only
decides the mock's *body*:

- **Checked** (default): the mock body is filled with the bundle's own
  generated data (realistic values, read sequences, `AT END` handling).
- **Unchecked**: the mock gets the ordinary placeholder body instead
  (passed as `--placeholder CATEGORY:KEY` to `generate --with-data`) — still
  mocked, just without generated data. Anything downstream that depended on
  the boundary's full data sequence is recomputed accordingly — for example
  a `VERIFY ... WAS CALLED N TIMES` count on a multi-row `READ` loop
  collapses to a single terminal call once that `READ` is downgraded.

A checkbox is linked by `CATEGORY:KEY` across every paragraph the same
boundary recurs in — unchecking one occurrence unchecks all of them,
matching the granularity `--placeholder` itself uses. Checkbox state
persists per `.cbl` file across sessions.

**Output-only (not seeded).** A boundary the program only ever produces
output to — a `WRITE`/`REWRITE`, or an SQL `INSERT`/`UPDATE`/`DELETE` — has
nothing to mock (the program supplies that value, so it's asserted on
instead), so it never gets a checkbox row under a paragraph. These still
list under a separate "Output-only (not seeded)" node at the bottom of the
tree, so the view stays an inventory of everything the program touches, not
just what it can seed. One known gap: a `CALL`/`DYNCALL` whose arguments are
*all* `OUT`-direction has the same "nothing to mock" shape but isn't listed
here — the CLI doesn't emit a boundary-level marker for that case, only
per-argument ones the extension can't yet attribute back to a category/key.

**Scenario mode.** The gear icon in the view's title bar opens a picker for
which scenario set to fetch:

- `happy` (default) — one unconstrained, layout-valid scenario.
- `branches` — one scenario per reachable, satisfiable branch arm.
- `all` — `branches` plus fixed empty-input / error-status / boundary-value
  families.

Changing the mode re-fetches the bundle and rebuilds the tree.

**Generate .cut.** The play icon prompts for an optional integer seed
(leave blank to let the CLI draw one — no `--seed` flag is sent in that
case, and the seed the CLI drew is shown in an information message
afterward so the run is replayable) and writes `<stem>.cut` next to the
`.cbl`. If that file already
exists you're asked to **Overwrite**, **Write `<stem>.generated.cut`**
instead, or **Cancel**. A successful generate refreshes the tree, opens the
new file, and — depending on what the CLI printed — surfaces two different
kinds of message: a *warning* for anything that went sideways with the
invocation itself (e.g. an unmatched `--placeholder` that didn't correspond
to any fixture), and an *informational* note for routine facts about the
program's own shape (e.g. a boundary point the CLI can't mock, or a
`STOP RUN`/`GOBACK` site). Full detail for both — plus anything a failing
run printed — lands in the "mockymock boundaries" output channel (View →
Output).

**When it's not available.** A non-`.cbl`/`.cob` active editor shows a
welcome node ("Open a .cbl file to list its boundaries"). If `mockymock`
can't produce a bundle (parse failure, missing copybook, or a CLI too old to
have the `fixtures` subcommand), the view shows an error node with the CLI's
own message instead of an empty or guessed tree, plus a "Show output" child
with the full stderr.

Requires a `mockymock` CLI new enough to have the `fixtures` subcommand and
`generate --with-data`; an older CLI shows the error node with the CLI's own
"invalid choice: 'fixtures'" message rather than a blank view.

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
