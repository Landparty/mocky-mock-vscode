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
