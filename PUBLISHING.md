# Publishing without publishing source

## Packaging: what ships in the `.vsix`

Before this change, `.vscodeignore` already excluded `src/**/*.ts`, but the
compiled output it left in (`out/**/*.js`, produced by plain `tsc`) was
still essentially readable source: TypeScript compiles to JS 1:1 with
original comments and identifier names intact. A comment like
`ensureReady() (CLI install, Docker launch) only ever runs as a side
effect of an actual test run, so...` shipped verbatim in the packaged
extension. `node_modules/fast-xml-parser`'s full source also shipped
alongside it, unbundled.

Now `out/extension.js` is produced by `esbuild.js`, which bundles
`src/extension.ts` and everything it imports (including
`fast-xml-parser`) into one file:

- **Production builds** (`npm run vscode:prepublish`, which `vsce
  package`/`npm run package` trigger automatically) minify with no
  sourcemap: comments are stripped and local variable/function-scoped
  names are shortened.
- `.vscodeignore` now excludes everything under `out/` except
  `out/extension.js` itself (`out/**` + `!out/extension.js`), so no stale
  per-module `.js` file from an old `tsc -p ./` run — or a not-fully-clean
  checkout — can slip back in. `node_modules/**` is excluded too, since
  esbuild bundles dependencies in rather than shipping them separately.
- `.github/workflows/ci.yml` packages for real on every push/PR and greps
  the actual file list (`vsce ls`) for exactly this: `out/extension.js`
  must be present, `src/` must be absent, and nothing else may exist under
  `out/`. This is a regression guard, not a formality — it's what caught
  the stale-file leak during development of this change before it ever
  shipped.

**What this does *not* do**: esbuild's default minification does not
rename class/method/property names (only local variables) — safe default,
since this codebase reads/writes plenty of properties whose names have to
stay real (the `vscode` API surface itself, JSON field names in parsed
JUnit/trace reports). So method names like `installMockymock`
remain fully readable in the shipped bundle even after minification; only
comments, local variable names, and the raw `.ts` files are gone. This is
minification, not obfuscation. Going further (property mangling, control-flow
obfuscation) is possible but risks silently breaking `vscode`-API calls or
report-parsing logic without much more test coverage than exists today —
left as a deliberate non-goal here.

## The CLI auto-bootstrap

Every published `.vsix` already bundles a platform-specific `mockymock`
binary under `bin/` (see `build-and-release.yml` in this repo, and
`mockymock.executablePath`'s default resolution) — most users never hit
any bootstrap logic at all.

`EnvironmentManager.installMockymock()` only runs when that bundled binary
can't be found (e.g. a dev-mode install, or a platform the build doesn't
cover). It has one fallback:

```
uv tool install "mockymock>=<MOCKYMOCK_CLI_VERSION>"
```

That installs a released CLI from PyPI (the `mockymock` project), so it
needs Python and `uv` but no git checkout and no GitHub credentials. The
version floor is `MOCKYMOCK_CLI_VERSION` in `src/environment/cliPackage.ts`:
the CLI release this extension is built and contract-tested against.

## Which CLI release the extension uses

`MOCKYMOCK_CLI_VERSION` is the one place to bump. CI's `cli-contract` job
and `build-and-release.yml` both install `mockymock==<that version>` from
PyPI by default, and `cliPackage.test.ts` fails if either workflow's
default drifts from the constant, so a bump touches all three together.
Overrides that don't move the pin:

- `cli-contract`: the `MOCKYMOCK_VERSION` repository variable.
- `build-and-release.yml`: the `mockymock_version` dispatch input.

The bundled binaries are compiled by `scripts/build-cli.sh` from that PyPI
install (plus the newest `cobol-parser` the release allows), so neither
workflow clones `mocky-mock` or needs `ORG_PAT`.

## Bundled GnuCOBOL

The linux-x64 and win32-x64 vsix files carry a GnuCOBOL 3.2 tree under
`gnucobol/`. Linux: a relocatable tree built by `scripts/build-gnucobol.sh`
in the `build-gnucobol` job of `build-and-release.yml` (inside `debian:11`,
so it runs on any Linux with glibc 2.31 or newer). Windows: the build the
Chocolatey `gnucobol` package (3.2.0.20240515) installs, Arnold Trembley's
32-bit MinGW GC32-BDB, fetched by `scripts/fetch-gnucobol-windows.sh` in the
`fetch-gnucobol-windows` job from the same URL and SHA-256 the package's
`chocolateyinstall.ps1` pins (the binaries are not inside the nupkg, which
is a 4 KB wrapper script). It carries its own gcc 9.2, gcov and gdb, so a
Windows user installs nothing; it is about 165 MB unpacked (34 MB
compressed). Verified on Windows 11 on 2026-10-25: compile, run, coverage,
mutate and the debugger all work natively, and Smart App Control did not
block compiled test binaries. At activation `src/environment/bundledToolchain.ts`
sets `MOCKYMOCK_GNUCOBOL_HOME` to it and `MOCKYMOCK_TOOLCHAIN=native` on the
extension host's environment, which every CLI spawn and the debug adapter
inherit; mocky-mock's `runtime/native_toolchain.py` then compiles and runs
there instead of in Docker. Nothing in the tree is patched for its new
location: cobc's and libcob's baked-in paths all have environment overrides,
and the CLI sets them.

The extension only uses the tree with a CLI whose `setup --help` mentions
`MOCKYMOCK_GNUCOBOL_HOME` (`supportsNativeToolchain` in `checks.ts`). An
older CLI ignores the variable, so with one of those the extension keeps
doing the Docker check. **So the tree only takes effect once
`MOCKYMOCK_CLI_VERSION` names a mocky-mock release with the native
backend.**

### Licensing obligations

| Component | License | What we ship |
|-----------|---------|--------------|
| cobc (compiler) | GPL-3.0-or-later | binary |
| libcob (runtime) | LGPL-3.0-or-later | shared library |
| GMP | LGPL-3.0-or-later / GPL-2.0-or-later | shared library + `gmp.h` |
| Berkeley DB 5.3 (Linux) | Sleepycat (GPL-compatible copyleft) | shared library |
| Berkeley DB 18.1 (Windows) | AGPL-3.0 | DLL |
| MinGW gcc, binutils, gdb (Windows) | GPL-3.0-or-later (runtime: permissive) | binaries |
| cJSON (Windows) | MIT | DLL |

Shipping GPL binaries needs the license texts (in `gnucobol/licenses/`) and
the corresponding source. The release job attaches the exact
`gnucobol-3.2.tar.xz` the tree was built from to the same GitHub release as
the vsix files (GPLv3 §6(d): equivalent access from the same place);
GnuCOBOL is unmodified, built with the configure flags in the script.
GMP and Berkeley DB are Debian's own packages, unmodified;
`gnucobol/README.txt` points at their Debian source (attaching those
tarballs to the release too would be the belt-and-braces option). They ship
as separate shared libraries, so a user can swap them, as the LGPL asks. The extension itself is GPL-3.0-only and the
CLI AGPL-3.0, both compatible; the bundled tree is a separate program the
extension runs, not linked into it. COBOL programs a user compiles link
libcob dynamically, which the LGPL allows for any license.

The Windows tree is a third-party binary build, unmodified. Its own
archive carries only GnuCOBOL's GPL/LGPL/FDL texts, so the notices for every
other component it ships live in `licenses/gnucobol-windows/` and the script
copies them into `gnucobol/licenses/`. Its `README.txt` lists each component
with the version the build reports (GMP 6.2.1, Berkeley DB 18.1.40, MinGW.org
GCC 9.2.0, binutils 2.32, gdb 7.6.1, mingwrt/w32api 5.4.2, cJSON 1.7.14,
PDCursesMod 4.3.7, gettext 0.18.3, plus libiconv, expat, zlib, bzip2, MPFR,
MPC, ISL), its license, and its upstream source. The source is linked rather
than attached; attaching the GCC, binutils, gdb, GMP and Berkeley DB tarballs
to each release would be the stricter reading of GPLv3 §6 and the AGPL, and is
a one-step addition to the release job if wanted. The AGPL on Berkeley DB is
compatible with the extension's GPL-3.0 and the CLI's AGPL-3.0. XML PARSE/GENERATE do not compile with this build (no
libxml2).

### Not bundled yet

- **macOS (arm64, x64).** Same script shape, built on the macOS runners from
  Homebrew's `gmp` and `berkeley-db@5`, with `install_name_tool` pointing
  libcob at `@loader_path` copies of both. The C compiler is Xcode's command
  line tools (`xcode-select --install`), which Check Setup already names.
  Debugging needs `gdb`, which macOS does not ship (lldb only).
- **macOS stays on Docker** (Samuel's call, 2026-10-25).
- **Linux arm64.** Needs an arm64 runner (or QEMU) and a `linux-arm64`
  vsix target, which the release does not build at all today.
